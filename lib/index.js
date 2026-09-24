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
  isQuotaExceededError,
} from './cline-client.js'
import { PROVIDER_ID } from './models.js'
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
        await removePiAiProvider(ctx)
        return
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
  }

  syncProviderState(live())
  if (typeof ctx.effect === 'function') {
    ctx.effect(() => {
      const timer = setTimeout(triggerAutoDiscover, 500)
      return () => clearTimeout(timer)
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

              if (isError) {
                recordSessionRequest({
                  latencyMs,
                  ok: false,
                  error: failure.message || 'Stream error',
                  promptTokens,
                  completionTokens,
                  model: options?.model,
                })
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
