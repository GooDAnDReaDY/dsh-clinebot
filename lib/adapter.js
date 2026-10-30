/**
 * ClineBot provider adapter for DSH's `ctx.llm` seam.
 *
 * The adapter replaces the previous `llm-pi-ai` + loopback-proxy transport for
 * DSH chat. It owns the OpenAI-compatible wire call, multi-account rotation,
 * pre-first-token failover, usage accounting, and model metadata.
 */

import { LlmAdapter, LlmError, ReasoningEffortId } from '@deepseek-ai/dsh-llm'
import { publicConfig } from './config.js'
import { getAllModels, findModel, formatModelDescription } from './models.js'
import { resolveAccountPool } from './account-pool.js'
import { resolveSessionAccount, markAccountCooldown } from './session-router.js'
import { recordAttemptTelemetry } from './adapter-telemetry.js'
import { getBudgetSpend } from './stats-storage.js'
import { budgetStatus, budgetErrorMessage } from './budget.js'
import { buildOpenAiPayload } from './adapter-messages.js'
import { optimizePromptCacheAndBudget } from './multimodal-budget.js'
import { makeRequestBody } from './adapter-body.js'
import { streamJsonCompletion, streamOpenAiChunks } from './adapter-stream.js'
import {
  abortError,
  classifyUpstreamStatus,
  isAbortError,
  isEventStream,
  readResponseText,
  readSseEvents,
  requestChatCompletion,
} from './transport/cline-transport.js'

const PROVIDER_NAME = 'ClineBot (ClinePass)'
const DEFAULT_CONTEXT_WINDOW = 200000
const DEFAULT_MAX_TOKENS = 8192
const COOLDOWN_MS = 60000
const CREDIT_COOLDOWN_MS = 5 * 60 * 1000

/**
 * Yield one already-consumed item before the rest of an async iterator.
 * @template T
 * @param {T} first
 * @param {AsyncIterator<T> | AsyncIterable<T>} rest
 * @returns {AsyncGenerator<T>}
 */
async function* prependAsync(first, rest) {
  yield first
  for await (const item of rest) yield item
}

/**
 * Whether a chunk carries the first model-visible token.
 * @param {Record<string, unknown>} chunk
 * @returns {boolean}
 */
function isContentChunk(chunk) {
  return chunk?.type === 'text-delta'
    || chunk?.type === 'reasoning-delta'
    || chunk?.type === 'tool-call-delta'
}

/**
 * Read a `Retry-After` header as milliseconds.
 * @param {Headers | undefined} headers
 * @returns {number | undefined}
 */
function retryAfterMs(headers) {
  const raw = headers?.get?.('retry-after')
  if (!raw) return undefined
  const seconds = Number(raw)
  return Number.isFinite(seconds) && seconds > 0 ? Math.round(seconds * 1000) : undefined
}

/**
 * Normalize the catalogue's reasoning-effort representation into a clean list.
 * @param {unknown} value
 * @returns {string[]}
 */
function reasoningEfforts(value) {
  if (Array.isArray(value)) {
    return value.map((entry) => String(entry || '').trim().toLowerCase()).filter(Boolean)
  }
  if (value && typeof value === 'object') {
    return Object.keys(value).map((entry) => String(entry || '').trim().toLowerCase()).filter(Boolean)
  }
  return []
}

/**
 * Human label for a reasoning effort id.
 * @param {string} id
 * @returns {string}
 */
function reasoningLabel(id) {
  if (id === 'low') return 'Low'
  if (id === 'medium') return 'Medium'
  if (id === 'high') return 'High'
  if (id === 'max') return 'Max'
  if (id === 'minimal') return 'Minimal'
  return id
}

/**
 * Read the attachment service defensively.
 * @param {object | undefined} ctx
 * @returns {unknown}
 */
function attachmentStore(ctx) {
  try {
    return ctx?.get?.('attachments') || ctx?.attachments
  } catch {
    return undefined
  }
}

