import { Config, publicConfig, plainConfig, volatileConfig, isVolatileRef, NS } from './config.js'
import { registerPluginUpdater } from './updater.js'
import {
  sessionStats,
  recordSessionRequest,
  resetSessionStats,
  clearUsageCache,
  clearProbeCache,
} from './cline-client.js'
import { rotateToNextAccount } from './account-pool.js'
import { PROVIDER_ID } from './models.js'
import {
  autoDiscoverPlanModels,
} from './provider-sync.js'
import { registerSettingsRoutes } from './routes/settings.js'
import { registerAccountsRoutes } from './routes/accounts.js'
import { registerModelsRoutes } from './routes/models.js'
import { registerAuthRoutes } from './routes/auth.js'
import { ClineBotAdapter } from './adapter.js'
import { registerSlashCommand } from './slash-command.js'
import { ClineBotSearchProvider, CLINEBOT_SEARCH_PROVIDER_ID } from './web-search.js'
import { resolveAccountPool } from './account-pool.js'
import { loadStats, flushStats, resolvePath, switchStatsStorage, setStatsRetentionDays } from './stats-storage.js'
import { loadPublicPriceCache } from './price-sync.js'
import { setPublicPriceCatalog } from './model-prices.js'
import { service, migrateLegacyPiAiProvider } from './services.js'
import { applyTuiSettings } from './tui-settings.js'

export const name = '@goodandready/dsh-clinebot'
export const inject = []

export function configReader(config) {
  return () => config
}

export { NS, Config, sessionStats, recordSessionRequest, resetSessionStats, rotateToNextAccount }

