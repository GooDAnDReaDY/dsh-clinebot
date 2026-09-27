/**
 * Transparent Loopback Proxy & Zero-Downtime Failover (Issue #127)
 *
 * Exposes local OpenAI-compatible endpoints:
 * - POST /dsh-clinebot/v1/chat/completions
 * - GET  /dsh-clinebot/v1/models
 *
 * Implements:
 * 1. Sticky session routing with least-used quota allocation.
 * 2. Transparent upstream retry on 429 / quota exhaustion before first chunk is streamed.
 * 3. Accurate streaming SSE token usage interception & persistent telemetry recording.
 * 4. Model reasoning_effort default injection from config.
 */

import { writeJson, readBody, isLoopbackAddress } from '../http.js'
import { publicConfig, plainConfig } from '../config.js'
import { resolveAccountPool } from '../account-pool.js'
import { resolveSessionAccount, markAccountCooldown } from '../session-router.js'
import { recordUsage } from '../stats-storage.js'
import { getAllModels } from '../models.js'

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

      let bodyBuf
      try {
        bodyBuf = await readBody(req)
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
        body?.conversation_id ||
        body?.chat_id ||
        body?.user ||
        ''
      ).trim()

      // Inject model reasoning effort if model has default configured and payload omitted it
      if (
        pub.modelReasoningDefaults &&
        body.model &&
        pub.modelReasoningDefaults[body.model] &&
        !body.reasoning_effort
      ) {
        body.reasoning_effort = pub.modelReasoningDefaults[body.model]
      }

      const pool = await resolveAccountPool(ctx, cfg)
      const isStreaming = Boolean(body.stream) || String(req.headers.accept || '').includes('text/event-stream')

      // Transparent retry loop (up to max configured accounts, min 1, max 3)
      const maxRetries = Math.min(Math.max(1, pool.length), 3)
      let attempt = 0
      let lastError = null
      let targetAccount = null

      while (attempt < maxRetries) {
        attempt++
        const routeResult = resolveSessionAccount(sessionId, pool, pub.activeAccount)
        targetAccount = routeResult.account

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
          'User-Agent': '@goodandready/dsh-clinebot/0.5.0'
        }

        let upstreamRes
        try {
          upstreamRes = await fetch(upstreamUrl, {
            method: 'POST',
            headers: requestHeaders,
            body: JSON.stringify(body),
            keepalive: true
          })
        } catch (fetchErr) {
          lastError = fetchErr
          // Network errors: retry with next account if available
          continue
        }

        // If upstream rejected with 429 or 403 quota exhaustion before streaming, failover!
        if (upstreamRes.status === 429 || upstreamRes.status === 402) {
          const accountId = targetAccount.id || targetAccount.label
          markAccountCooldown(accountId, 60000, null, 'upstream_429')
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

          try {
            while (true) {
              const { done, value } = await reader.read()
              if (done) break

              const chunkStr = decoder.decode(value, { stream: true })
              res.write(value)

              // Parse SSE lines for usage metrics
              buffer += chunkStr
              const lines = buffer.split('\n')
              buffer = lines.pop() // keep incomplete last line

              for (const line of lines) {
                const trimmed = line.trim()
                if (trimmed.startsWith('data: ') && trimmed !== 'data: [DONE]') {
                  try {
                    const data = JSON.parse(trimmed.slice(6))
                    if (data?.usage) {
                      promptTokens = Number(data.usage.prompt_tokens) || promptTokens
                      completionTokens = Number(data.usage.completion_tokens) || completionTokens
                      totalTokens = Number(data.usage.total_tokens) || totalTokens
                    }
                  } catch {
                    /* ignore partial or non-json SSE lines */
                  }
                }
              }
            }
          } catch (streamErr) {
            ctx?.logger?.warn?.(`[dsh-clinebot:proxy] Error streaming SSE chunk: ${streamErr?.message || streamErr}`)
          } finally {
            res.end()
            recordUsage({
              model: body.model,
              accountId: targetAccount.id || targetAccount.label,
              promptTokens,
              completionTokens,
              totalTokens,
              statsPath: pub.statsPath
            })
          }
          return
        }

        // Non-streaming JSON response or error status from upstream
        const resText = await upstreamRes.text()
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
