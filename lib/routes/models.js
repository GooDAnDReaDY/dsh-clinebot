import { writeJson, readBody } from '../http.js'
import { assertTrustedSettingsRequest } from '../access.js'
import { publicConfig, plainConfig, Config } from '../config.js'
import { resolveActiveAccountKey, resolvePathWithHome } from '../provider-sync.js'
import { getAllModels, saveModelsDiskCache, getOriginalModelContext } from '../models.js'
import { fetchUsageLimits } from '../cline-client.js'
import { publicUsage } from '../http.js'

export function registerModelsRoutes(ctx, { live, getSettingsApi, syncProviderState }) {
  // POST /dsh-clinebot/models/sync — dynamically load models from plan
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/dsh-clinebot/models/sync',
    handler: async (req, res) => {
      if (!assertTrustedSettingsRequest(req, res)) return
      if (req.method !== 'POST') {
        return writeJson(res, 405, { ok: false, error: 'POST only' })
      }
      try {
        const pub = publicConfig(live())
        const activeKey = await resolveActiveAccountKey(ctx, live())
        if (!activeKey.value) {
          return writeJson(res, 400, { ok: false, error: 'API key not configured' })
        }

        const usageData = await fetchUsageLimits(pub.baseUrl, activeKey.value, {
          timeoutMs: pub.timeoutMs,
          bypassCache: true,
        })

        if (!usageData.ok) {
          return writeJson(res, 502, { ok: false, error: usageData.error || 'Failed to fetch plan models' })
        }

        const dynamicModels = Array.isArray(usageData.dynamicModels) ? usageData.dynamicModels : []
        const allModels = getAllModels(dynamicModels, pub.modelContextOverrides)
        const settingsApi = getSettingsApi()
        if (!settingsApi || typeof settingsApi.replace !== 'function') {
          return writeJson(res, 503, { ok: false, error: 'Settings service unavailable or read-only' })
        }

        const now = Date.now()
        const next = Config({
          ...plainConfig(live()),
          dynamicModels,
          planSyncedAt: now,
        })
        await settingsApi.replace(next)
        await syncProviderState(next)
        const cacheFile = resolvePathWithHome(pub.modelsCachePath)
        if (cacheFile) {
          await saveModelsDiskCache(cacheFile, dynamicModels, now)
        }

        return writeJson(res, 200, {
          ok: true,
          plan: usageData.plan,
          discoveredCount: dynamicModels.length,
          totalModelsCount: allModels.length,
          models: allModels,
        })
      } catch (err) {
        return writeJson(res, 500, { ok: false, error: String(err?.message || err) })
      }
    },
  }), 'dsh-clinebot: /models/sync')

  // POST /dsh-clinebot/models/toggle — toggle disabled/enabled status in picker
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/dsh-clinebot/models/toggle',
    handler: async (req, res) => {
      if (req.method !== 'POST') return writeJson(res, 405, { ok: false, error: 'POST only' })
      if (!assertTrustedSettingsRequest(req, res)) return
      try {
        const bodyBuf = await readBody(req)
        let body = {}
        try { body = JSON.parse(bodyBuf.toString('utf8')) } catch { body = {} }

        const settingsApi = getSettingsApi()
        if (!settingsApi || typeof settingsApi.replace !== 'function') {
          return writeJson(res, 503, { ok: false, error: 'Settings service unavailable or read-only' })
        }

        const pub = publicConfig(live())
        const patch = {}
        if (Array.isArray(body.disabledModels)) {
          patch.disabledModels = body.disabledModels
        } else if (Array.isArray(body.enabledModels)) {
          const allModels = getAllModels(pub.dynamicModels, pub.modelContextOverrides)
          const enabledSet = new Set(body.enabledModels)
          patch.disabledModels = allModels.map((m) => m.id).filter((id) => !enabledSet.has(id))
        }
        if (body.defaultModel) patch.defaultModel = body.defaultModel
        const next = Config({ ...plainConfig(live()), ...patch })
        await settingsApi.replace(next)
        await syncProviderState(next)
        writeJson(res, 200, { ok: true, disabledModels: next.disabledModels, enabledModels: publicConfig(next).enabledModels })
      } catch (err) {
        writeJson(res, 500, { ok: false, error: String(err?.message || err) })
      }
    },
  }), 'dsh-clinebot: /models/toggle')

  // POST /dsh-clinebot/models/context — configure custom context length and token limits
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/dsh-clinebot/models/context',
    handler: async (req, res) => {
      if (req.method !== 'POST') return writeJson(res, 405, { ok: false, error: 'POST only' })
      if (!assertTrustedSettingsRequest(req, res)) return
      try {
        const bodyBuf = await readBody(req)
        let body = {}
        try { body = JSON.parse(bodyBuf.toString('utf8')) } catch { body = {} }

        const settingsApi = getSettingsApi()
        if (!settingsApi || typeof settingsApi.replace !== 'function') {
          return writeJson(res, 503, { ok: false, error: 'Settings service unavailable or read-only' })
        }

        const pub = publicConfig(live())
        const allModels = getAllModels(pub.dynamicModels, [])
        let currentOverrides = Array.isArray(pub.modelContextOverrides) ? [...pub.modelContextOverrides] : []

        if (body.mode === 'all-original') {
          // Set all models to their authentic original creator context limits
          currentOverrides = allModels.map((m) => ({
            modelId: m.id,
            contextLength: m.originalContextLength || getOriginalModelContext(m.id),
            maxTokens: m.maxTokens || 8192,
          }))
        } else if (body.mode === 'all-default' || body.mode === 'reset-all') {
          // Reset all overrides back to provider defaults
          currentOverrides = []
        } else if (Array.isArray(body.overrides)) {
          // Bulk array override
          currentOverrides = body.overrides
            .filter((o) => o && typeof o.modelId === 'string')
            .map((o) => ({
              modelId: o.modelId,
              contextLength: Math.max(1000, Number(o.contextLength) || 200000),
              maxTokens: Math.max(256, Number(o.maxTokens) || 8192),
            }))
        } else if (body.modelId) {
          const modelId = String(body.modelId)
          if (body.reset) {
            currentOverrides = currentOverrides.filter((o) => o.modelId !== modelId)
          } else {
            const rawCtx = Number(body.contextLength)
            const contextLength = Number.isFinite(rawCtx) && rawCtx > 0 ? Math.max(1000, rawCtx) : 200000
            const rawMax = Number(body.maxTokens)
            const maxTokens = Number.isFinite(rawMax) && rawMax > 0 ? Math.max(256, rawMax) : 8192

            const existingIdx = currentOverrides.findIndex((o) => o.modelId === modelId)
            const newEntry = { modelId, contextLength, maxTokens }
            if (existingIdx >= 0) {
              currentOverrides[existingIdx] = newEntry
            } else {
              currentOverrides.push(newEntry)
            }
          }
        } else {
          return writeJson(res, 400, { ok: false, error: 'Missing modelId, mode, or overrides array' })
        }

        const next = Config({
          ...plainConfig(live()),
          modelContextOverrides: currentOverrides,
        })
        await settingsApi.replace(next)
        await syncProviderState(next)

        const updatedModels = getAllModels(pub.dynamicModels, currentOverrides)
        return writeJson(res, 200, {
          ok: true,
          modelContextOverrides: next.modelContextOverrides,
          models: updatedModels,
        })
      } catch (err) {
        return writeJson(res, 500, { ok: false, error: String(err?.message || err) })
      }
    },
  }), 'dsh-clinebot: /models/context')

  // GET /dsh-clinebot/usage — direct fresh usage limit query
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/dsh-clinebot/usage',
    handler: async (req, res) => {
      if (req.method !== 'GET') return writeJson(res, 405, { ok: false, error: 'GET only' })
      if (!assertTrustedSettingsRequest(req, res)) return
      try {
        const pub = publicConfig(live())
        const activeKey = await resolveActiveAccountKey(ctx, live())
        if (!activeKey.value) {
          return writeJson(res, 400, { ok: false, error: 'API key not found' })
        }
        const usageData = await fetchUsageLimits(pub.baseUrl, activeKey.value, {
          timeoutMs: pub.timeoutMs,
          bypassCache: true,
        })
        writeJson(res, usageData.ok ? 200 : 502, publicUsage(usageData))
      } catch (err) {
        writeJson(res, 500, { ok: false, error: String(err?.message || err) })
      }
    },
  }), 'dsh-clinebot: /usage')
}
