import { writeJson, readBody } from '../http.js'
import { assertTrustedSettingsRequest } from '../access.js'
import { publicConfig, plainConfig, Config } from '../config.js'
import { resolveActiveAccountKey, resolvePathWithHome } from '../provider-sync.js'
import { getAllModels, saveModelsDiskCache, getOriginalModelContext, getOriginalModelMaxTokens } from '../models.js'
import { fetchUsageLimits, smokeChat } from '../cline-client.js'
import { publicUsage } from '../http.js'
import { ensurePublicPricesForModels } from '../price-sync.js'

export function registerModelsRoutes(ctx, { live, getSettingsApi, syncProviderState }) {
  // POST /dsh-clinebot/models/sync — dynamically load models from plan
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/dsh-clinebot/models/sync',
    handler: async (req, res) => {
      if (!assertTrustedSettingsRequest(req, res, ctx)) return
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
          includeCatalog: true,
        })

        if (!usageData.ok) {
          return writeJson(res, 502, { ok: false, error: usageData.error || 'Failed to fetch plan models' })
        }

        const dynamicModels = Array.isArray(usageData.dynamicModels) ? usageData.dynamicModels : []
        const allModels = getAllModels(dynamicModels, pub.modelContextOverrides, pub.customModels)
        const settingsApi = getSettingsApi()
        if (!settingsApi || typeof settingsApi.replace !== 'function') {
          return writeJson(res, 503, { ok: false, error: 'Settings service unavailable or read-only' })
        }

        const previousIds = new Set((pub.dynamicModels || []).map((model) => model?.id).filter(Boolean))
        const addedModels = dynamicModels.filter((model) => model?.id && !previousIds.has(model.id))
        const now = Date.now()
        const next = plainConfig(Config({
          ...plainConfig(live()),
          dynamicModels,
          planSyncedAt: now,
        }))
        await settingsApi.replace(next)
        await syncProviderState(next)
        const cacheFile = resolvePathWithHome(pub.modelsCachePath)
        if (cacheFile) {
          const activeAcc = await resolveActiveAccountKey(ctx, live())
          const accountRef = activeAcc?.envName || activeAcc?.apiKeyEnv || pub.activeAccount || pub.apiKeyEnv || 'CLINEBOT_API_KEY'
          await saveModelsDiskCache(cacheFile, dynamicModels, now, {
            endpoint: pub.baseUrl,
            accountRef,
          })
        }

        let priceSync = null
        if (addedModels.length > 0) {
          try {
            priceSync = await ensurePublicPricesForModels(addedModels.map((model) => model.id), {
              url: pub.priceCatalogUrl,
              cachePath: pub.priceCatalogPath,
              enabled: pub.priceAutoSync !== false,
            })
          } catch {
            /* price catalog refresh is best-effort */
          }
        }

        return writeJson(res, 200, {
          ok: true,
          plan: usageData.plan,
          discoveredCount: dynamicModels.length,
          totalModelsCount: allModels.length,
          models: allModels,
          priceSync,
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
      if (!assertTrustedSettingsRequest(req, res, ctx)) return
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
          const allModels = getAllModels(pub.dynamicModels, pub.modelContextOverrides, pub.customModels)
          const enabledSet = new Set(body.enabledModels)
          patch.disabledModels = allModels.map((m) => m.id).filter((id) => !enabledSet.has(id))
        }
        if (body.defaultModel) patch.defaultModel = body.defaultModel
        const next = plainConfig(Config({ ...plainConfig(live()), ...patch }))
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
      if (!assertTrustedSettingsRequest(req, res, ctx)) return
      try {
        const bodyBuf = await readBody(req)
        let body = {}
        try { body = JSON.parse(bodyBuf.toString('utf8')) } catch { body = {} }

        const settingsApi = getSettingsApi()
        if (!settingsApi || typeof settingsApi.replace !== 'function') {
          return writeJson(res, 503, { ok: false, error: 'Settings service unavailable or read-only' })
        }

        const pub = publicConfig(live())
        const allModels = getAllModels(pub.dynamicModels, [], pub.customModels)
        let currentOverrides = Array.isArray(pub.modelContextOverrides) ? [...pub.modelContextOverrides] : []

        if (body.mode === 'all-original') {
          // Set all models to their authentic original creator context & token limits
          currentOverrides = allModels.map((m) => ({
            modelId: m.id,
            contextLength: m.originalContextLength || getOriginalModelContext(m.id),
            maxTokens: m.originalMaxTokens || getOriginalModelMaxTokens(m.id),
          }))
        } else if (body.mode === 'all-default' || body.mode === 'reset-all') {
          // Reset all overrides back to provider defaults
          currentOverrides = []
        } else if (body.mode === 'apply-all') {
          // Bulk apply limits across all models and set wildcard default
          const rawCtx = Number(body.contextLength)
          const contextLength = Number.isFinite(rawCtx) && rawCtx > 0 ? Math.max(1000, rawCtx) : undefined
          const rawMax = Number(body.maxTokens)
          const maxTokens = Number.isFinite(rawMax) && rawMax > 0 ? Math.max(256, rawMax) : undefined

          currentOverrides = allModels.map((m) => {
            const existing = currentOverrides.find((o) => o.modelId === m.id)
            return {
              modelId: m.id,
              contextLength: contextLength !== undefined ? contextLength : (existing?.contextLength || m.contextLength),
              maxTokens: maxTokens !== undefined ? maxTokens : (existing?.maxTokens || m.maxTokens),
            }
          })
          currentOverrides = currentOverrides.filter((o) => o.modelId !== '*')
          currentOverrides.push({
            modelId: '*',
            contextLength: contextLength || 200000,
            maxTokens: maxTokens || 16384,
          })
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
            const rawMax = Number(body.maxTokens)
            const existingIdx = currentOverrides.findIndex((o) => o.modelId === modelId)
            const existingEntry = existingIdx >= 0 ? currentOverrides[existingIdx] : null
            const targetModel = allModels.find((m) => m.id === modelId)

            const contextLength = Number.isFinite(rawCtx) && rawCtx > 0
              ? Math.max(1000, rawCtx)
              : (existingEntry?.contextLength || targetModel?.contextLength || 200000)

            const maxTokens = Number.isFinite(rawMax) && rawMax > 0
              ? Math.max(256, rawMax)
              : (existingEntry?.maxTokens || targetModel?.maxTokens || 8192)

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

        const next = plainConfig(Config({
          ...plainConfig(live()),
          modelContextOverrides: currentOverrides,
        }))
        await settingsApi.replace(next)
        await syncProviderState(next)

        const updatedModels = getAllModels(pub.dynamicModels, currentOverrides, pub.customModels)
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
      if (!assertTrustedSettingsRequest(req, res, ctx)) return
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
        const accountLabel = activeKey.label || activeKey.apiKeyEnv || activeKey.id || ''
        writeJson(res, usageData.ok ? 200 : 502, { ...(publicUsage(usageData) || {}), account: accountLabel })
      } catch (err) {
        writeJson(res, 500, { ok: false, error: String(err?.message || err) })
      }
    },
  }), 'dsh-clinebot: /usage')

  // POST /dsh-clinebot/models/probe — benchmark TTFT latency for specific model
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/dsh-clinebot/models/probe',
    handler: async (req, res) => {
      if (req.method !== 'POST') return writeJson(res, 405, { ok: false, error: 'POST only' })
      if (!assertTrustedSettingsRequest(req, res, ctx)) return
      try {
        const bodyBuf = await readBody(req)
        let body = {}
        try { body = JSON.parse(bodyBuf.toString('utf8')) } catch { body = {} }
        const pub = publicConfig(live())
        const activeKey = await resolveActiveAccountKey(ctx, live())
        if (!activeKey.value) {
          return writeJson(res, 400, { ok: false, error: 'API key not found' })
        }
        const modelId = body.modelId || body.model || pub.defaultModel
        const result = await smokeChat(pub.baseUrl, activeKey.value, {
          model: modelId,
          timeoutMs: Math.min(pub.smokeTimeoutMs || 25000, 15000),
        })
        return writeJson(res, 200, {
          ok: result.ok,
          modelId,
          latencyMs: result.latencyMs,
          status: result.status,
          error: result.error || null,
        })
      } catch (err) {
        return writeJson(res, 500, { ok: false, error: String(err?.message || err) })
      }
    },
  }), 'dsh-clinebot: /models/probe')
  // POST /dsh-clinebot/models/visible — configure visible models and plan filtering
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/dsh-clinebot/models/visible',
    handler: async (req, res) => {
      if (req.method !== 'POST') return writeJson(res, 405, { ok: false, error: 'POST only' })
      if (!assertTrustedSettingsRequest(req, res, ctx)) return
      try {
        const bodyBuf = await readBody(req)
        let body = {}
        try { body = JSON.parse(bodyBuf.toString('utf8')) } catch { body = {} }
        const settingsApi = getSettingsApi()
        if (!settingsApi || typeof settingsApi.replace !== 'function') {
          return writeJson(res, 503, { ok: false, error: 'Settings service unavailable or read-only' })
        }
        const current = plainConfig(live())
        const next = { ...current }
        if (Array.isArray(body.visibleModels)) {
          next.visibleModels = body.visibleModels
        }
        if (typeof body.filterModelsByPlan === 'boolean') {
          next.filterModelsByPlan = body.filterModelsByPlan
        }
        await settingsApi.replace(next)
        await syncProviderState(next)
        writeJson(res, 200, {
          ok: true,
          visibleModels: next.visibleModels,
          filterModelsByPlan: next.filterModelsByPlan,
          enabledModels: publicConfig(next).enabledModels,
        })
      } catch (err) {
        writeJson(res, 500, { ok: false, error: String(err?.message || err) })
      }
    },
  }), 'dsh-clinebot: /models/visible')

}