export class ClineBotAdapter extends LlmAdapter {
  /**
   * @param {{
   *   ctx: object,
   *   live: () => Record<string, unknown>,
   *   resolveAttachments?: () => unknown,
   *   logger?: { warn?: Function, info?: Function },
   * }} deps
   */
  constructor({ ctx, live, resolveAttachments, logger }) {
    super()
    this.ctx = ctx
    this.live = live
    this.resolveAttachments = resolveAttachments
    this.logger = logger
  }

  /** @param {string} provider */
  providerInfo(provider) {
    return { id: provider, name: PROVIDER_NAME }
  }

  /** @param {string} _provider */
  providerRetryPolicy(_provider) {
    return {
      mode: 'normal',
      maxRetries: 1,
      retryableCodes: ['RATE_LIMIT', 'TRANSPORT_ERROR', 'PROVIDER_ERROR'],
      backoff: { initialDelayMs: 500, maxDelayMs: 5000, jitterRatio: 0.1 },
    }
  }

  /**
   * @param {string} provider
   * @returns {Promise<Array<Record<string, unknown>>>}
   */
  async listModels(provider) {
    const pub = publicConfig(this.live())
    const all = getAllModels(pub.dynamicModels, pub.modelContextOverrides, pub.customModels)
    const disabled = new Set(pub.disabledModels || [])
    const visible = new Set(pub.visibleModels || [])
    return all
      .filter((model) => model && model.id)
      .filter((model) => !disabled.has(model.id))
      .filter((model) => visible.size === 0 || visible.has(model.id))
      .filter((model) => !pub.filterModelsByPlan || model.inPlan !== false)
      .map((model) => ({
        provider,
        id: model.id,
        name: model.name || model.id,
        description: formatModelDescription(model),
        inputModalities: model.input?.includes('image') ? ['text', 'image'] : ['text'],
      }))
  }

  /**
   * @param {string} provider
   * @param {string} model
   * @param {AbortSignal} [_signal]
   * @returns {Promise<Record<string, unknown>>}
   */
  async resolveModel(provider, model, _signal) {
    return this.resolveModelFromConfig(this.live(), provider, model)
  }

  /**
   * @param {Record<string, unknown>} cfg
   * @param {string} provider
   * @param {string} model
   * @returns {Record<string, unknown>}
   */
  resolveModelFromConfig(cfg, provider, model) {
    const pub = publicConfig(cfg)
    const found = findModel(model, pub.dynamicModels, pub.modelContextOverrides, pub.customModels)
    const info = {
      provider,
      id: model,
      name: found?.name || model,
      ...(found?.description ? { description: formatModelDescription(found) } : {}),
      inputModalities: found?.input?.includes('image') ? ['text', 'image'] : ['text'],
      context: {
        contextWindow: Number.isFinite(Number(found?.contextLength)) && Number(found.contextLength) > 0
          ? Number(found.contextLength)
          : DEFAULT_CONTEXT_WINDOW,
      },
      defaultMaxTokens: Number.isFinite(Number(found?.maxTokens)) && Number(found.maxTokens) > 0
        ? Number(found.maxTokens)
        : DEFAULT_MAX_TOKENS,
    }

    const efforts = reasoningEfforts(found?.reasoningEfforts)
    if (efforts.length > 0) {
      const defaultEffort = String(pub.modelReasoningDefaults?.[model] || '').trim().toLowerCase()
      info.reasoning = {
        efforts: efforts.map((id) => ({ id: ReasoningEffortId(id), name: reasoningLabel(id) })),
        ...(efforts.includes(defaultEffort) ? { defaultEffort: ReasoningEffortId(defaultEffort) } : {}),
      }
    }
    return info
  }

  /**
   * @param {string} provider
   * @param {string} model
   * @param {AbortSignal} [signal]
   * @returns {Promise<{ model: Record<string, unknown>, stream: (options: Record<string, unknown>) => AsyncIterable<Record<string, unknown>> }>}
   */
  async prepareCall(provider, model, signal) {
    signal?.throwIfAborted?.()
    const cfg = this.live()
    const info = this.resolveModelFromConfig(cfg, provider, model)
    return {
      model: info,
      stream: (options) => this.streamWithConfig(options, cfg),
    }
  }

