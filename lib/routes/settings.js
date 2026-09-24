import { writeJson, readBody } from '../http.js'
import { isTrustedSettingsRequest, assertTrustedSettingsRequest } from '../access.js'
import { publicConfig, plainConfig, Config } from '../config.js'
import { buildStatus } from '../provider-sync.js'
import { saveCredentialKey, smokeChat, DEFAULT_API_KEY_ENV } from '../cline-client.js'

export function registerSettingsRoutes(ctx, { live, getSettingsApi, syncProviderState, triggerAutoDiscover }) {
  // 1. GET /dsh-clinebot/status
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/dsh-clinebot/status',
    handler: async (req, res) => {
      if (req.method !== 'GET') return writeJson(res, 405, { ok: false, error: 'GET only' })
      if (!assertTrustedSettingsRequest(req, res)) return
      try {
        const st = await buildStatus(ctx, live())
        writeJson(res, 200, st)
      } catch (err) {
        writeJson(res, 500, { ok: false, error: String(err?.message || err) })
      }
    },
  }), 'dsh-clinebot: /status')

  // 2. GET & PUT /dsh-clinebot/config
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/dsh-clinebot/config',
    handler: async (req, res) => {
      if (req.method === 'GET') {
        if (!assertTrustedSettingsRequest(req, res)) return
        return writeJson(res, 200, { ok: true, config: publicConfig(live()) })
      }
      if (req.method !== 'PUT') {
        return writeJson(res, 405, { ok: false, error: 'GET or PUT' })
      }
      if (!assertTrustedSettingsRequest(req, res)) return
      const settingsApi = getSettingsApi()
      if (!settingsApi) {
        return writeJson(res, 503, { ok: false, error: 'settings not ready' })
      }
      let bodyBuf
      try {
        bodyBuf = await readBody(req)
      } catch (err) {
        return writeJson(res, 400, { ok: false, error: String(err?.message || err) })
      }
      let payload
      try {
        payload = JSON.parse(bodyBuf.toString('utf8') || '{}')
      } catch {
        return writeJson(res, 400, { ok: false, error: 'invalid json' })
      }
      const rawPayload = payload && typeof payload.config === 'object' && payload.config !== null ? payload.config : payload
      if (!rawPayload || typeof rawPayload !== 'object' || Array.isArray(rawPayload)) {
        return writeJson(res, 400, { ok: false, error: 'body must be a JSON object' })
      }
      if ('enabledModels' in rawPayload) {
        return writeJson(res, 400, { ok: false, error: 'enabledModels is deprecated and not allowed; configure disabledModels instead' })
      }
      const allowedKeys = new Set(Object.keys(Config.dict || {}))
      allowedKeys.delete('enabledModels')
      for (const k of Object.keys(rawPayload)) {
        if (!allowedKeys.has(k)) {
          return writeJson(res, 400, { ok: false, error: `unknown config field: ${k}` })
        }
      }
      try {
        const base = plainConfig(live()) || {}
        delete base.enabledModels
        const merged = { ...base, ...rawPayload }
        const parsed = Config(merged)
        await settingsApi.replace(parsed)
        await syncProviderState(parsed)
        writeJson(res, 200, { ok: true, config: publicConfig(live()) })
      } catch (e) {
        writeJson(res, 400, { ok: false, error: String(e?.message || e) })
      }
    },
  }), 'dsh-clinebot: /config')

  // 3. POST /dsh-clinebot/save-key — direct saving into DSH credentials service
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/dsh-clinebot/save-key',
    handler: async (req, res) => {
      if (req.method !== 'POST') return writeJson(res, 405, { ok: false, error: 'POST only' })
      if (!assertTrustedSettingsRequest(req, res)) return
      try {
        const bodyBuf = await readBody(req)
        let body = {}
        try { body = JSON.parse(bodyBuf.toString('utf8')) } catch { body = {} }

        const apiKey = String(body.apiKey || '').trim()
        if (!apiKey) {
          return writeJson(res, 400, { ok: false, error: 'API key cannot be empty' })
        }

        const pub = publicConfig(live())
        const targetEnvName = String(body.apiKeyEnv || pub.apiKeyEnv || DEFAULT_API_KEY_ENV).trim()

        const isDefaultPattern = /^CLINEBOT_API_KEY(_[A-Z0-9]+)?$/.test(targetEnvName)
        const isConfiguredEnv = targetEnvName === pub.apiKeyEnv ||
          (Array.isArray(pub.accounts) && pub.accounts.some(acc => acc && acc.apiKeyEnv === targetEnvName))

        if (!isDefaultPattern && !isConfiguredEnv) {
          return writeJson(res, 400, {
            ok: false,
            error: `Disallowed apiKeyEnv: "${targetEnvName}". Must match ^CLINEBOT_API_KEY(_[A-Z0-9]+)?$ or be configured in settings.`,
          })
        }

        await saveCredentialKey(ctx, targetEnvName, apiKey)

        await syncProviderState(live())
        triggerAutoDiscover()

        let validation = { ok: false, error: 'Skipped validation: baseUrl is not https' }
        try {
          const parsedUrl = new URL(pub.baseUrl)
          if (parsedUrl.protocol === 'https:') {
            validation = await smokeChat(pub.baseUrl, apiKey, {
              model: pub.defaultModel,
              timeoutMs: 15000,
            })
          }
        } catch {
          validation = { ok: false, error: 'Invalid baseUrl' }
        }

        writeJson(res, 200, {
          ok: true,
          envName: targetEnvName,
          validated: validation.ok,
          latencyMs: validation.latencyMs,
          validationError: validation.ok ? null : validation.error,
        })
      } catch (err) {
        writeJson(res, 500, { ok: false, error: String(err?.message || err) })
      }
    },
  }), 'dsh-clinebot: /save-key')
}
