/**
 * Transparent Loopback Proxy & Zero-Downtime Failover (Issues #127, #145, #147, #211, #212)
 *
 * Exposes local OpenAI-compatible endpoints:
 * - POST /dsh-clinebot/v1/chat/completions
 * - GET  /dsh-clinebot/v1/models
 *
 * Implements:
 * 1. Bearer local proxy token verification (Issue #145).
 * 2. Origin & Sec-Fetch-Site rejection to prevent cross-site/browser CSRF attacks (Issue #145).
 * 3. Dynamic User-Agent extraction from package.json (Issue #147).
 * 4. Configurable upstream timeout with multi-account failover and 504 handling (Issue #147).
 * 5. Sticky session routing with least-used and round-robin quota allocation (Issue #211).
 * 6. Pre-first-token failover: commits SSE headers only after first valid token/chunk (Issue #212).
 * 7. Streaming SSE token usage interception & persistent telemetry recording.
 */

import { writeJson, readBody, isLoopbackAddress } from '../http.js'
import { publicConfig, plainConfig } from '../config.js'
import { resolveAccountPool } from '../account-pool.js'
import { resolveSessionAccount, markAccountCooldown } from '../session-router.js'
import { recordUsage } from '../stats-storage.js'
import { getAllModels, DEFAULT_MODEL_ID } from '../models.js'
import {
  getLocalProxyToken,
  hasDisallowedBrowserOrigin,
  isAuthorizedProxyRequest,
  USER_AGENT,
  sendProxyTerminalError,
} from '../proxy-token.js'

export { hasDisallowedBrowserOrigin, isAuthorizedProxyRequest, USER_AGENT }

