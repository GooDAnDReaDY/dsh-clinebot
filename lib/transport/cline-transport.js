/**
 * ClinePass OpenAI-compatible transport primitives.
 *
 * This module owns the wire boundary: request construction helpers, SSE framing,
 * usage extraction, timeout/abort handling, and provider error classification.
 * It intentionally contains no account routing or DSH adapter policy.
 */

import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
let packageVersion = '0.6.4'
try {
  packageVersion = require('../../package.json').version || packageVersion
} catch {
  /* fallback when package.json is unavailable */
}

export const USER_AGENT = `@goodandready/dsh-clinebot/${packageVersion}`
export const DEFAULT_CONNECT_TIMEOUT_MS = 15000
export const DEFAULT_STREAM_IDLE_TIMEOUT_MS = 30000
export const DEFAULT_MAX_BODY_BYTES = 10 * 1024 * 1024

/**
 * Build the abort-shaped error every transport caller understands.
 * @param {string} [message]
 * @returns {Error}
 */
export function abortError(message = 'Request aborted') {
  const error = new Error(message)
  error.name = 'AbortError'
  error.code = 'ABORTED'
  return error
}

/**
 * @param {unknown} error
 * @returns {boolean}
 */
export function isAbortError(error) {
  return Boolean(error && (error.name === 'AbortError' || error.code === 'ABORTED'))
}

/**
 * Normalize an OpenAI-compatible usage payload into DSH's disjoint token buckets.
 *
 * `prompt_tokens` includes cached input, while DSH expects `inputTokens` to be
 * uncached input only. Cache read/write buckets are reported separately.
 *
 * @param {Record<string, unknown>} usage
 * @returns {{ inputTokens: number, outputTokens: number, totalTokens?: number, cacheReadTokens?: number, cacheWriteTokens?: number, reasoningTokens?: number, promptTokens: number, completionTokens: number }}
 */
export function extractUsage(usage) {
  if (!usage || typeof usage !== 'object') {
    return { inputTokens: 0, outputTokens: 0, promptTokens: 0, completionTokens: 0 }
  }
  const promptTokens = Math.max(0, Number(usage.prompt_tokens) || 0)
  const completionTokens = Math.max(0, Number(usage.completion_tokens) || 0)
  const cacheReadTokens = Math.max(0, Number(
    usage.prompt_tokens_details?.cached_tokens ||
    usage.cache_read_input_tokens ||
    usage.cached_tokens ||
    0
  ))
  const cacheWriteTokens = Math.max(0, Number(
    usage.prompt_tokens_details?.cache_write_tokens ||
    usage.cache_creation_input_tokens ||
    0
  ))
  const reasoningTokens = Math.max(0, Number(
    usage.completion_tokens_details?.reasoning_tokens ||
    usage.reasoning_tokens ||
    usage.prompt_tokens_details?.reasoning_tokens ||
    0
  ))
  const inputTokens = Math.max(0, promptTokens - cacheReadTokens - cacheWriteTokens)
  const totalTokens = Number.isFinite(Number(usage.total_tokens))
    ? Math.max(0, Number(usage.total_tokens))
    : promptTokens + completionTokens

  return {
    inputTokens,
    outputTokens: completionTokens,
    ...(totalTokens > 0 ? { totalTokens } : {}),
    ...(cacheReadTokens > 0 ? { cacheReadTokens } : {}),
    ...(cacheWriteTokens > 0 ? { cacheWriteTokens } : {}),
    ...(reasoningTokens > 0 ? { reasoningTokens } : {}),
    promptTokens,
    completionTokens,
  }
}

/**
 * Classify a non-2xx upstream response into an adapter error code.
 *
 * @param {number} status
 * @param {string} [bodyText]
 * @returns {{ code: string, retryable: boolean, message: string }}
 */
export function classifyUpstreamStatus(status, bodyText = '') {
  const detail = String(bodyText || '').slice(0, 500)
  const lower = detail.toLowerCase()
  if (status === 401 || status === 403) {
    return { code: 'AUTH', retryable: false, message: `ClinePass authentication failed (HTTP ${status})${detail ? `: ${detail}` : ''}` }
  }
  if (status === 429) {
    return { code: 'RATE_LIMIT', retryable: true, message: `ClinePass rate limit exceeded (HTTP 429)${detail ? `: ${detail}` : ''}` }
  }
  if (status === 402 || /quota|credit|usage limit|insufficient/i.test(lower)) {
    return { code: 'QUOTA_EXCEEDED', retryable: true, message: `ClinePass quota exhausted (HTTP ${status})${detail ? `: ${detail}` : ''}` }
  }
  if (status === 400 && /context|too long|maximum context|token limit/i.test(lower)) {
    return { code: 'CONTEXT_WINDOW_EXCEEDED', retryable: false, message: `Context window exceeded (HTTP 400)${detail ? `: ${detail}` : ''}` }
  }
  if (status >= 500) {
    return { code: 'PROVIDER_ERROR', retryable: true, message: `ClinePass upstream error (HTTP ${status})${detail ? `: ${detail}` : ''}` }
  }
  return { code: 'UPSTREAM_ERROR', retryable: false, message: `ClinePass request failed (HTTP ${status})${detail ? `: ${detail}` : ''}` }
}

/**
 * Read a response body with a hard size bound.
 *
 * @param {Response} response
 * @param {{ maxBytes?: number }} [options]
 * @returns {Promise<string>}
 */
