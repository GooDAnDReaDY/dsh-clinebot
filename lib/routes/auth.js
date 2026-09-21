import { writeJson, readBody } from '../http.js'
import { isTrustedSettingsRequest, assertTrustedSettingsRequest } from '../access.js'
import { publicConfig } from '../config.js'
import { resolveActiveAccountKey } from '../provider-sync.js'
import { smokeChat, recordSessionRequest, rotateToNextAccount, DEFAULT_MODEL_ID } from '../cline-client.js'

export function registerAuthRoutes(ctx, { live, getSettingsApi, syncProviderState }) {
  let authSession = null

  // POST /dsh-clinebot/auth/begin — start loopback auth listener
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/dsh-clinebot/auth/begin',
    handler: async (req, res) => {
      if (req.method !== 'POST') return writeJson(res, 405, { ok: false, error: 'POST only' })
      if (!assertTrustedSettingsRequest(req, res)) return
      try {
        const authUrl = 'https://app.cline.bot'
        authSession = {
          state: 'waiting',
          startedAt: Date.now(),
          authUrl,
        }
        writeJson(res, 200, {
          ok: true,
          status: authSession.state,
          authUrl,
        })
      } catch (err) {
        writeJson(res, 500, { ok: false, error: String(err?.message || err) })
      }
    },
  }), 'dsh-clinebot: /auth/begin')

  // GET /dsh-clinebot/auth/status — query current fast auth state
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/dsh-clinebot/auth/status',
    handler: async (req, res) => {
      if (req.method !== 'GET') return writeJson(res, 405, { ok: false, error: 'GET only' })
      writeJson(res, 200, {
        ok: true,
        status: authSession?.state || 'idle',
        authUrl: authSession?.authUrl || 'https://app.cline.bot',
      })
    },
  }), 'dsh-clinebot: /auth/status')

  // POST /dsh-clinebot/smoke — live ping test
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/dsh-clinebot/smoke',
    handler: async (req, res) => {
      if (req.method !== 'POST') return writeJson(res, 405, { ok: false, error: 'POST only' })
      if (!assertTrustedSettingsRequest(req, res)) return
      try {
        const bodyBuf = await readBody(req)
        let body = {}
        try { body = JSON.parse(bodyBuf.toString('utf8')) } catch { body = {} }

        const pub = publicConfig(live())
        const activeKey = await resolveActiveAccountKey(ctx, live())
        if (!activeKey.value) {
          return writeJson(res, 400, {
            ok: false,
            error: `API key not found. Ensure ${activeKey.envName} is added to DSH credentials or environment.`,
          })
        }

        const modelToTest = body.model || pub.defaultModel || DEFAULT_MODEL_ID
        const outcome = await smokeChat(pub.baseUrl, activeKey.value, {
          model: modelToTest,
          timeoutMs: pub.smokeTimeoutMs,
        })
        recordSessionRequest({
          latencyMs: outcome.latencyMs,
          ok: outcome.ok,
          error: outcome.error,
          promptTokens: outcome.promptTokens || 5,
          completionTokens: outcome.completionTokens || 10,
        })

        let failover = null
        if (outcome.status === 429) {
          failover = await rotateToNextAccount(ctx, live(), 'smoke_429', getSettingsApi())
          if (failover.rotated) {
            await syncProviderState(live())
          }
        }

        writeJson(res, outcome.ok ? 200 : 502, { ...outcome, failover })
      } catch (err) {
        recordSessionRequest({ ok: false, error: String(err?.message || err) })
        writeJson(res, 500, { ok: false, error: String(err?.message || err) })
      }
    },
  }), 'dsh-clinebot: /smoke')
}