export function apply(ctx, config) {
  let currentConfig = config || {}
  const overrides = {}
  const getConfig = () => {
    if (!currentConfig) return currentConfig
    if (Object.isFrozen(currentConfig)) {
      return new Proxy({}, {
        get(_target, prop) {
          const orig = Reflect.get(currentConfig, prop)
          if (isVolatileRef(orig) || Object.getOwnPropertyDescriptor(currentConfig, prop)?.get) {
            return orig
          }
          if (prop in overrides) {
            return overrides[prop]
          }
          return orig
        },
        has(_target, prop) {
          return prop in overrides || Reflect.has(currentConfig, prop)
        },
        ownKeys() {
          return Array.from(new Set([...Reflect.ownKeys(currentConfig), ...Object.keys(overrides)]))
        },
        getOwnPropertyDescriptor(_target, prop) {
          if (prop in overrides) {
            return { configurable: true, enumerable: true, value: overrides[prop], writable: true }
          }
          const desc = Object.getOwnPropertyDescriptor(currentConfig, prop)
          if (desc) {
            return { configurable: true, enumerable: desc.enumerable ?? true, value: Reflect.get(currentConfig, prop) }
          }
          return undefined
        }
      })
    }
    return currentConfig
  }
  const live = () => plainConfig(Config(plainConfig(getConfig() || config || {})))
  let settingsApi
  let adapterRegistration = null
  let adapterDirectory = null

  const syncProviderState = async (cfg) => {
    try {
      const pub = publicConfig(cfg)
      if (adapterRegistration) {
        adapterRegistration.replace(pub.enabled ? [PROVIDER_ID] : [])
      }
    } catch {
      /* ignore transient settings unavailable */
    }
  }

  const triggerAutoDiscover = () => {
    autoDiscoverPlanModels(ctx, { live, getSettingsApi: () => settingsApi, syncProviderState })
  }

  let activeStatsPath = resolvePath(publicConfig(live()).statsPath)
  setStatsRetentionDays(publicConfig(live()).statsRetentionDays)
  setPublicPriceCatalog(loadPublicPriceCache(publicConfig(live()).priceCatalogPath))
  loadStats(activeStatsPath)

  const syncStatsStorage = (cfg) => {
    const pub = publicConfig(cfg)
    setStatsRetentionDays(pub.statsRetentionDays)
    setPublicPriceCatalog(loadPublicPriceCache(pub.priceCatalogPath))
    const nextPath = resolvePath(pub.statsPath)
    if (nextPath !== activeStatsPath) {
      switchStatsStorage(nextPath)
      activeStatsPath = nextPath
    }
  }

  const normalizeEndpoint = (url) => String(url || '').trim().replace(/\/+$/, '')
  const getCatalogIdentity = (cfg) => {
    const pub = publicConfig(cfg)
    return `${normalizeEndpoint(pub.baseUrl)}::${String(pub.activeAccount || '').trim()}::${String(pub.apiKeyEnv || '').trim()}`
  }

  let lastCatalogIdentity = getCatalogIdentity(live())
  const resetCatalogSnapshot = () => {
    try {
      if (currentConfig && typeof currentConfig === 'object') {
        currentConfig.dynamicModels = []
        currentConfig.planSyncedAt = 0
      }
    } catch {
      /* ignore read-only or frozen */
    }
    overrides.dynamicModels = []
    overrides.planSyncedAt = 0
    clearUsageCache()
    clearProbeCache()
  }

  if (typeof ctx?.on === 'function') {
    ctx.on('loader/volatile-update', () => {
      const liveCfg = live()
      const currentIdentity = getCatalogIdentity(liveCfg)
      if (currentIdentity !== lastCatalogIdentity) {
        lastCatalogIdentity = currentIdentity
        resetCatalogSnapshot()
      }
      syncStatsStorage(liveCfg)
    })
  }

  const getRevision = (svc) => {
    try {
      return svc?.describe?.().find((row) => row.ns === NS)?.revision
    } catch {
      return undefined
    }
  }

  const applyConfigMutations = (target, source) => {
    const targetConfig = typeof target === 'function' ? target() : target
    if (targetConfig && typeof targetConfig === 'object') {
      if (Object.isFrozen(targetConfig)) {
        for (const [key, value] of Object.entries(source)) {
          const orig = targetConfig[key]
          if (isVolatileRef(orig) || Object.getOwnPropertyDescriptor(targetConfig, key)?.get) {
            continue
          }
          overrides[key] = value
        }
        return
      }
      for (const [key, value] of Object.entries(source)) {
        try {
          if (isVolatileRef(targetConfig[key])) {
            // Cosmokit native Volatile references are reactive and authoritative;
            // preserve the reference without overwriting with plain value.
            continue
          }
          const desc = Object.getOwnPropertyDescriptor(targetConfig, key)
          if (desc?.get && !desc.set) {
            continue
          }
          if (desc?.set) {
            targetConfig[key] = value
          } else {
            targetConfig[key] = value
          }
        } catch {
          /* ignore read-only */
        }
      }
    }
  }

  settingsApi = {
    get: () => live(),
    replace: async (next) => {
      const svc = ctx?.get?.('settings')
      if (!svc || (typeof svc.replace !== 'function' && typeof svc.update !== 'function')) {
        throw new Error('DSH settings service is unavailable or non-writable')
      }
      const prevIdentity = getCatalogIdentity(live())
      const parsed = Config(structuredClone(plainConfig(next)))
      const nextIdentity = getCatalogIdentity(parsed)
      const identityChanged = nextIdentity !== prevIdentity
      if (identityChanged) {
        if (!('dynamicModels' in next)) parsed.dynamicModels = []
        if (!('planSyncedAt' in next)) parsed.planSyncedAt = 0
      }
      const payload = volatileConfig(parsed)
      const rev = getRevision(svc)
      if (typeof svc.replace === 'function') {
        await svc.replace(NS, payload, rev)
      } else {
        await svc.update(NS, payload, rev)
      }
      if (identityChanged) {
        lastCatalogIdentity = nextIdentity
        resetCatalogSnapshot()
      }
      applyConfigMutations(currentConfig, parsed)
      syncStatsStorage(live())
      await syncProviderState(live())
      return plainConfig(parsed)
    },
    update: async (patch) => {
      const svc = ctx?.get?.('settings')
      if (!svc || (typeof svc.update !== 'function' && typeof svc.replace !== 'function')) {
        throw new Error('DSH settings service is unavailable or non-writable')
      }
      const prevIdentity = getCatalogIdentity(live())
      const merged = Config({ ...publicConfig(live()), ...plainConfig(patch) })
      const nextIdentity = getCatalogIdentity(merged)
      const identityChanged = nextIdentity !== prevIdentity
      if (identityChanged) {
        if (!('dynamicModels' in patch)) merged.dynamicModels = []
        if (!('planSyncedAt' in patch)) merged.planSyncedAt = 0
      }
      const payload = volatileConfig(merged)
      const rev = getRevision(svc)
      if (typeof svc.update === 'function') {
        await svc.update(NS, payload, rev)
      } else {
        await svc.replace(NS, payload, rev)
      }
      if (identityChanged) {
        lastCatalogIdentity = nextIdentity
        resetCatalogSnapshot()
      }
      applyConfigMutations(currentConfig, merged)
      syncStatsStorage(live())
      await syncProviderState(live())
      return plainConfig(merged)
    },

  }

  if (typeof ctx.effect === 'function') {
    ctx.effect(() => {
      return () => {
        flushStats(activeStatsPath)
      }
    }, 'dsh-clinebot: stats-storage')
  }

  const routeEnv = {
    live,
    getSettingsApi: () => settingsApi,
    syncProviderState,
    triggerAutoDiscover,
  }

  const ensureAdapter = () => {
    if (typeof ctx.inject !== 'function') return
    ctx.inject(['llm'], (llmCtx) => {
      const llm = llmCtx?.llm || llmCtx?.get?.('llm')
      if (!llm || typeof llm.registerAdapter !== 'function') return
      try {
        const adapter = new ClineBotAdapter({
          ctx,
          live,
          resolveAttachments: () => ctx?.get?.('attachments') || ctx?.attachments,
          logger: ctx?.logger,
        })
        adapterRegistration = llm.registerAdapter([PROVIDER_ID], adapter)
        if (typeof llm.registerConfigurableProviders === 'function') {
          adapterDirectory = llm.registerConfigurableProviders([{
            provider: PROVIDER_ID,
            displayName: 'ClineBot (ClinePass)',
            settingsNs: NS,
            settingsPath: [],
            defaultBaseURL: 'https://api.cline.bot/api/v1',
          }])
        }
        ctx.effect(() => () => {
          try { adapterDirectory?.() } catch {}
          try { adapterRegistration?.() } catch {}
          adapterDirectory = null
          adapterRegistration = null
        }, 'dsh-clinebot: llm adapter')
        void syncProviderState(live())
        void migrateLegacyPiAiProvider(ctx)
      } catch (error) {
        ctx?.logger?.warn?.('[dsh-clinebot] Failed to register llm adapter: ' + (error?.message || error))
      }
    })
  }
  ensureAdapter()
  applyTuiSettings(ctx, { live })

  if (typeof ctx.inject === 'function') {
    ctx.inject(['settings'], () => {
      void migrateLegacyPiAiProvider(ctx)
    })
  }

  syncProviderState(live())
  if (typeof ctx.effect === 'function') {
    ctx.effect(() => {
      const timer = setTimeout(triggerAutoDiscover, 500)
      const retryTimer = setTimeout(triggerAutoDiscover, 3000)
      return () => {
        clearTimeout(timer)
        clearTimeout(retryTimer)
      }
    }, 'dsh-clinebot: auto-discover')
  }

  const registerWebSurfaces = (webCtx) => {
    if (!service(webCtx, 'webServer')?.register) return
    const unregisterUpdater = registerPluginUpdater(webCtx, {
      endpoint: '/dsh-clinebot/update',
      packageName: name,
      manifestUrl: new URL('../package.json', import.meta.url),
    })
    if (typeof webCtx.effect === 'function') {
      webCtx.effect(() => () => unregisterUpdater?.(), 'dsh-clinebot: updater')
    }

    registerSettingsRoutes(webCtx, routeEnv)
    registerAccountsRoutes(webCtx, routeEnv)
    registerModelsRoutes(webCtx, routeEnv)
    registerAuthRoutes(webCtx, routeEnv)
  }

  if (service(ctx, 'webServer')?.register) {
    registerWebSurfaces(ctx)
  } else if (typeof ctx.inject === 'function') {
    // Headless/TUI profiles mount no web server; the adapter and slash command
    // still work, and web routes appear if a server mounts later.
    ctx.inject(['webServer'], registerWebSurfaces)
  }

  registerSlashCommand(ctx, {
    live,
    getSettingsApi: () => settingsApi,
    syncProviderState,
  })

  // Native DSH WebSearchProvider over ctx.web (#233)
  if (typeof ctx.inject === 'function') {
    ctx.inject(['web'], (webCtx) => {
      const cfg = publicConfig(live())
      if (cfg.webSearch === false) return
      const web = webCtx?.get?.('web')
      if (web && typeof web.registerSearchProvider === 'function') {
        const searchProvider = new ClineBotSearchProvider({
          getBaseUrl: () => publicConfig(live()).baseUrl,
          getApiKey: async () => {
            const pool = await resolveAccountPool(ctx, live())
            const active = pool.find((a) => a.present && a.value)
            return active?.value || ''
          },
        })
        try {
          const unreg = web.registerSearchProvider(CLINEBOT_SEARCH_PROVIDER_ID, searchProvider)
          if (typeof ctx.effect === 'function') {
            ctx.effect(() => () => {
              try { if (typeof unreg === 'function') unreg() } catch {}
            }, 'dsh-clinebot: web search provider')
          }
        } catch (e) {
          ctx?.logger?.warn?.('[dsh-clinebot] Failed to register web search provider: ' + (e?.message || e))
        }
      }
    })
  }
}