export async function readResponseText(response, { maxBytes = DEFAULT_MAX_BODY_BYTES } = {}) {
  if (!response?.body) return ''
  const reader = response.body.getReader()
  const decoder = new TextDecoder('utf8')
  let size = 0
  let out = ''
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > maxBytes) {
        throw new Error(`Upstream response exceeded ${maxBytes} bytes`)
      }
      out += decoder.decode(value, { stream: true })
    }
    out += decoder.decode()
    return out
  } finally {
    try { reader.releaseLock() } catch {}
  }
}

/**
 * Whether a response is an SSE stream.
 * @param {Response} response
 * @returns {boolean}
 */
export function isEventStream(response) {
  return String(response?.headers?.get?.('content-type') || '').toLowerCase().includes('text/event-stream')
}

/**
 * Send one OpenAI-compatible chat completion request.
 *
 * The connect timeout covers headers only; once headers arrive the caller owns
 * the stream and applies its own idle watchdog.
 *
 * @param {{
 *   baseUrl: string,
 *   apiKey: string,
 *   body: Record<string, unknown>,
 *   signal?: AbortSignal,
 *   connectTimeoutMs?: number,
 *   extraHeaders?: Record<string, string>,
 * }} options
 * @returns {Promise<Response>}
 */
export async function requestChatCompletion({
  baseUrl,
  apiKey,
  body,
  signal,
  connectTimeoutMs = DEFAULT_CONNECT_TIMEOUT_MS,
  extraHeaders = {},
}) {
  const connectCtrl = new AbortController()
  let timedOut = false
  const timer = setTimeout(() => {
    timedOut = true
    connectCtrl.abort(abortError(`Upstream connect timeout after ${connectTimeoutMs}ms`))
  }, Math.max(1, Number(connectTimeoutMs) || DEFAULT_CONNECT_TIMEOUT_MS))
  if (typeof timer.unref === 'function') timer.unref()
  const combined = signal
    ? AbortSignal.any([signal, connectCtrl.signal])
    : connectCtrl.signal

  try {
    return await fetch(`${String(baseUrl).replace(/\/+$/, '')}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
        Accept: 'text/event-stream, application/json',
        'User-Agent': USER_AGENT,
        ...extraHeaders,
      },
      body: JSON.stringify(body),
      signal: combined,
      keepalive: true,
    })
  } catch (error) {
    if (timedOut) {
      const timeoutError = new Error(`Upstream connect timeout after ${connectTimeoutMs}ms`)
      timeoutError.code = 'CONNECT_TIMEOUT'
      timeoutError.cause = error
      throw timeoutError
    }
    throw error
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Parse one SSE block's `data:` payload.
 * @param {string} raw
 * @returns {Record<string, unknown> | { done: true } | { raw: string } | undefined}
 */
function parseSseBlock(raw) {
  const lines = String(raw || '').replace(/\r\n/g, '\n').split('\n')
  const dataLines = []
  for (const line of lines) {
    if (!line.startsWith('data:')) continue
    dataLines.push(line.slice(5).replace(/^ /, ''))
  }
  if (dataLines.length === 0) return undefined
  const data = dataLines.join('\n').trim()
  if (data === '') return undefined
  if (data === '[DONE]') return { done: true }
  try {
    return JSON.parse(data)
  } catch {
    return { raw: data }
  }
}

/**
 * Read SSE events from an OpenAI-compatible response as parsed objects.
 *
 * Yields `{ done: true }` for `[DONE]`, parsed JSON objects otherwise, and
 * `{ raw }` for unrecognized non-JSON payloads. Throws an abort-shaped error
 * when the caller signal aborts, and a `STREAM_IDLE_TIMEOUT` error when no
 * bytes arrive for `idleTimeoutMs`.
 *
 * @param {Response} response
 * @param {{ signal?: AbortSignal, idleTimeoutMs?: number }} [options]
 * @returns {AsyncGenerator<Record<string, unknown> | { done: true } | { raw: string }>}
 */
export async function* readSseEvents(response, {
  signal,
  idleTimeoutMs = DEFAULT_STREAM_IDLE_TIMEOUT_MS,
} = {}) {
  if (!response?.body) return
  const reader = response.body.getReader()
  const decoder = new TextDecoder('utf8')
  let buffer = ''

  async function readWithIdle() {
    let timer = null
    try {
      return await Promise.race([
        reader.read(),
        new Promise((_, reject) => {
          timer = setTimeout(() => {
            const error = new Error(`Stream idle timeout after ${idleTimeoutMs}ms`)
            error.code = 'STREAM_IDLE_TIMEOUT'
            reject(error)
          }, Math.max(1, Number(idleTimeoutMs) || DEFAULT_STREAM_IDLE_TIMEOUT_MS))
          if (typeof timer.unref === 'function') timer.unref()
        }),
      ])
    } finally {
      if (timer) clearTimeout(timer)
    }
  }

  try {
    while (true) {
      if (signal?.aborted) {
        try { await reader.cancel('aborted') } catch {}
        throw abortError()
      }
      const { done, value } = await readWithIdle()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      buffer = buffer.replace(/\r\n/g, '\n')
      let boundary = buffer.indexOf('\n\n')
      while (boundary >= 0) {
        const block = buffer.slice(0, boundary)
        buffer = buffer.slice(boundary + 2)
        const parsed = parseSseBlock(block)
        if (parsed !== undefined) yield parsed
        boundary = buffer.indexOf('\n\n')
      }
    }
    buffer += decoder.decode()
    const tail = parseSseBlock(buffer)
    if (tail !== undefined) yield tail
  } catch (error) {
    try { await reader.cancel(error?.message || 'stream error') } catch {}
    if (signal?.aborted) throw abortError()
    throw error
  } finally {
    try { reader.releaseLock() } catch {}
  }
}