  /**
   * @param {Record<string, unknown>} options
   * @returns {AsyncIterable<Record<string, unknown>>}
   */
  stream(options) {
    return this.streamWithConfig(options, this.live())
  }

  /**
   * @param {Record<string, unknown>} options
   * @param {Record<string, unknown>} cfg
   * @returns {AsyncGenerator<Record<string, unknown>>}
   */
  async *streamWithConfig(options, cfg) {
    const pub = publicConfig(cfg)
    if (!pub.enabled) {
      throw new LlmError('ClineBot provider is disabled', 'PROVIDER_DISABLED')
    }
    const budget = budgetStatus(pub, getBudgetSpend())
    if (budget.blocked) {
      throw new LlmError(budgetErrorMessage(budget), 'BUDGET_EXCEEDED')
    }

    const signal = options.signal
    const sessionId = options.sessionId ? String(options.sessionId) : ''
    const model = String(options.model || pub.defaultModel || '')
    const pool = await resolveAccountPool(this.ctx, cfg)
    const configured = pool.filter((account) => account && account.present && account.value)
    if (configured.length === 0) {
      throw new LlmError(
        'No ClinePass API keys are configured. Add a key in Settings -> ClineBot.',
        'MISSING_CREDENTIAL',
      )
    }

    const attachments = this.resolveAttachments
      ? this.resolveAttachments()
      : attachmentStore(this.ctx)
    const maxPayloadBytes = Number(pub.maxPayloadMb || 40) * 1024 * 1024
    let optimized = optimizePromptCacheAndBudget(options.messages, {
      offloadSeenImages: pub.offloadSeenImages,
      maxPayloadBytes,
    })
    const requestOptions = { ...options, offloadedImages: optimized.offloadedCount }
    let payload = await buildOpenAiPayload({
      ...options,
      messages: optimized.messages,
      model,
      signal,
    }, { attachments })

    const found = findModel(model, pub.dynamicModels, pub.modelContextOverrides, pub.customModels)
    const modelMax = Number.isFinite(Number(found?.maxTokens)) && Number(found.maxTokens) > 0
      ? Number(found.maxTokens)
      : DEFAULT_MAX_TOKENS
    const requestedMax = Number.isFinite(Number(options.maxTokens)) && Number(options.maxTokens) > 0
      ? Number(options.maxTokens)
      : undefined
    let maxTokens
    if (pub.maxOutputTokens === 0) {
      // Explicit zero is the "omit max_tokens" sentinel.
      maxTokens = undefined
    } else if (Number.isFinite(Number(pub.maxOutputTokens)) && Number(pub.maxOutputTokens) > 0) {
      maxTokens = Math.min(requestedMax ?? modelMax, Number(pub.maxOutputTokens), modelMax)
    } else {
      maxTokens = Math.min(requestedMax ?? modelMax, modelMax)
    }

    const reasoningEffort = options.reasoningEffort
      ? String(options.reasoningEffort)
      : (pub.modelReasoningDefaults?.[model] || undefined)

    let body = makeRequestBody({ model, payload, maxTokens, temperature: options.temperature, stop: options.stop, reasoningEffort, sessionId })
    if (Buffer.byteLength(JSON.stringify(body), 'utf8') > maxPayloadBytes) {
      const allImagesOffloaded = optimizePromptCacheAndBudget(optimized.messages, {
        offloadSeenImages: false,
        maxPayloadBytes: 0,
      })
      if (allImagesOffloaded.offloadedCount > 0) {
        optimized = allImagesOffloaded
        requestOptions.offloadedImages += allImagesOffloaded.offloadedCount
        payload = await buildOpenAiPayload({
          ...options,
          messages: optimized.messages,
          model,
          signal,
        }, { attachments })
        body = makeRequestBody({ model, payload, maxTokens, temperature: options.temperature, stop: options.stop, reasoningEffort, sessionId })
      }
    }
    if (Buffer.byteLength(JSON.stringify(body), 'utf8') > maxPayloadBytes) {
      throw new LlmError('ClinePass request is too large after image offload. Start a new session or reduce messages and tools.', 'REQUEST_TOO_LARGE')
    }

    const extraHeaders = sessionId
      ? { 'x-dsh-session-id': sessionId, 'x-session-id': sessionId }
      : {}

    const maxAttempts = configured.length
    let lastError = null

    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      if (signal?.aborted) throw abortError()
      const route = resolveSessionAccount(
        sessionId,
        pool,
        pub.activeAccount,
        pub.accountMode,
        model,
        pub.modelRoutes,
      )
      const account = route.account
      if (!account?.value) {
        lastError = new LlmError('No available ClinePass API key for this session', 'MISSING_CREDENTIAL')
        continue
      }
      const accountId = account.apiKeyEnv || account.id || account.label
      const startedAt = Date.now()
      let ttftMs = null
      let usage = null

      let response
      try {
        response = await requestChatCompletion({
          baseUrl: pub.baseUrl,
          apiKey: account.value,
          body,
          signal,
          connectTimeoutMs: pub.timeoutMs,
          extraHeaders,
        })
      } catch (error) {
        if (isAbortError(error) || signal?.aborted) throw abortError()
        lastError = this.transportError(error, 'ClinePass connection failed')
        if (attempt + 1 < maxAttempts) {
          markAccountCooldown(accountId, COOLDOWN_MS, null, 'upstream_timeout')
          continue
        }
        throw lastError
      }

      if (!response.ok) {
        const text = await readResponseText(response, {
          idleTimeoutMs: Math.min(pub.timeoutMs || 5000, 5000),
        }).catch(() => '')
        const classified = classifyUpstreamStatus(response.status, text)
        const retryAfter = retryAfterMs(response.headers)
        lastError = new LlmError(classified.message, classified.code, {
          status: response.status,
          ...(retryAfter ? { providerRetryAfterMs: retryAfter } : {}),
        })
        if (classified.retryable && attempt + 1 < maxAttempts) {
          const isCredit = classified.code === 'INSUFFICIENT_CREDITS'
          markAccountCooldown(
            accountId,
            isCredit ? CREDIT_COOLDOWN_MS : (retryAfter || COOLDOWN_MS),
            isCredit ? null : (retryAfter ? Date.now() + retryAfter : null),
            isCredit ? 'insufficient_credits' : `upstream_${response.status}`,
            isCredit ? model : '',
          )
          continue
        }
        throw lastError
      }

      const onUsage = (nextUsage) => {
        usage = nextUsage
      }
      const onFirstToken = () => {
        if (ttftMs === null) ttftMs = Date.now() - startedAt
      }

      let clientCommitted = false
      try {
        if (isEventStream(response)) {
          const events = readSseEvents(response, {
            signal,
            idleTimeoutMs: pub.streamIdleTimeoutMs,
          })
          const first = await events.next()
          if (first.done) {
            throw new LlmError('ClinePass returned an empty stream', 'EMPTY_RESPONSE')
          }
          const firstEvent = first.value
          if (firstEvent && typeof firstEvent === 'object' && 'error' in firstEvent) {
            const providerError = firstEvent.error || {}
            throw new LlmError(
              String(providerError.message || 'ClinePass stream returned an error'),
              String(providerError.code || 'PROVIDER_ERROR'),
              Number.isFinite(Number(providerError.status)) ? { status: Number(providerError.status) } : {},
            )
          }
          if (firstEvent && typeof firstEvent === 'object' && firstEvent.done === true) {
            throw new LlmError('ClinePass returned an empty stream', 'EMPTY_RESPONSE')
          }

          const iterator = streamOpenAiChunks(
            prependAsync(firstEvent, events),
            { signal, onUsage, onFirstToken },
          )
          const buffered = []
          let committed = false
          let terminal = null
          while (true) {
            const next = await iterator.next()
            if (next.done) break
            buffered.push(next.value)
            if (isContentChunk(next.value)) {
              committed = true
              break
            }
            if (next.value?.type === 'finish') {
              terminal = next.value
              break
            }
          }

          if (!committed) {
            const failure = terminal?.reason?.failure
            throw new LlmError(
              String(failure?.message || 'ClinePass returned no content before finishing'),
              String(failure?.code || 'EMPTY_RESPONSE'),
            )
          }

          for (const chunk of buffered) {
            clientCommitted = true
            yield chunk
          }
          for await (const chunk of iterator) {
            clientCommitted = true
            yield chunk
          }

          this.recordAttempt({
            pub,
            accountId,
            model,
            usage,
            isError: false,
            ttftMs,
            latencyMs: Date.now() - startedAt,
            options: requestOptions,
          })
          return
        }

        // Fallback for deployments that ignore `stream: true`.
        const text = await readResponseText(response, {
          idleTimeoutMs: pub.streamIdleTimeoutMs,
          signal,
        })
        let json
        try {
          json = JSON.parse(text)
        } catch {
          throw new LlmError('ClinePass returned a non-JSON completion', 'PROVIDER_ERROR')
        }
        let committed = false
        for await (const chunk of streamJsonCompletion(json, { onUsage, onFirstToken })) {
          if (isContentChunk(chunk)) committed = true
          clientCommitted = true
          yield chunk
        }
        if (!committed) {
          throw new LlmError('ClinePass returned an empty completion', 'EMPTY_RESPONSE')
        }
        this.recordAttempt({
          pub,
          accountId,
          model,
          usage,
          isError: false,
          ttftMs,
          latencyMs: Date.now() - startedAt,
          options: requestOptions,
        })
        return
      } catch (error) {
        if (isAbortError(error) || signal?.aborted) {
          this.recordAttempt({
            pub,
            accountId,
            model,
            usage,
            isError: true,
            ttftMs,
            latencyMs: Date.now() - startedAt,
            options: requestOptions,
            aborted: true,
          })
          throw abortError()
        }
        const normalized = error instanceof LlmError
          ? error
          : this.transportError(error, 'ClinePass stream failed')
        const retryable = normalized.code === 'RATE_LIMIT'
          || normalized.code === 'PROVIDER_ERROR'
          || normalized.code === 'TRANSPORT_ERROR'
          || normalized.code === 'EMPTY_RESPONSE'
          || normalized.code === 'INSUFFICIENT_CREDITS'
          || normalized.code === 'QUOTA_EXCEEDED'
        lastError = normalized
        if (retryable && !clientCommitted && attempt + 1 < maxAttempts) {
          const isCredit = normalized.code === 'INSUFFICIENT_CREDITS'
          markAccountCooldown(
            accountId,
            isCredit ? CREDIT_COOLDOWN_MS : COOLDOWN_MS,
            null,
            isCredit ? 'insufficient_credits' : 'upstream_pre_token_error',
            isCredit ? model : '',
          )
          continue
        }
        this.recordAttempt({
          pub,
          accountId,
          model,
          usage,
          isError: true,
          is429: normalized.code === 'RATE_LIMIT',
          ttftMs,
          latencyMs: Date.now() - startedAt,
          options: requestOptions,
        })
        throw normalized
      }
    }

    throw lastError || new LlmError('All ClinePass accounts failed', 'PROVIDER_ERROR')
  }

  /**
   * Convert an unknown transport failure into `LlmError`.
   * @param {unknown} error
   * @param {string} fallbackMessage
   * @returns {LlmError}
   */
  transportError(error, fallbackMessage) {
    const message = String(error?.message || error || fallbackMessage)
    const code = String(error?.code || 'TRANSPORT_ERROR')
    return new LlmError(message, code === 'CONNECT_TIMEOUT' ? 'TRANSPORT_ERROR' : code)
  }

  /**
   * Record one attempt's session and persistent telemetry.
   * @param {{
   *   pub: Record<string, unknown>,
   *   accountId: string,
   *   model: string,
   *   usage: ReturnType<typeof import('./transport/cline-transport.js').extractUsage> | null,
   *   isError: boolean,
   *   is429?: boolean,
   *   ttftMs: number | null,
   *   latencyMs: number,
   *   aborted?: boolean,
   *   options: Record<string, unknown>,
   * }} entry
   */
  recordAttempt(entry) {
    recordAttemptTelemetry({
      ...entry,
      offloadedImages: entry?.options?.offloadedImages || 0,
    })
  }
}

