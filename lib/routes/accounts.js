import { writeJson, readBody } from '../http.js'
import { isTrustedSettingsRequest, assertTrustedSettingsRequest } from '../access.js'
import { publicConfig, Config } from '../config.js'
import { upsertPiAiProvider, removePiAiProvider } from '../provider-sync.js'
import { clearUsageCache, clearProbeCache } from '../cline-client.js'

export function registerAccountsRoutes(ctx, { live, getSettingsApi, syncProviderState }) {
  // POST /dsh-clinebot/accounts/active — switch or pin active account
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/dsh-clinebot/accounts/active',
    handler: async (req, res) => {
      if (req.method !== 'POST') return writeJson(res, 405, { ok: false, error: 'POST only' })
      if (!assertTrustedSettingsRequest(req, res)) return
      try {
        const bodyBuf = await readBody(req)
        let body = {}
        try { body = JSON.parse(bodyBuf.toString('utf8')) } catch { body = {} }
        const account = String(body.account || '').trim()

        clearUsageCache()
        clearProbeCache()
        const settingsApi = getSettingsApi()
        if (settingsApi?.replace) {
          const next = Config({ ...live(), activeAccount: account })
          await settingsApi.replace(next)
          await syncProviderState(next)
          writeJson(res, 200, { ok: true, activeAccount: next.activeAccount })
        } else {
          writeJson(res, 200, { ok: true, activeAccount: account })
        }
      } catch (err) {
        writeJson(res, 500, { ok: false, error: String(err?.message || err) })
      }
    },
  }), 'dsh-clinebot: /accounts/active')

  // POST /dsh-clinebot/register — upsert into DSH llm-pi-ai
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/dsh-clinebot/register',
    handler: async (req, res) => {
      if (req.method !== 'POST') return writeJson(res, 405, { ok: false, error: 'POST only' })
      if (!assertTrustedSettingsRequest(req, res)) return
      try {
        const bodyBuf = await readBody(req)
        let body = {}
        try { body = JSON.parse(bodyBuf.toString('utf8')) } catch { body = {} }
        const activeModels = body.models || publicConfig(live()).enabledModels
        const result = await upsertPiAiProvider(ctx, live(), activeModels)
        writeJson(res, 200, { ok: true, provider: result })
      } catch (err) {
        writeJson(res, 500, { ok: false, error: String(err?.message || err) })
      }
    },
  }), 'dsh-clinebot: /register')

  // POST /dsh-clinebot/unregister — remove from DSH
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/dsh-clinebot/unregister',
    handler: async (req, res) => {
      if (req.method !== 'POST') return writeJson(res, 405, { ok: false, error: 'POST only' })
      if (!assertTrustedSettingsRequest(req, res)) return
      try {
        await removePiAiProvider(ctx)
        writeJson(res, 200, { ok: true })
      } catch (err) {
        writeJson(res, 500, { ok: false, error: String(err?.message || err) })
      }
    },
  }), 'dsh-clinebot: /unregister')
}
