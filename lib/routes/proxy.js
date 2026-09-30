/**
 * Transparent Loopback Proxy & Zero-Downtime Failover (Issues #127, #145, #147)
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
 * 5. Sticky session routing with least-used quota allocation.
 * 6. Streaming SSE token usage interception & persistent telemetry recording.
 */

import { createRequire } from 'node:module'
import { writeJson, readBody, isLoopbackAddress } from '../http.js'
import { publicConfig, plainConfig } from '../config.js'
import { resolveAccountPool } from '../account-pool.js'
import { resolveSessionAccount, markAccountCooldown } from '../session-router.js'
import { recordUsage } from '../stats-storage.js'
import { getAllModels, DEFAULT_MODEL_ID } from '../models.js'
import { getLocalProxyToken } from '../proxy-token.js'

const require = createRequire(import.meta.url)
let packageVersion = '0.5.3'
try {
  packageVersion = require('../../package.json').version || '0.5.6'
} catch (err) {
  /* fallback to default version if manifest is unreadable */
}

export const USER_AGENT = `@goodandready/dsh-clinebot/${packageVersion}`

export function hasDisallowedBrowserOrigin(req) {
  const secFetchSite = req.headers?.['sec-fetch-site']
  if (secFetchSite === 'cross-site' || secFetchSite === 'same-site') {
    return true
  }
  if (req.headers?.['origin']) {
    return true
  }
  return false
}

export function isAuthorizedProxyRequest(req, accountPool = []) {
  const auth = req.headers?.['authorization'] || ''
  const match = auth.match(/^Bearer\s+(.+)$/i)
  if (!match) return false
  const token = match[1].trim()
  if (!token) return false
  const localToken = getLocalProxyToken()
  if (localToken && token === localToken) {
    return true
  }
  if (Array.isArray(accountPool) && accountPool.length > 0) {
    if (accountPool.some((acc) => acc.value && acc.value === token)) {
      return true
    }
  }
  return false
}

