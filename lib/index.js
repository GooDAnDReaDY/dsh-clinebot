import { Config, publicConfig, plainConfig, volatileConfig, isVolatileRef, NS, LLM_PI_AI_NS } from './config.js'
import { registerPluginUpdater } from './updater.js'
import {
  sessionStats,
  recordSessionRequest,
  resetSessionStats,
  clearUsageCache,
  clearProbeCache,
} from './cline-client.js'
import {
  rotateToNextAccount,
  isQuotaExceededError,
} from './account-pool.js'
import { PROVIDER_ID } from './models.js'
import {
  upsertPiAiProvider,
  removePiAiProvider,
  autoDiscoverPlanModels,
  resolveActiveAccountKey,
} from './provider-sync.js'
import { registerSettingsRoutes } from './routes/settings.js'
import { registerAccountsRoutes } from './routes/accounts.js'
import { registerModelsRoutes } from './routes/models.js'
import { registerAuthRoutes } from './routes/auth.js'
import { registerProxyRoutes } from './routes/proxy.js'
import { startLoopbackProxyServer, stopLoopbackProxyServer } from './proxy-server.js'
import { registerSlashCommand } from './slash-command.js'
import { recordUsage, loadStats, flushStats, resolvePath, switchStatsStorage } from './stats-storage.js'

export const name = '@goodandready/dsh-clinebot'
export const inject = ['webServer', 'credentials']

export function configReader(config) {
  return () => config
}

export { NS, LLM_PI_AI_NS, Config, sessionStats, recordSessionRequest, resetSessionStats, rotateToNextAccount }

