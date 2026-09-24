import { Config, publicConfig, plainConfig, volatileConfig, NS, LLM_PI_AI_NS } from './config.js'
import { registerPluginUpdater } from './updater.js'
import {
  sessionStats,
  recordSessionRequest,
  resetSessionStats,
  rotateToNextAccount,
  resolveKeyValue,
  smokeChat,
  fetchUsageLimits,
} from './cline-client.js'
import {
  checkRegisteredInPiAi,
  upsertPiAiProvider,
  removePiAiProvider,
  buildStatus,
  autoDiscoverPlanModels,
  resolveActiveAccountKey,
} from './provider-sync.js'
import { registerSettingsRoutes } from './routes/settings.js'
import { registerAccountsRoutes } from './routes/accounts.js'
import { registerModelsRoutes } from './routes/models.js'
import { registerAuthRoutes } from './routes/auth.js'
import { registerSlashCommand } from './slash-command.js'

export const name = '@goodandready/dsh-clinebot'
export const inject = ['settings', 'webServer', 'credentials']

export { NS, LLM_PI_AI_NS, Config, sessionStats, recordSessionRequest, resetSessionStats, rotateToNextAccount }

export function apply(ctx, config) {
  let currentConfig = config
  let getConfig = () => currentConfig
  const live = () => (getConfig() ? Config(structuredClone(plainConfig(getConfig()))) : config)
  let settingsApi

  const syncProviderState = async (cfg) => {
    try {
      const pub = publicConfig(cfg)
      if (!pub.enabled) {
        if (await checkRegisteredInPiAi(ctx)) {
          await removePiAiProvider(ctx)
        }
        return
      }
      const key = await resolveKeyValue(ctx, pub.apiKeyEnv)
      if (key.value) {
        await upsertPiAiProvider(ctx, cfg, pub.enabledModels)
      }
    } catch {
      /* ignore transient settings unavailable */
    }
  }

  const triggerAutoDiscover = () => {
    autoDiscoverPlanModels(ctx, { live, getSettingsApi: () => settingsApi, syncProviderState })
  }

  const createSettingsAdapter = (svc) => {
    if (!svc) return undefined
    if (typeof svc.replace === 'function' || typeof svc.update === 'function' || typeof svc.write === 'function') {
      const getRevision = () => {
        try {
          return svc.describe?.().find((row) => row.ns === NS)?.revision
        } catch {
          return undefined
        }
      }
      return {
        get: () => live(),
        replace: async (next) => {
          const parsed = Config(structuredClone(plainConfig(next)))
          currentConfig = parsed
          const payload = volatileConfig(parsed)
          if (typeof svc.replace === 'function') {
            await svc.replace(NS, payload, getRevision())
          } else if (typeof svc.update === 'function') {
            await svc.update(NS, payload, getRevision())
          }
          return parsed
        },
        update: async (patch) => {
          const merged = Config({ ...publicConfig(live()), ...plainConfig(patch) })
          currentConfig = merged
          const payload = volatileConfig(merged)
          if (typeof svc.update === 'function') {
            await svc.update(NS, payload, getRevision())
          } else if (typeof svc.replace === 'function') {
            await svc.replace(NS, payload, getRevision())
          }
          return merged
        },
        watch: (cb) => {
          if (typeof svc.watch === 'function') return svc.watch(cb)
          return () => {}
        },
      }
    }
    return undefined
  }

  if (typeof ctx.inject === 'function') {
    ctx.inject(['settings'], (sctx) => {
      if (typeof sctx.settings?.register === 'function') {
        const scope = sctx.settings.register(NS, Config, { base: config })
        settingsApi = scope
        getConfig = () => (scope?.get?.() ?? config) ?? config
        sctx.effect(() => scope.watch((next) => {
          syncProviderState(live())
        }), 'dsh-clinebot: settings')
      } else {
        settingsApi = createSettingsAdapter(sctx.settings)
      }
      sctx.effect(() => () => {
        getConfig = () => config
        settingsApi = undefined
      })
    })
  } else {
    const settingsService = (ctx?.get && ctx.get('settings')) || ctx?.settings
    if (typeof settingsService?.register === 'function') {
      const scope = settingsService.register(NS, Config, { base: config })
      settingsApi = scope
      getConfig = () => (scope?.get?.() ?? config) ?? config
      if (typeof ctx.effect === 'function') {
        ctx.effect(() => scope.watch((next) => {
          syncProviderState(live())
        }), 'dsh-clinebot: settings')
      }
    } else {
      settingsApi = createSettingsAdapter(settingsService)
    }
  }

  syncProviderState(live())
  if (typeof ctx.effect === 'function') {
    ctx.effect(() => {
      const timer = setTimeout(triggerAutoDiscover, 500)
      return () => clearTimeout(timer)
    }, 'dsh-clinebot: auto-discover')
  } else {
    setTimeout(triggerAutoDiscover, 500)
  }

  if (ctx.webServer?.register) {
    const unregisterUpdater = registerPluginUpdater(ctx, {
      endpoint: '/dsh-clinebot/update',
      packageName: name,
      manifestUrl: new URL('../package.json', import.meta.url),
    })
    if (typeof ctx.effect === 'function') {
      ctx.effect(() => () => unregisterUpdater?.(), 'dsh-clinebot: updater')
    }

    const routeEnv = {
      live,
      getSettingsApi: () => settingsApi,
      syncProviderState,
      triggerAutoDiscover,
    }

    registerSettingsRoutes(ctx, routeEnv)
    registerAccountsRoutes(ctx, routeEnv)
    registerModelsRoutes(ctx, routeEnv)
    registerAuthRoutes(ctx, routeEnv)
  }

  registerSlashCommand(ctx, {
    live,
    getSettingsApi: () => settingsApi,
    syncProviderState,
  })

  return {
    getStatus: () => buildStatus(ctx, live()),
    registerProvider: (models) => upsertPiAiProvider(ctx, live(), models),
    unregisterProvider: () => removePiAiProvider(ctx),
    recordRequestMetrics: (metrics) => recordSessionRequest(metrics),
    getSessionStats: () => ({ ...sessionStats }),
    getUsageLimits: async () => {
      const pub = publicConfig(live())
      const key = await resolveKeyValue(ctx, pub.apiKeyEnv)
      return fetchUsageLimits(pub.baseUrl, key.value)
    },
    runSmokeTest: async (model) => {
      const pub = publicConfig(live())
      const activeKey = await resolveActiveAccountKey(ctx, live())
      const res = await smokeChat(pub.baseUrl, activeKey.value, { model: model || pub.defaultModel })
      recordSessionRequest({
        latencyMs: res.latencyMs,
        ok: res.ok,
        error: res.error,
        promptTokens: res.promptTokens || 5,
        completionTokens: res.completionTokens || 10,
      })
      if (res.status === 429) {
        const failover = await rotateToNextAccount(ctx, live(), 'service_429', settingsApi)
        if (failover.rotated) {
          await syncProviderState(live())
        }
      }
      return res
    },
  }
}
