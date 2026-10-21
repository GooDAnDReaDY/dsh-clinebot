import { writeJson, readBody } from '../http.js'
import { assertTrustedSettingsRequest } from '../access.js'
import { publicConfig, plainConfig, Config } from '../config.js'
import { buildStatus } from '../provider-sync.js'
import { saveCredentialKey, smokeChat, DEFAULT_API_KEY_ENV } from '../cline-client.js'
import { getStatsSummary, getSessionStats, resetStats, exportStatsAsCsv, getAnalytics } from '../stats-storage.js'
import { exportStatsAsJson } from '../stats-export.js'
import { priceTable, getPublicPriceCatalog, setPublicPriceCatalog } from '../model-prices.js'
import { syncPublicPrices } from '../price-sync.js'

export function registerSettingsRoutes(ctx, { live, getSettingsApi, syncProviderState, triggerAutoDiscover }) {
  // 1. GET /dsh-clinebot/status
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/dsh-clinebot/status',
    handler: async (req, res) => {
      if (req.method !== 'GET') return writeJson(res, 405, { ok: false, error: 'GET only' })
      if (!assertTrustedSettingsRequest(req, res, ctx)) return
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
        if (!assertTrustedSettingsRequest(req, res, ctx)) return
        return writeJson(res, 200, { ok: true, config: publicConfig(live()) })
      }
      if (req.method !== 'PUT') {
        return writeJson(res, 405, { ok: false, error: 'GET or PUT' })
      }
      if (!assertTrustedSettingsRequest(req, res, ctx)) return
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
      if (rawPayload.apiKeyEnv && !/^CLINEBOT_API_KEY(_[A-Z0-9]+)?$/.test(String(rawPayload.apiKeyEnv))) {
        return writeJson(res, 400, { ok: false, error: `Disallowed apiKeyEnv: "${rawPayload.apiKeyEnv}". Must match ^CLINEBOT_API_KEY(_[A-Z0-9]+)?$` })
      }
      if (Array.isArray(rawPayload.accounts)) {
        for (const acc of rawPayload.accounts) {
          if (!acc || typeof acc !== 'object') {
            return writeJson(res, 400, { ok: false, error: 'Each account must be an object' })
          }
          const env = String(acc.apiKeyEnv || '').trim()
          if (!/^CLINEBOT_API_KEY(_[A-Z0-9]+)?$/.test(env)) {
            return writeJson(res, 400, { ok: false, error: `Disallowed account apiKeyEnv: "${env}". Must match ^CLINEBOT_API_KEY(_[A-Z0-9]+)?$` })
          }
        }
      }
      if (rawPayload.baseUrl) {
        try {
          const parsed = new URL(rawPayload.baseUrl)
          if (parsed.protocol !== 'https:' && parsed.hostname !== 'localhost' && parsed.hostname !== '127.0.0.1') {
            return writeJson(res, 400, { ok: false, error: 'Insecure baseUrl: remote endpoint must use https://' })
          }
        } catch {
          return writeJson(res, 400, { ok: false, error: 'Invalid baseUrl' })
        }
      }
      try {
        const base = plainConfig(live()) || {}
        delete base.enabledModels
        const merged = { ...base, ...rawPayload }
        const activeChanged = rawPayload.activeAccount !== undefined && String(rawPayload.activeAccount).trim() !== String(base.activeAccount || "").trim()
        const apiKeyEnvChanged = rawPayload.apiKeyEnv !== undefined && String(rawPayload.apiKeyEnv).trim() !== String(base.apiKeyEnv || "").trim()
        const baseUrlChanged = rawPayload.baseUrl !== undefined && String(rawPayload.baseUrl).trim().replace(/\/+$/, '') !== String(base.baseUrl || "").trim().replace(/\/+$/, '')
        if (activeChanged || apiKeyEnvChanged || baseUrlChanged) {
          if (!("dynamicModels" in rawPayload)) merged.dynamicModels = []
          if (!("planSyncedAt" in rawPayload)) merged.planSyncedAt = 0
        }
        const parsed = plainConfig(Config(merged))
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
      if (!assertTrustedSettingsRequest(req, res, ctx)) return
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
        if (!isDefaultPattern) {
          return writeJson(res, 400, {
            ok: false,
            error: `Disallowed apiKeyEnv: "${targetEnvName}". Must match ^CLINEBOT_API_KEY(_[A-Z0-9]+)?$.`,
          })
        }

        const isConfiguredEnv = targetEnvName === DEFAULT_API_KEY_ENV ||
          targetEnvName === pub.apiKeyEnv ||
          (Array.isArray(pub.accounts) && pub.accounts.some(acc => acc && acc.apiKeyEnv === targetEnvName))

        if (!isConfiguredEnv) {
          return writeJson(res, 400, {
            ok: false,
            error: `Disallowed apiKeyEnv: "${targetEnvName}". Must be configured in settings accounts pool.`,
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

  // 4. GET /dsh-clinebot/stats — persistent token analytics summary (Issue #129)
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/dsh-clinebot/stats',
    handler: async (req, res) => {
      if (req.method !== 'GET') return writeJson(res, 405, { ok: false, error: 'GET only' })
      if (!assertTrustedSettingsRequest(req, res, ctx)) return
      try {
        const stats = getStatsSummary()
        writeJson(res, 200, { ok: true, stats })
      } catch (err) {
        writeJson(res, 500, { ok: false, error: String(err?.message || err) })
      }
    },
  }), 'dsh-clinebot: /stats')

  // 4b. GET /dsh-clinebot/stats/session — ClineBot-only aggregate for one DSH session
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/dsh-clinebot/stats/session',
    handler: async (req, res) => {
      if (req.method !== 'GET') return writeJson(res, 405, { ok: false, error: 'GET only' })
      if (!assertTrustedSettingsRequest(req, res, ctx)) return
      try {
        const url = new URL(req.url || '/', 'http://localhost')
        const sessionId = String(url.searchParams.get('sessionId') || '').trim().slice(0, 200)
        if (!sessionId) return writeJson(res, 400, { ok: false, error: 'sessionId required' })
        writeJson(res, 200, { ok: true, session: getSessionStats(sessionId) })
      } catch (err) {
        writeJson(res, 500, { ok: false, error: String(err?.message || err) })
      }
    },
  }), 'dsh-clinebot: /stats/session')

  // 5. POST /dsh-clinebot/stats/reset — reset persistent stats (Issue #129)
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/dsh-clinebot/stats/reset',
    handler: async (req, res) => {
      if (req.method !== 'POST') return writeJson(res, 405, { ok: false, error: 'POST only' })
      if (!assertTrustedSettingsRequest(req, res, ctx)) return
      try {
        const pub = publicConfig(live())
        const stats = resetStats(pub.statsPath)
        writeJson(res, 200, { ok: true, stats })
      } catch (err) {
        writeJson(res, 500, { ok: false, error: String(err?.message || err) })
      }
    },
  }), 'dsh-clinebot: /stats/reset')

  // 6. GET /dsh-clinebot/stats/export — export token telemetry as CSV
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/dsh-clinebot/stats/export',
    handler: async (req, res) => {
      if (req.method !== 'GET') return writeJson(res, 405, { ok: false, error: 'GET only' })
      if (!assertTrustedSettingsRequest(req, res, ctx)) return
      try {
        let detailed = false
        let format = 'csv'
        try {
          const url = new URL(req.url, 'http://127.0.0.1')
          detailed = url.searchParams.get('detailed') === '1'
          format = url.searchParams.get('format') === 'json' ? 'json' : 'csv'
        } catch {
          detailed = false
        }
        if (format === 'json') {
          res.statusCode = 200
          res.setHeader('Content-Type', 'application/json; charset=utf-8')
          res.setHeader('Content-Disposition', 'attachment; filename="clinebot-stats.json"')
          res.end(exportStatsAsJson())
          return
        }
        const csv = exportStatsAsCsv(detailed)
        res.statusCode = 200
        res.setHeader('Content-Type', 'text/csv; charset=utf-8')
        res.setHeader('Content-Disposition', 'attachment; filename="clinebot-stats.csv"')
        res.end(csv)
      } catch (err) {
        writeJson(res, 500, { ok: false, error: String(err?.message || err) })
      }
    },
  }), 'dsh-clinebot: /stats/export')

  // 7. GET /dsh-clinebot/analytics — aggregated session/day/model/account report
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/dsh-clinebot/analytics',
    handler: async (req, res) => {
      if (req.method !== 'GET') return writeJson(res, 405, { ok: false, error: 'GET only' })
      if (!assertTrustedSettingsRequest(req, res, ctx)) return
      try {
        let query = {}
        try {
          query = Object.fromEntries(new URL(req.url, 'http://127.0.0.1').searchParams.entries())
        } catch {}
        const parseTime = (value) => {
          if (value === undefined || value === '') return undefined
          const numeric = Number(value)
          return Number.isFinite(numeric) ? numeric : Date.parse(value)
        }
        const analytics = getAnalytics({
          from: parseTime(query.from),
          to: parseTime(query.to),
          groupBy: query.groupBy,
          limit: query.limit,
          model: query.model,
          account: query.account,
          heatmapDays: query.heatmapDays,
          heatmapModel: query.heatmapModel,
        })
        writeJson(res, 200, { ok: true, ...analytics })
      } catch (err) {
        writeJson(res, 500, { ok: false, error: String(err?.message || err) })
      }
    },
  }), 'dsh-clinebot: /analytics')

  // 8. GET /dsh-clinebot/prices — local cost-estimate table
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/dsh-clinebot/prices',
    handler: async (req, res) => {
      if (req.method !== 'GET') return writeJson(res, 405, { ok: false, error: 'GET only' })
      if (!assertTrustedSettingsRequest(req, res, ctx)) return
      try {
        const pub = publicConfig(live())
        writeJson(res, 200, {
          ok: true,
          ...priceTable(pub.priceOverrides || {}, pub.enabledModels || [], getPublicPriceCatalog()),
          updatedAt: new Date().toISOString(),
        })
      } catch (err) {
        writeJson(res, 500, { ok: false, error: String(err?.message || err) })
      }
    },
  }), 'dsh-clinebot: /prices')

  // 9. POST /dsh-clinebot/prices/sync — refresh the public model price catalog
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/dsh-clinebot/prices/sync',
    handler: async (req, res) => {
      if (req.method !== 'POST') return writeJson(res, 405, { ok: false, error: 'POST only' })
      if (!assertTrustedSettingsRequest(req, res, ctx)) return
      try {
        const pub = publicConfig(live())
        const result = await syncPublicPrices({
          url: pub.priceCatalogUrl,
          cachePath: pub.priceCatalogPath,
        })
        setPublicPriceCatalog(result.catalog)
        writeJson(res, 200, {
          ok: true,
          count: result.count,
          syncedAt: result.syncedAt,
          source: result.source,
        })
      } catch (err) {
        writeJson(res, 502, { ok: false, error: String(err?.message || err) })
      }
    },
  }), 'dsh-clinebot: /prices/sync')
}