export function createChatCompletionsHandler(ctx, { live, getSettingsApi, syncProviderState }) {
  return async (req, res) => {
    if (req.method !== 'POST') {
      return writeJson(res, 405, { ok: false, error: 'POST only' })
    }

    if (!isLoopbackAddress(req.socket?.remoteAddress)) {
      return writeJson(res, 403, { ok: false, error: 'Loopback access only' })
    }

    if (hasDisallowedBrowserOrigin(req)) {
      return writeJson(res, 403, { ok: false, error: 'Cross-site or browser requests to proxy are forbidden' })
    }

    const pool = await resolveAccountPool(ctx, live())
    if (!isAuthorizedProxyRequest(req, pool)) {
      return writeJson(res, 401, { ok: false, error: 'Unauthorized: missing or invalid bearer token' })
    }

    let bodyBuf
    try {
      bodyBuf = await readBody(req, 64 * 1024 * 1024)
    } catch (err) {
      return writeJson(res, 400, { ok: false, error: String(err?.message || err) })
    }

    let body
    try {
      body = JSON.parse(bodyBuf.toString('utf8') || '{}')
    } catch {
      return writeJson(res, 400, { ok: false, error: 'Invalid JSON request body' })
    }

    const cfg = plainConfig(live())
    const pub = publicConfig(cfg)

    const h = req.headers || {}
    const sessionId = String(
      h['x-dsh-session-id'] || h['x-session-id'] || h['session-id'] || h['session_id'] ||
      h['x-session-affinity'] || h['x-client-request-id'] ||
      body?.session_id || body?.conversation_id || body?.prompt_cache_key || body?.chat_id || body?.user || ''
    ).trim()

    if (sessionId) {
      if (!body.session_id) body.session_id = sessionId
      if (!body.conversation_id) body.conversation_id = sessionId
    }

    body.model = String(body.model || pub.defaultModel || DEFAULT_MODEL_ID).trim()
    if (pub.modelReasoningDefaults?.[body.model] && !body.reasoning_effort) {
      body.reasoning_effort = pub.modelReasoningDefaults[body.model]
    }

    const isStreaming = Boolean(body.stream)
    const configuredAccounts = pool.filter(a => a.present && a.value)

    const clientAbortCtrl = new AbortController()
    let clientClosed = false
    const onClientClose = () => {
      clientClosed = true
      if (!res.writableFinished) {
        clientAbortCtrl.abort()
      }
    }
    if (typeof res.on === 'function') res.on('close', onClientClose)
    if (typeof req.on === 'function') req.on('close', onClientClose)

    const cleanupClientListeners = () => {
      if (typeof res.off === 'function') res.off('close', onClientClose)
      else if (typeof res.removeListener === 'function') res.removeListener('close', onClientClose)
      if (typeof req.off === 'function') req.off('close', onClientClose)
      else if (typeof req.removeListener === 'function') req.removeListener('close', onClientClose)
    }

    const maxRetries = Math.max(1, configuredAccounts.length)
    let attempt = 0
    let lastError = null
    let hadTimeout = false
    let lastTargetAccount = null
    let lastRetryAfter = null

    while (attempt < maxRetries) {
      attempt += 1

      if (clientAbortCtrl.signal.aborted || clientClosed) {
        cleanupClientListeners()
        return
      }

      const routeResult = resolveSessionAccount(sessionId, pool, pub.activeAccount, pub.accountMode)
      const targetAccount = routeResult.account
      lastTargetAccount = targetAccount

      if (!targetAccount || !targetAccount.value) {
        cleanupClientListeners()
        return writeJson(res, 503, {
          error: {
            message: 'No available ClinePass API keys configured in pool',
            type: 'service_unavailable',
            code: 'no_keys_available'
          }
        })
      }

      const accountId = targetAccount.apiKeyEnv || targetAccount.id || targetAccount.label
      const upstreamUrl = `${pub.baseUrl}/chat/completions`
      const requestHeaders = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${targetAccount.value}`,
        'Accept': isStreaming ? 'text/event-stream' : 'application/json',
        'User-Agent': USER_AGENT
      }

      const connectTimeoutMs = Math.max(50, Number(pub.timeoutMs) || 15000)
      const streamIdleTimeoutMs = Math.max(50, Number(pub.streamIdleTimeoutMs) || 30000)

      const connectAbortCtrl = new AbortController()
      const bodyAbortCtrl = new AbortController()
      let connectTimedOut = false
      const connectTimer = setTimeout(() => {
        connectTimedOut = true
        connectAbortCtrl.abort(new Error(`Upstream connect timeout after ${connectTimeoutMs}ms`))
      }, connectTimeoutMs)

      const fetchSignal = AbortSignal.any([clientAbortCtrl.signal, connectAbortCtrl.signal, bodyAbortCtrl.signal])

      let upstreamRes
      try {
        upstreamRes = await fetch(upstreamUrl, {
          method: 'POST',
          headers: requestHeaders,
          body: JSON.stringify(body),
          signal: fetchSignal,
          keepalive: true
        })
      } catch (fetchErr) {
        clearTimeout(connectTimer)
        if (clientAbortCtrl.signal.aborted || clientClosed) {
          cleanupClientListeners()
          return
        }
        lastError = fetchErr
        const isTimeout = connectTimedOut || connectAbortCtrl.signal.aborted || fetchErr.name === 'TimeoutError' || String(fetchErr).includes('timeout')
        if (isTimeout) {
          hadTimeout = true
          markAccountCooldown(accountId, 60000, null, 'upstream_timeout')
          if (targetAccount.id && targetAccount.id !== accountId) markAccountCooldown(targetAccount.id, 60000, null, 'upstream_timeout')
          ctx?.logger?.warn?.(`[dsh-clinebot:proxy] Account "${accountId}" upstream connect timed out after ${connectTimeoutMs}ms, attempting failover (attempt ${attempt}/${maxRetries})`)
        } else {
          markAccountCooldown(accountId, 60000, null, 'upstream_fetch_error')
          if (targetAccount.id && targetAccount.id !== accountId) markAccountCooldown(targetAccount.id, 60000, null, 'upstream_fetch_error')
          ctx?.logger?.warn?.(`[dsh-clinebot:proxy] Account "${accountId}" connect error (${fetchErr.message}), attempting failover (attempt ${attempt}/${maxRetries})`)
        }
        continue
      }
      clearTimeout(connectTimer)

      if (clientAbortCtrl.signal.aborted || clientClosed) {
        cleanupClientListeners()
        return
      }

      // Pre-first-token failover: check for retryable non-200 responses before sending ANY headers
      if (upstreamRes.status !== 200) {
        const isRateLimit = upstreamRes.status === 429 || upstreamRes.status === 402
        const isServerErr = upstreamRes.status >= 500 && upstreamRes.status <= 599
        const isAuthErr = upstreamRes.status === 401 || upstreamRes.status === 403

        if (isRateLimit || isServerErr || isAuthErr) {
          const reason = isRateLimit ? 'upstream_429' : (isAuthErr ? 'upstream_auth' : `upstream_status_${upstreamRes.status}`)
          markAccountCooldown(accountId, 60000, null, reason)
          if (targetAccount.id && targetAccount.id !== accountId) markAccountCooldown(targetAccount.id, 60000, null, reason)
          lastError = new Error(`Upstream rejected with HTTP ${upstreamRes.status}`)
          lastError.status = upstreamRes.status
          const retryAfter = upstreamRes.headers?.get?.('retry-after')
          if (retryAfter) lastRetryAfter = retryAfter
          if (upstreamRes.body) {
            try {
              if (typeof upstreamRes.body.cancel === 'function') upstreamRes.body.cancel().catch(() => {})
              else if (typeof upstreamRes.body.destroy === 'function') upstreamRes.body.destroy()
            } catch {}
          }
          ctx?.logger?.warn?.(`[dsh-clinebot:proxy] Account "${accountId}" returned HTTP ${upstreamRes.status}, attempting failover (attempt ${attempt}/${maxRetries})`)
          continue
        }

        // Non-retryable client error (e.g. 400 Bad Request)
        cleanupClientListeners()
        const errText = await upstreamRes.text().catch(() => '')
        res.statusCode = upstreamRes.status
        res.setHeader('Content-Type', 'application/json; charset=utf-8')
        res.end(errText || JSON.stringify({ error: { message: `Upstream error ${upstreamRes.status}` } }))
        return
      }

      // Streaming response with pre-first-token buffering (#212)
      if (isStreaming && upstreamRes.status === 200 && upstreamRes.body) {
        const reader = upstreamRes.body.getReader()
        const decoder = new TextDecoder('utf8')

        let firstReadResult = null
        let preTokenError = null

        const ttftAbortCtrl = new AbortController()
        const ttftTimer = setTimeout(() => {
          ttftAbortCtrl.abort(new Error(`TTFT timeout waiting for first stream chunk after ${connectTimeoutMs}ms`))
        }, connectTimeoutMs)

        try {
          const firstReadPromise = reader.read()
          const timeoutPromise = new Promise((_, reject) => {
            ttftAbortCtrl.signal.addEventListener('abort', () => reject(ttftAbortCtrl.signal.reason), { once: true })
          })
          firstReadResult = await Promise.race([firstReadPromise, timeoutPromise])
        } catch (err) {
          preTokenError = err
        } finally {
          clearTimeout(ttftTimer)
        }

        if (clientAbortCtrl.signal.aborted || clientClosed) {
          cleanupClientListeners()
          try { reader.cancel('client aborted').catch(() => {}) } catch {}
          return
        }

        let earlyError = null
        if (!preTokenError && firstReadResult?.value) {
          const textSample = decoder.decode(firstReadResult.value, { stream: true })
          const trimmed = textSample.trim()
          if (trimmed.startsWith('{') && trimmed.includes('"error"')) {
            try {
              const parsed = JSON.parse(trimmed)
              if (parsed.error && !parsed.choices) earlyError = new Error(parsed.error.message || 'Upstream error')
            } catch {}
          } else if (trimmed.startsWith('data:') && trimmed.includes('"error"')) {
            try {
              const parsed = JSON.parse(trimmed.slice(5).trim())
              if (parsed.error && !parsed.choices) earlyError = new Error(parsed.error.message || 'Upstream stream error')
            } catch {}
          }
        } else if (!preTokenError && firstReadResult?.done) {
          earlyError = new Error('Upstream stream completed with zero chunks')
        }

        if (preTokenError || earlyError) {
          if (ttftAbortCtrl.signal.aborted || String(preTokenError?.message).includes('timeout')) hadTimeout = true
          try { reader.cancel('pre-first-token error').catch(() => {}) } catch {}
          markAccountCooldown(accountId, 60000, null, 'upstream_pre_token_error')
          if (targetAccount.id && targetAccount.id !== accountId) markAccountCooldown(targetAccount.id, 60000, null, 'upstream_pre_token_error')
          lastError = preTokenError || earlyError
          ctx?.logger?.warn?.(`[dsh-clinebot:proxy] Account "${accountId}" failed before first token (${lastError.message}), attempting failover (attempt ${attempt}/${maxRetries})`)
          continue
        }

        // First token received: commit headers to client now
        res.statusCode = 200
        res.setHeader('Content-Type', 'text/event-stream; charset=utf-8')
        res.setHeader('Cache-Control', 'no-cache, no-transform')
        res.setHeader('Connection', 'keep-alive')
        if (typeof res.flushHeaders === 'function') {
          res.flushHeaders()
        }

        let promptTokens = 0
        let completionTokens = 0
        let totalTokens = 0
        let buffer = ''
        let streamError = null
        let streamCompletedCleanly = false

        let streamAborted = false
        const onStreamAbort = () => {
          streamAborted = true
          try {
            reader.cancel('client closed response').catch(() => {})
          } catch {}
        }

        if (clientAbortCtrl.signal.aborted || clientClosed) {
          onStreamAbort()
        } else {
          clientAbortCtrl.signal.addEventListener('abort', onStreamAbort, { once: true })
        }

        let idleTimer = null
        let idleTimedOut = false
        const resetIdleTimer = () => {
          if (idleTimer) clearTimeout(idleTimer)
          idleTimer = setTimeout(() => {
            idleTimedOut = true
            streamError = new Error(`Stream idle timeout after ${streamIdleTimeoutMs}ms`)
            try {
              reader.cancel('stream idle timeout').catch(() => {})
            } catch {}
          }, streamIdleTimeoutMs)
        }

        const clearIdleTimer = () => {
          if (idleTimer) {
            clearTimeout(idleTimer)
            idleTimer = null
          }
        }

        const processChunk = (val) => {
          if (!res.destroyed && !res.writableEnded) {
            res.write(val)
          }
          const chunkStr = decoder.decode(val, { stream: true })
          buffer += chunkStr
          const lines = buffer.split('\n')
          buffer = lines.pop() || ''
          for (const line of lines) {
            const trimmed = line.trim()
            if (trimmed.startsWith('data:') && trimmed !== 'data: [DONE]') {
              try {
                const parsed = JSON.parse(trimmed.slice(5).trim())
                if (parsed.usage) {
                  promptTokens = parsed.usage.prompt_tokens || promptTokens
                  completionTokens = parsed.usage.completion_tokens || completionTokens
                  totalTokens = parsed.usage.total_tokens || totalTokens
                }
              } catch {}
            }
          }
        }

        if (firstReadResult?.value) {
          processChunk(firstReadResult.value)
        }

        if (firstReadResult?.done) {
          streamCompletedCleanly = true
        } else {
          try {
            resetIdleTimer()
            while (true) {
              if (streamAborted || clientAbortCtrl.signal.aborted || clientClosed) break
              const { done, value } = await reader.read()
              if (idleTimedOut || streamError) break
              if (done || streamAborted) {
                if (done && !streamAborted && !clientClosed && !idleTimedOut && !streamError) {
                  streamCompletedCleanly = true
                }
                break
              }
              resetIdleTimer()
              processChunk(value)
              if (streamAborted || clientAbortCtrl.signal.aborted || clientClosed) break
            }
          } catch (err) {
            streamError = err
          } finally {
            clearIdleTimer()
          }
        }

        clearIdleTimer()
        clientAbortCtrl.signal.removeEventListener('abort', onStreamAbort)
        cleanupClientListeners()
        try {
          reader.releaseLock()
        } catch {}

        const isStreamFailed = Boolean(streamError || idleTimedOut || clientClosed || clientAbortCtrl.signal.aborted || !streamCompletedCleanly)

        if (!res.destroyed && !res.writableEnded) {
          if (isStreamFailed && (idleTimedOut || streamError)) {
            try {
              const errPayload = JSON.stringify({
                error: {
                  message: streamError?.message || 'Stream interrupted or timed out',
                  type: 'stream_error',
                  code: idleTimedOut ? 'stream_idle_timeout' : 'stream_error'
                }
              })
              res.write(`data: ${errPayload}\n\n`)
            } catch {}
          }
          res.end()
        }

        recordUsage({
          model: body.model,
          accountId: targetAccount.id || targetAccount.label,
          promptTokens,
          completionTokens,
          totalTokens: totalTokens || (promptTokens + completionTokens),
          isError: isStreamFailed,
          statsPath: pub.statsPath
        })
        return
      }

      // Non-streaming JSON response with deadline and failover (#185, #198, #202, #212)
      const bodyTimeoutMs = Math.max(50, Number(pub.timeoutMs) || 15000)
      let bodyTimedOut = false
      let bodyTimer = null
      const bodyTimeoutPromise = new Promise((_, reject) => {
        bodyTimer = setTimeout(() => {
          bodyTimedOut = true
          bodyAbortCtrl.abort(new Error(`Upstream body read timed out after ${bodyTimeoutMs}ms`))
          reject(new Error(`Upstream body read timed out after ${bodyTimeoutMs}ms`))
        }, bodyTimeoutMs)
      })

      const MAX_BODY_BYTES = 10 * 1024 * 1024
      const contentLength = Number(upstreamRes.headers.get('content-length'))
      if (contentLength > MAX_BODY_BYTES) {
        clearTimeout(bodyTimer)
        cleanupClientListeners()
        writeJson(res, 502, { ok: false, error: 'Upstream response exceeded maximum allowed size' })
        return
      }

      let resText = ''
      let readError = null
      try {
        resText = await Promise.race([
          upstreamRes.text(),
          bodyTimeoutPromise,
        ])
        if (resText.length > MAX_BODY_BYTES) {
          throw new Error('Upstream response exceeded maximum allowed size')
        }
      } catch (err) {
        readError = err
      } finally {
        clearTimeout(bodyTimer)
      }

      if (clientAbortCtrl.signal.aborted || clientClosed) {
        cleanupClientListeners()
        return
      }

      if (bodyTimedOut || readError) {
        const isTimeout = bodyTimedOut || bodyAbortCtrl.signal.aborted
        if (isTimeout) hadTimeout = true
        markAccountCooldown(accountId, 60000, null, isTimeout ? 'upstream_timeout' : 'upstream_read_error')
        if (targetAccount.id && targetAccount.id !== accountId) markAccountCooldown(targetAccount.id, 60000, null, isTimeout ? 'upstream_timeout' : 'upstream_read_error')
        lastError = readError || new Error(`Upstream body read timed out after ${bodyTimeoutMs}ms`)
        lastError.code = isTimeout ? 'body_read_timeout' : 'body_read_error'
        ctx?.logger?.warn?.(`[dsh-clinebot:proxy] Account "${accountId}" body read failed (${lastError.message}), attempting failover (attempt ${attempt}/${maxRetries})`)
        continue
      }

      let resJson = null
      try {
        resJson = JSON.parse(resText)
      } catch {
        resJson = null
      }

      if (resJson?.error && !resJson?.choices) {
        markAccountCooldown(accountId, 60000, null, 'upstream_error_payload')
        if (targetAccount.id && targetAccount.id !== accountId) markAccountCooldown(targetAccount.id, 60000, null, 'upstream_error_payload')
        lastError = new Error(resJson.error.message || 'Upstream error response')
        ctx?.logger?.warn?.(`[dsh-clinebot:proxy] Account "${accountId}" returned 200 with error (${lastError.message}), attempting failover (attempt ${attempt}/${maxRetries})`)
        continue
      }

      cleanupClientListeners()
      recordUsage({
        model: body.model,
        accountId: targetAccount.id || targetAccount.label,
        promptTokens: resJson?.usage?.prompt_tokens || 0,
        completionTokens: resJson?.usage?.completion_tokens || 0,
        totalTokens: resJson?.usage?.total_tokens || 0,
        isError: false,
        statsPath: pub.statsPath
      })

      res.statusCode = 200
      res.setHeader('Content-Type', 'application/json; charset=utf-8')
      res.end(resText)
      return
    }

    cleanupClientListeners()
    // Exhausted all retries
    const is429Exhausted = !hadTimeout && (lastError?.status === 429 || lastError?.status === 402)
    recordUsage({
      model: body.model,
      accountId: lastTargetAccount?.id || lastTargetAccount?.label || 'default',
      isError: true,
      is429: is429Exhausted,
      statsPath: pub.statsPath
    })
    return sendProxyTerminalError(res, { hadTimeout, is429Exhausted, lastError, lastRetryAfter })
  }
}

export function createModelsHandler(ctx, { live }) {
  return async (req, res) => {
    if (req.method !== 'GET') {
      return writeJson(res, 405, { ok: false, error: 'GET only' })
    }

    if (!isLoopbackAddress(req.socket?.remoteAddress)) {
      return writeJson(res, 403, { ok: false, error: 'Loopback access only' })
    }

    if (hasDisallowedBrowserOrigin(req)) {
      return writeJson(res, 403, { ok: false, error: 'Cross-site or browser requests to proxy are forbidden' })
    }

    const pool = await resolveAccountPool(ctx, live())
    if (!isAuthorizedProxyRequest(req, pool)) {
      return writeJson(res, 401, { ok: false, error: 'Unauthorized: missing or invalid bearer token' })
    }

    const pub = publicConfig(live())
    const dynamic = Array.isArray(pub.dynamicModels) ? pub.dynamicModels : []
    const custom = Array.isArray(pub.customModels) ? pub.customModels : []
    const overrides = Array.isArray(pub.modelContextOverrides) ? pub.modelContextOverrides : []
    const allModels = getAllModels(dynamic, overrides, custom)

    const modelsData = allModels.map(m => ({
      id: m.id,
      object: 'model',
      created: 1700000000,
      owned_by: 'clinebot',
      permission: [],
      root: m.id,
      parent: null
    }))

    writeJson(res, 200, {
      object: 'list',
      data: modelsData
    })
  }
}

export function registerProxyRoutes(ctx, routeEnv) {
  const chatHandler = createChatCompletionsHandler(ctx, routeEnv)
  const modelsHandler = createModelsHandler(ctx, routeEnv)

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/dsh-clinebot/v1/chat/completions',
    handler: chatHandler,
  }), 'dsh-clinebot: /v1/chat/completions')

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/dsh-clinebot/v1/models',
    handler: modelsHandler,
  }), 'dsh-clinebot: /v1/models')
}