export function registerProxyRoutes(ctx, { live, getSettingsApi, syncProviderState }) {
  // 1. POST /dsh-clinebot/v1/chat/completions
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/dsh-clinebot/v1/chat/completions',
    handler: async (req, res) => {
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

      // Session identification
      const sessionId = String(
        req.headers['x-dsh-session-id'] ||
        req.headers['x-session-id'] ||
        req.headers['session-id'] ||
        req.headers['session_id'] ||
        req.headers['x-session-affinity'] ||
        req.headers['x-client-request-id'] ||
        body?.session_id ||
        body?.conversation_id ||
        body?.chat_id ||
        body?.user ||
        ''
      ).trim()

      // Ensure model is set, fallback to defaultModel (#140)
      body.model = String(body.model || pub.defaultModel || DEFAULT_MODEL_ID).trim()

      // Inject model reasoning effort if model has default configured and payload omitted it
      if (
        pub.modelReasoningDefaults &&
        pub.modelReasoningDefaults[body.model] &&
        !body.reasoning_effort
      ) {
        body.reasoning_effort = pub.modelReasoningDefaults[body.model]
      }

      const isStreaming = Boolean(body.stream)
      const configuredAccounts = pool.filter(a => a.present && a.value)

      const maxRetries = Math.max(1, configuredAccounts.length)
      let attempt = 0
      let lastError = null
      let hadTimeout = false

      while (attempt < maxRetries) {
        attempt += 1

        const routeResult = resolveSessionAccount(sessionId, pool, pub.activeAccount)
        const targetAccount = routeResult.account

        if (!targetAccount || !targetAccount.value) {
          return writeJson(res, 503, {
            error: {
              message: 'No available ClinePass API keys configured in pool',
              type: 'service_unavailable',
              code: 'no_keys_available'
            }
          })
        }

        const upstreamUrl = `${pub.baseUrl}/chat/completions`
        const requestHeaders = {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${targetAccount.value}`,
          'Accept': isStreaming ? 'text/event-stream' : 'application/json',
          'User-Agent': USER_AGENT
        }

        const upstreamTimeoutMs = Math.max(1000, Number(pub.timeoutMs) || 60000)
        const timeoutSignal = AbortSignal.timeout(upstreamTimeoutMs)
        const clientAbortCtrl = new AbortController()
        const onReqClose = () => {
          clientAbortCtrl.abort()
        }
        if (typeof req.on === 'function') {
          req.on('close', onReqClose)
        }
        const fetchSignal = AbortSignal.any([clientAbortCtrl.signal, timeoutSignal])

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
          if (clientAbortCtrl.signal.aborted) {
            // Client closed connection, stop processing
            return
          }
          lastError = fetchErr
          const isTimeout = timeoutSignal.aborted || fetchErr.name === 'TimeoutError' || String(fetchErr).includes('timeout')
          if (isTimeout) {
            hadTimeout = true
            const accountId = targetAccount.apiKeyEnv || targetAccount.id || targetAccount.label
            markAccountCooldown(accountId, 60000, null, 'upstream_timeout')
            if (targetAccount.id && targetAccount.id !== accountId) markAccountCooldown(targetAccount.id, 60000, null, 'upstream_timeout')
            ctx?.logger?.warn?.(`[dsh-clinebot:proxy] Account "${accountId}" upstream timed out after ${upstreamTimeoutMs}ms, attempting failover (attempt ${attempt}/${maxRetries})`)
          }
          continue
        }

        // If upstream rejected with 429 or 402 quota exhaustion before streaming, failover!
        if (upstreamRes.status === 429 || upstreamRes.status === 402) {
          const accountId = targetAccount.apiKeyEnv || targetAccount.id || targetAccount.label
          markAccountCooldown(accountId, 60000, null, 'upstream_429')
          if (targetAccount.id && targetAccount.id !== accountId) markAccountCooldown(targetAccount.id, 60000, null, 'upstream_429')
          recordUsage({
            model: body.model,
            accountId,
            is429: true,
            isError: true,
            statsPath: pub.statsPath
          })
          ctx?.logger?.warn?.(`[dsh-clinebot:proxy] Account "${accountId}" hit 429, attempting failover (attempt ${attempt}/${maxRetries})`)
          continue
        }

        // Upstream responded with non-retryable response: stream or write JSON to client
        if (isStreaming && upstreamRes.status === 200 && upstreamRes.body) {
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

          const reader = upstreamRes.body.getReader()
          const decoder = new TextDecoder('utf8')

          let streamAborted = false
          const onStreamAbort = () => {
            streamAborted = true
            try {
              reader.cancel().catch(() => {})
            } catch {
              /* ignore */
            }
          }
          if (typeof req.on === 'function') {
            req.on('close', onStreamAbort)
          }

          try {
            while (true) {
              const { done, value } = await reader.read()
              if (done || streamAborted) break

              const chunkStr = decoder.decode(value, { stream: true })
              res.write(value)

              // Parse SSE lines for usage metrics
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
                  } catch {
                    /* ignore JSON chunk parse error */
                  }
                }
              }
            }
          } catch (streamErr) {
            ctx?.logger?.warn?.('[dsh-clinebot:proxy] Stream read error: ' + (streamErr?.message || streamErr))
          } finally {
            try {
              reader.releaseLock()
            } catch (err) {
              /* ignore lock release error if reader already closed */
            }
            res.end()

            recordUsage({
              model: body.model,
              accountId: targetAccount.id || targetAccount.label,
              promptTokens,
              completionTokens,
              totalTokens: totalTokens || (promptTokens + completionTokens),
              statsPath: pub.statsPath
            })
          }
          return
        }

        // Non-streaming JSON response
        const resText = await upstreamRes.text().catch(() => '{}')
        let resJson = null
        try {
          resJson = JSON.parse(resText)
        } catch {
          resJson = null
        }

        if (resJson?.usage) {
          recordUsage({
            model: body.model,
            accountId: targetAccount.id || targetAccount.label,
            promptTokens: resJson.usage.prompt_tokens,
            completionTokens: resJson.usage.completion_tokens,
            totalTokens: resJson.usage.total_tokens,
            isError: upstreamRes.status >= 400,
            statsPath: pub.statsPath
          })
        }

        res.statusCode = upstreamRes.status
        res.setHeader('Content-Type', 'application/json; charset=utf-8')
        res.end(resText)
        return
      }

      // Exhausted all retries
      if (hadTimeout) {
        return writeJson(res, 504, {
          error: {
            message: 'Gateway Timeout: upstream provider timed out across all available accounts',
            type: 'gateway_timeout',
            code: 'upstream_timeout'
          }
        })
      }

      writeJson(res, 429, {
        error: {
          message: 'All configured accounts in pool exceeded rate limits or quota',
          type: 'rate_limit_exceeded',
          code: 'rate_limit_exceeded',
          details: lastError?.message || null
        }
      })
    },
  }), 'dsh-clinebot: /v1/chat/completions')

  // 2. GET /dsh-clinebot/v1/models (OpenAI standard)
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/dsh-clinebot/v1/models',
    handler: async (req, res) => {
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
    },
  }), 'dsh-clinebot: /v1/models')
}
