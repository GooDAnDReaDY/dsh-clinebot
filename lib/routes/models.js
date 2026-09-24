import { writeJson, readBody } from '../http.js'
import { isTrustedSettingsRequest, assertTrustedSettingsRequest } from '../access.js'
import { publicConfig, Config } from '../config.js'
import { resolveActiveAccountKey, resolvePathWithHome } from '../provider-sync.js'
import { getAllModels, saveModelsDiskCache } from '../models.js'
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
        const allModels = getAllModels(dynamicModels)
        const settingsApi = getSettingsApi()

        if (settingsApi?.replace) {
          const next = Config({
            ...live(),
            dynamicModels,
          })
          await settingsApi.replace(next)
          await syncProviderState(next)
          const cacheFile = resolvePathWithHome(pub.modelsCachePath)
          if (cacheFile) {
            await saveModelsDiskCache(cacheFile, dynamicModels)
          }
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
        if (settingsApi?.replace) {
          const patch = {}
          if (Array.isArray(body.disabledModels)) {
            patch.disabledModels = body.disabledModels
          } else if (Array.isArray(body.enabledModels)) {
            const allModels = getAllModels(live().dynamicModels)
            const enabledSet = new Set(body.enabledModels)
            patch.disabledModels = allModels.map((m) => m.id).filter((id) => !enabledSet.has(id))
          }
          if (body.defaultModel) patch.defaultModel = body.defaultModel
          const next = Config({ ...live(), ...patch })
          await settingsApi.replace(next)
          await syncProviderState(next)
          writeJson(res, 200, { ok: true, disabledModels: next.disabledModels, enabledModels: publicConfig(next).enabledModels })
        } else {
          writeJson(res, 200, { ok: true })
        }
      } catch (err) {
        writeJson(res, 500, { ok: false, error: String(err?.message || err) })
      }
    },
  }), 'dsh-clinebot: /models/toggle')

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