export function apply(ctx, config) {
  let currentConfig = config
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
  const live = () => (getConfig() ? Config(structuredClone(plainConfig(getConfig()))) : config)
  let settingsApi

  const syncProviderState = async (cfg) => {
    try {
      const pub = publicConfig(cfg)
      if (!pub.enabled) {
        await removePiAiProvider(ctx)
        return
      }
      if (pub.proxyMode !== false && (ctx?.webServer || typeof ctx?.get === 'function')) {
        await startLoopbackProxyServer(ctx, routeEnv)
      } else {
        await stopLoopbackProxyServer()
      }
      const activeKey = await resolveActiveAccountKey(ctx, cfg)
      if (activeKey.value) {
        await upsertPiAiProvider(ctx, cfg, pub.enabledModels)
      }
    } catch {
      /* ignore transient settings unavailable */
    }
  }

  const triggerAutoDiscover = () => {
    autoDiscoverPlanModels(ctx, { live, getSettingsApi: () => settingsApi, syncProviderState })
  }

  let activeStatsPath = resolvePath(publicConfig(live()).statsPath)
  loadStats(activeStatsPath)

  const syncStatsStorage = (cfg) => {
    const nextPath = resolvePath(publicConfig(cfg).statsPath)
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
      return parsed
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
      return merged
    },
    watch: (cb) => {
      const svc = ctx?.get?.('settings')
      if (typeof svc?.watch === 'function') return svc.watch(cb)
      return () => {}
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

  if (typeof ctx.effect === 'function') {
    ctx.effect(() => {
      return () => {
        stopLoopbackProxyServer()
      }
    }, 'dsh-clinebot: loopback-proxy-server')
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

  if (ctx.webServer?.register) {
    const unregisterUpdater = registerPluginUpdater(ctx, {
      endpoint: '/dsh-clinebot/update',
      packageName: name,
      manifestUrl: new URL('../package.json', import.meta.url),
    })
    if (typeof ctx.effect === 'function') {
      ctx.effect(() => () => unregisterUpdater?.(), 'dsh-clinebot: updater')
    }

    registerSettingsRoutes(ctx, routeEnv)
    registerAccountsRoutes(ctx, routeEnv)
    registerModelsRoutes(ctx, routeEnv)
    registerAuthRoutes(ctx, routeEnv)
    registerProxyRoutes(ctx, routeEnv)
  }

  registerSlashCommand(ctx, {
    live,
    getSettingsApi: () => settingsApi,
    syncProviderState,
  })

  let lastFailoverAt = 0

  const handleStream429 = async () => {
    const now = Date.now()
    if (now - lastFailoverAt < 30000) {
      ctx?.logger?.warn?.('[dsh-clinebot] Suppressing rapid failover rotation within 30s storm window')
      return
    }
    lastFailoverAt = now
    try {
      const failover = await rotateToNextAccount(ctx, live(), 'stream_429', settingsApi)
      if (failover?.rotated) {
        await syncProviderState(live())
      }
    } catch (err) {
      ctx?.logger?.warn?.('[dsh-clinebot] Auto-failover rotation failed: ' + (err?.message || err))
    }
  }

  if (typeof ctx.on === 'function') {
    const unlisten = ctx.on('llm/stream', (options, next) => {
      const isCline = options?.provider === PROVIDER_ID
      const stream = next()
      const startTime = Date.now()
      let promptTokens = 0
      let completionTokens = 0
      let finished = false

      return (async function* () {
        try {
          for await (const chunk of stream) {
            if (isCline && chunk?.type === 'usage' && chunk?.usage) {
              const u = chunk.usage
              promptTokens += (Number(u.inputTokens) || 0) + (Number(u.cacheReadTokens) || 0) + (Number(u.cacheWriteTokens) || 0)
              completionTokens += Number(u.outputTokens) || 0
            }
            if (isCline && chunk?.type === 'finish' && chunk?.reason) {
              finished = true
              const latencyMs = Date.now() - startTime
              const reason = chunk.reason
              const failure = reason.failure || {}
              const isError = reason.kind === 'error'
              const isAborted = reason.kind === 'aborted'
              const is429 = failure.status === 429 || failure.code === 429 || failure.code === 'rate_limit_exceeded'
              const isExceeded = isQuotaExceededError(`${failure.message || ''} ${failure.code || ''}`)

              const isProxy = publicConfig(live()).proxyMode !== false
              if (isError) {
                recordSessionRequest({
                  latencyMs,
                  ok: false,
                  error: failure.message || 'Stream error',
                  promptTokens,
                  completionTokens,
                  model: options?.model,
                })
                if (!isProxy) {
                  recordUsage({
                    model: options?.model,
                    promptTokens,
                    completionTokens,
                    totalTokens: promptTokens + completionTokens,
                    isError: true,
                    is429,
                    statsPath: publicConfig(live()).statsPath,
                  })
                }
                if (is429 || isExceeded) {
                  handleStream429()
                }
              } else if (isAborted) {
                recordSessionRequest({
                  latencyMs,
                  ok: true,
                  aborted: true,
                  promptTokens,
                  completionTokens,
                  model: options?.model,
                })
              } else {
                recordSessionRequest({
                  latencyMs,
                  ok: true,
                  promptTokens,
                  completionTokens,
                  model: options?.model,
                })
                if (!isProxy) {
                  recordUsage({
                    model: options?.model,
                    promptTokens,
                    completionTokens,
                    totalTokens: promptTokens + completionTokens,
                    statsPath: publicConfig(live()).statsPath,
                  })
                }
              }
            }
            yield chunk
          }
          if (isCline && !finished) {
            recordSessionRequest({
              latencyMs: Date.now() - startTime,
              ok: true,
              promptTokens,
              completionTokens,
              model: options?.model,
            })
            const isProxy = publicConfig(live()).proxyMode !== false
            if (!isProxy) {
              recordUsage({
                model: options?.model,
                promptTokens,
                completionTokens,
                totalTokens: promptTokens + completionTokens,
                statsPath: publicConfig(live()).statsPath,
              })
            }
          }
        } catch (err) {
          if (isCline) {
            const latencyMs = Date.now() - startTime
            const status = err?.status || err?.statusCode
            const msg = String(err?.message || err)
            recordSessionRequest({
              latencyMs,
              ok: false,
              error: msg,
              promptTokens,
              completionTokens,
              model: options?.model,
            })
            const isProxy = publicConfig(live()).proxyMode !== false
            if (!isProxy) {
              recordUsage({
                model: options?.model,
                promptTokens,
                completionTokens,
                totalTokens: promptTokens + completionTokens,
                isError: true,
                is429: status === 429,
                statsPath: publicConfig(live()).statsPath,
              })
            }
            if (status === 429 || isQuotaExceededError(msg)) {
              handleStream429()
            }
          }
          throw err
        }
      })()
    }, { global: true, prepend: true })

    if (typeof ctx.effect === 'function') {
      ctx.effect(() => () => unlisten?.(), 'dsh-clinebot: llm/stream failover')
    }
  }
}
