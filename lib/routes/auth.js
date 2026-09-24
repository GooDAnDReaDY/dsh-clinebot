import { writeJson, readBody } from '../http.js'
import { assertTrustedSettingsRequest } from '../access.js'
import { publicConfig } from '../config.js'
import { resolveActiveAccountKey } from '../provider-sync.js'
import {
  smokeChat,
  recordSmokeTest,
  rotateToNextAccount,
  DEFAULT_MODEL_ID,
  normalizeBaseUrl,
} from '../cline-client.js'

export function registerAuthRoutes(ctx, { live, getSettingsApi, syncProviderState }) {
  // POST /dsh-clinebot/key/verify — on-the-fly verification of Cline API key
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/dsh-clinebot/key/verify',
    handler: async (req, res) => {
      if (!assertTrustedSettingsRequest(req, res)) return
      if (req.method !== 'POST') return writeJson(res, 405, { ok: false, error: 'POST only' })
      try {
        const bodyBuf = await readBody(req)
        let body = {}
        try { body = JSON.parse(bodyBuf.toString('utf8')) } catch { body = {} }
        const key = String(body.key || '').trim()
        if (!key) {
          return writeJson(res, 400, { ok: false, valid: false, error: 'Key is empty' })
        }
        const pub = publicConfig(live())
        const base = normalizeBaseUrl(pub.baseUrl)

        let parsedBase
        try {
          parsedBase = new URL(base)
        } catch {
          return writeJson(res, 400, { ok: false, valid: false, error: 'Invalid baseUrl' })
        }
        if (parsedBase.protocol !== 'https:' && parsedBase.hostname !== 'localhost' && parsedBase.hostname !== '127.0.0.1') {
          return writeJson(res, 400, {
            ok: false,
            valid: false,
            error: 'Insecure baseUrl: key verification requires https://',
          })
        }

        const ac = new AbortController()
        const timer = setTimeout(() => ac.abort(), 6000)
        try {
          const [meRes, planRes] = await Promise.all([
            fetch(`${base}/users/me`, {
              headers: { Authorization: `Bearer ${key}`, Accept: 'application/json' },
              signal: ac.signal,
            }).catch((err) => ({ ok: false, status: 500, error: err })),
            fetch(`${base}/users/me/plan`, {
              headers: { Authorization: `Bearer ${key}`, Accept: 'application/json' },
              signal: ac.signal,
            }).catch(() => null),
          ])

          if (!meRes.ok) {
            return writeJson(res, 200, {
              ok: false,
              valid: false,
              error: meRes.status === 401 ? 'Invalid API key (HTTP 401 Unauthorized)' : `Upstream returned HTTP ${meRes.status}`,
            })
          }

          const meData = await meRes.json().catch(() => ({}))
          const email = meData?.data?.email || meData?.email || 'authenticated user'

          let planName = 'ClinePass'
          if (planRes && planRes.ok) {
            const planData = await planRes.json().catch(() => ({}))
            const plan = planData?.data?.plan || planData?.data || planData?.plan || planData
            planName = plan?.displayName || plan?.title || plan?.name || 'ClinePass'
          }

          return writeJson(res, 200, {
            ok: true,
            valid: true,
            email,
            plan: planName,
          })
        } finally {
          clearTimeout(timer)
        }
      } catch (err) {
        return writeJson(res, 500, { ok: false, valid: false, error: String(err?.message || err) })
      }
    },
  }), 'dsh-clinebot: /key/verify')

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
        recordSmokeTest({
          latencyMs: outcome.latencyMs,
          ok: outcome.ok,
          error: outcome.error,
          model: modelToTest,
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
        recordSmokeTest({ ok: false, error: String(err?.message || err) })
        writeJson(res, 500, { ok: false, error: String(err?.message || err) })
      }
    },
  }), 'dsh-clinebot: /smoke')
}
