import z from '@deepseek-ai/schemastery'
import { credentialRef } from '@deepseek-ai/dsh-credentials'
import { writeJson, readBody, isTrustedSettingsRequest } from './http.js'
import { registerPluginUpdater } from './updater.js'
import {
  CLINE_MODELS,
  DEFAULT_MODEL_ID,
  PROVIDER_ID,
  PROVIDER_DISPLAY_NAME,
  getAllModels,
  getDefaultModelIds,
  getActiveModelIds,
  parsePlanIncludedModels,
  saveModelsDiskCache,
  loadModelsDiskCache,
  isVisionModel,
} from './models.js'
import {
  DEFAULT_BASE_URL,
  DEFAULT_API_KEY_ENV,
  DEFAULT_TIMEOUT_MS,
  DEFAULT_SMOKE_TIMEOUT_MS,
  normalizeBaseUrl,
  resolveApiKey,
  resolveKeyValue,
  resolveAccountPool,
  rotateToNextAccount,
  saveCredentialKey,
  fetchUsageLimits,
  probeHealth,
  smokeChat,
  buildPiAiProvider,
  sessionStats,
  recordSessionRequest,
  resetSessionStats,
  usageCache,
} from './cline-client.js'

export const name = '@goodandready/dsh-clinebot'
export const inject = ['settings', 'webServer', 'credentials']

export const NS = 'dsh-clinebot'
export const LLM_PI_AI_NS = 'llm-pi-ai'

export { sessionStats, recordSessionRequest, resetSessionStats, rotateToNextAccount }

export const Config = z.object({
  enabled: z.boolean().default(true)
    .description('When true, ClineBot is registered as a model provider in DSH.'),
  baseUrl: z.string().default(DEFAULT_BASE_URL)
    .description('Base API URL (default: https://api.cline.bot/api/v1).'),
  apiKeyEnv: z.string().default(DEFAULT_API_KEY_ENV)
    .description('Credential / env name containing the ClinePass API key (never store key directly here).'),
  defaultModel: z.string().default(DEFAULT_MODEL_ID)
    .description('Default model ID for chat and smoke tests.'),
  disabledModels: z.array(z.string()).default([])
    .description('List of model IDs explicitly disabled by the user (new models are enabled automatically).'),
  enabledModels: z.array(z.string()).default([])
    .description('Deprecated: preserved for backwards compatibility with earlier versions.'),
  dynamicModels: z.array(z.object({
    id: z.string(),
    name: z.string(),
    description: z.string().default(''),
    contextLength: z.number().default(200000),
    maxTokens: z.number().default(8192),
    input: z.array(z.string()).default(['text']),
    category: z.string().default('general'),
    isCustom: z.boolean().default(false),
  })).default([])
    .description('Models automatically discovered from the official ClinePass subscription plan.'),
  timeoutMs: z.number().default(DEFAULT_TIMEOUT_MS)
    .description('HTTP probe timeout in milliseconds.'),
  smokeTimeoutMs: z.number().default(DEFAULT_SMOKE_TIMEOUT_MS)
    .description('Timeout for smoke chat completions in milliseconds.'),
  modelsCachePath: z.string().default('~/.dsh/clinebot-models-cache.json')
    .description('Local on-disk cache path for models snapshot.'),
  accounts: z.array(z.object({
    label: z.string().default(''),
    apiKeyEnv: z.string(),
  })).default([])
    .description('Additional accounts for multi-account failover and rate limit rotation.'),
  activeAccount: z.string().default('')
    .description('Manually pinned active account envName or empty for auto/default.'),
})

function publicConfig(cfg) {
  const dynamic = Array.isArray(cfg?.dynamicModels) ? cfg.dynamicModels : []
  const allModels = getAllModels(dynamic)
  const allDefaultIds = allModels.map((m) => m.id)

  // Migration / compatibility: if disabledModels was not yet set, but enabledModels was provided
  let disabledList = Array.isArray(cfg?.disabledModels) ? cfg.disabledModels : []
  if (!Array.isArray(cfg?.disabledModels) || (cfg.disabledModels.length === 0 && Array.isArray(cfg?.enabledModels) && cfg.enabledModels.length > 0)) {
    const enabledSet = new Set(cfg.enabledModels)
    disabledList = allDefaultIds.filter((id) => !enabledSet.has(id))
  }

  const activeIds = getActiveModelIds(allDefaultIds, disabledList)

  return {
    enabled: !!cfg?.enabled,
    baseUrl: normalizeBaseUrl(cfg?.baseUrl),
    apiKeyEnv: cfg?.apiKeyEnv || DEFAULT_API_KEY_ENV,
    defaultModel: cfg?.defaultModel || DEFAULT_MODEL_ID,
    dynamicModels: dynamic,
    disabledModels: disabledList,
    enabledModels: activeIds,
    timeoutMs: Number(cfg?.timeoutMs) || DEFAULT_TIMEOUT_MS,
    smokeTimeoutMs: Number(cfg?.smokeTimeoutMs) || DEFAULT_SMOKE_TIMEOUT_MS,
    modelsCachePath: String(cfg?.modelsCachePath || '~/.dsh/clinebot-models-cache.json'),
    accounts: Array.isArray(cfg?.accounts) ? cfg.accounts : [],
    activeAccount: String(cfg?.activeAccount || ''),
  }
}

import os from 'node:os'
import path from 'node:path'

function resolvePathWithHome(p) {
  if (!p || typeof p !== 'string') return ''
  if (p === '~') return os.homedir()
  if (p.startsWith('~/') || p.startsWith('~\\')) {
    return path.join(os.homedir(), p.slice(2))
  }
  return p
}

async function checkRegisteredInPiAi(ctx) {
  const settings = ctx?.get?.('settings')
  if (!settings?.get) return false
  try {
    const piAi = settings.get(LLM_PI_AI_NS)
    return !!piAi?.providers?.[PROVIDER_ID]
  } catch {
    return false
  }
}

async function resolveActiveAccountKey(ctx, cfg) {
  const pool = await resolveAccountPool(ctx, cfg)
  const configured = pool.filter((acc) => acc.present && acc.value)
  if (!configured.length) {
    return { envName: publicConfig(cfg).apiKeyEnv, value: '', source: 'none', id: 'default' }
  }
  const pub = publicConfig(cfg)
  if (pub.activeAccount) {
    const pinned = configured.find((acc) => acc.apiKeyEnv === pub.activeAccount || acc.id === pub.activeAccount)
    if (pinned) return pinned
  }
  return configured[0]
}

async function buildStatus(ctx, cfg) {
  const pub = publicConfig(cfg)
  const probeTimeout = Math.min(2500, pub.timeoutMs || 2500)

  // Concurrent resolution of keys, health probe (SWR cached), accounts pool and DSH registration
  const [key, pool, isRegistered, health] = await Promise.all([
    resolveKeyValue(ctx, pub.apiKeyEnv),
    resolveAccountPool(ctx, cfg),
    checkRegisteredInPiAi(ctx),
    probeHealth(pub.baseUrl, { timeoutMs: probeTimeout }),
  ])

  const activeAcc = await resolveActiveAccountKey(ctx, cfg)
  const allModels = getAllModels(pub.dynamicModels)

  let usage = null
  const keyToUse = activeAcc.value || key.value
  if (keyToUse) {
    // Uses 60s cache; if cache miss, times out quickly
    usage = await fetchUsageLimits(pub.baseUrl, keyToUse, { timeoutMs: probeTimeout }).catch(() => null)
  }

  // Evaluate warning state
  let quotaWarning = null
  if (usage?.windows?.fiveHour) {
    const pct = usage.windows.fiveHour.percentUsed
    if (pct >= 95) {
      quotaWarning = {
        level: 'exhausted',
        message: `5-hour rolling limit is almost exhausted (${pct}%). New requests may be rejected until quota reset.`,
        resetsAt: usage.windows.fiveHour.resetsAt,
      }
    } else if (pct >= 80) {
      quotaWarning = {
        level: 'warning',
        message: `Notice: ${pct}% of the 5-hour rolling limit has been consumed.`,
        resetsAt: usage.windows.fiveHour.resetsAt,
      }
    }
  }

  return {
    ok: true,
    providerId: PROVIDER_ID,
    displayName: PROVIDER_DISPLAY_NAME,
    config: pub,
    key: {
      envName: activeAcc.apiKeyEnv || key.envName,
      present: !!(activeAcc.value || key.value),
      source: activeAcc.source || key.source,
    },
    accounts: pool.map((acc) => ({
      id: acc.id,
      label: acc.label,
      apiKeyEnv: acc.apiKeyEnv,
      present: acc.present,
      source: acc.source,
      isPinned: acc.isPinned,
    })),
    activeAccount: activeAcc.apiKeyEnv,
    health,
    usage,
    quotaWarning,
    sessionStats: { ...sessionStats },
    isRegistered,
    availableModels: allModels,
  }
}

async function upsertPiAiProvider(ctx, cfg, activeModelIds) {
  const settings = ctx?.get?.('settings')
  if (!settings?.mutate) {
    throw new Error('DSH settings service unavailable')
  }

  const pub = publicConfig(cfg)
  const allModels = getAllModels(pub.dynamicModels)
  const allowedSet = new Set(activeModelIds || pub.enabledModels)
  const modelsToRegister = allModels.filter((m) => allowedSet.has(m.id))

  const providerObj = buildPiAiProvider({
    baseUrl: pub.baseUrl,
    apiKeyEnv: pub.apiKeyEnv,
    models: modelsToRegister.length ? modelsToRegister : allModels,
    customModels: pub.dynamicModels,
    displayName: PROVIDER_DISPLAY_NAME,
  })

  await settings.mutate(LLM_PI_AI_NS, [
    {
      op: 'set',
      path: ['providers', PROVIDER_ID],
      value: providerObj,
    },
  ])

  return providerObj
}

async function removePiAiProvider(ctx) {
  const settings = ctx?.get?.('settings')
  if (!settings?.mutate) {
    throw new Error('DSH settings service unavailable')
  }

  await settings.mutate(LLM_PI_AI_NS, [
    {
      op: 'remove',
      path: ['providers', PROVIDER_ID],
    },
  ])
  return { ok: true }
}

function formatProgressBar(pct, totalWidth = 10) {
  const clamped = Math.max(0, Math.min(100, pct || 0))
  const filled = Math.round((clamped / 100) * totalWidth)
  const empty = Math.max(0, totalWidth - filled)
  return `[${'█'.repeat(filled)}${'░'.repeat(empty)}] ${clamped}%`
}

export function apply(ctx, config) {
  let getConfig = () => config
  const live = () => (getConfig() ? Config(structuredClone(getConfig())) : config)
  let settingsApi

  // Declarative sync helper: auto-registers or unregisters provider based on config & key availability
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

  // Background check for subscription plan models (runs once on startup or key save)
  const autoDiscoverPlanModels = async (cfg) => {
    try {
      const pub = publicConfig(cfg)
      const cacheFile = resolvePathWithHome(pub.modelsCachePath)

      // 1. If dynamicModels is empty, attempt to load from disk cache first
      if ((!pub.dynamicModels || !pub.dynamicModels.length) && cacheFile) {
        const fromDisk = await loadModelsDiskCache(cacheFile)
        if (Array.isArray(fromDisk) && fromDisk.length && settingsApi?.replace) {
          const next = Config({ ...live(), dynamicModels: fromDisk })
          await settingsApi.replace(next)
          await syncProviderState(next)
        }
      }

      const activeAcc = await resolveActiveAccountKey(ctx, cfg)
      if (!activeAcc.value) return

      const usageData = await fetchUsageLimits(pub.baseUrl, activeAcc.value, {
        timeoutMs: Math.min(pub.timeoutMs, 5000),
        bypassCache: true,
      })

      if (usageData?.ok && Array.isArray(usageData.dynamicModels) && usageData.dynamicModels.length > 0) {
        const existingDynamic = pub.dynamicModels || []
        const existingIds = new Set(existingDynamic.map((m) => m.id))
        const hasNew = usageData.dynamicModels.some((m) => !existingIds.has(m.id))

        if (hasNew && settingsApi?.replace) {
          const next = Config({
            ...live(),
            dynamicModels: usageData.dynamicModels,
          })
          await settingsApi.replace(next)
          await syncProviderState(next)
          if (cacheFile) {
            await saveModelsDiskCache(cacheFile, usageData.dynamicModels)
          }
        }
      }
    } catch {
      /* best-effort discovery */
    }
  }

  if (typeof ctx.inject === 'function') {
    ctx.inject(['settings'], (sctx) => {
      const scope = sctx.settings.register(NS, Config, { base: config })
      settingsApi = scope
      getConfig = () => (scope?.get?.() ?? config) ?? config
      sctx.effect(() => scope.watch((next) => {
        syncProviderState(live())
      }), 'dsh-clinebot: settings')
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
    }
  }

  // On startup: ensure provider is synced to llm-pi-ai if key is present
  syncProviderState(live())
  // Background discover plan models on startup
  setTimeout(() => autoDiscoverPlanModels(live()), 500)

  // Web server HTTP route handlers
  if (ctx.webServer?.register) {
    // 0. GET & POST /dsh-clinebot/update — host one-click updater
    const unregisterUpdater = registerPluginUpdater(ctx, {
      endpoint: '/dsh-clinebot/update',
      packageName: name,
      manifestUrl: new URL('../package.json', import.meta.url),
    })
    if (typeof ctx.effect === 'function') {
      ctx.effect(() => () => unregisterUpdater?.(), 'dsh-clinebot: updater')
    }

    // 1. GET /dsh-clinebot/status
    ctx.effect(() => ctx.webServer.register({
      kind: 'exact',
      path: '/dsh-clinebot/status',
      handler: async (req, res) => {
        if (req.method !== 'GET') return writeJson(res, 405, { ok: false, error: 'GET only' })
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
          return writeJson(res, 200, { ok: true, config: publicConfig(live()) })
        }
        if (req.method !== 'PUT') {
          return writeJson(res, 405, { ok: false, error: 'GET or PUT' })
        }
        if (!isTrustedSettingsRequest(req)) {
          return writeJson(res, 403, { ok: false, error: 'same-origin only' })
        }
        if (!settingsApi) {
          return writeJson(res, 503, { ok: false, error: 'settings not ready' })
        }
        let payload
        try {
          payload = JSON.parse((await readBody(req)).toString('utf8') || '{}')
        } catch {
          return writeJson(res, 400, { ok: false, error: 'invalid json' })
        }
        if (payload && typeof payload.config === 'object') payload = payload.config
        try {
          const parsed = Config({ ...publicConfig(live()), ...payload })
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
        if (!isTrustedSettingsRequest(req)) {
          return writeJson(res, 403, { ok: false, error: 'Forbidden' })
        }
        try {
          const bodyBuf = await readBody(req)
          let body = {}
          try { body = JSON.parse(bodyBuf.toString('utf8')) } catch {}

          const apiKey = String(body.apiKey || '').trim()
          if (!apiKey) {
            return writeJson(res, 400, { ok: false, error: 'API key cannot be empty' })
          }

          const pub = publicConfig(live())
          const targetEnvName = String(body.apiKeyEnv || pub.apiKeyEnv || DEFAULT_API_KEY_ENV).trim()
          await saveCredentialKey(ctx, targetEnvName, apiKey)

          // Auto-sync provider to DSH Models and discover plan models
          await syncProviderState(live())
          autoDiscoverPlanModels(live())

          // Run validation probe with the newly saved key
          const validation = await smokeChat(pub.baseUrl, apiKey, {
            model: pub.defaultModel,
            timeoutMs: 15000,
          })

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

    // 4. GET /dsh-clinebot/usage — direct fresh usage limit query
    ctx.effect(() => ctx.webServer.register({
      kind: 'exact',
      path: '/dsh-clinebot/usage',
      handler: async (req, res) => {
        if (req.method !== 'GET') return writeJson(res, 405, { ok: false, error: 'GET only' })
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
          writeJson(res, usageData.ok ? 200 : 502, usageData)
        } catch (err) {
          writeJson(res, 500, { ok: false, error: String(err?.message || err) })
        }
      },
    }), 'dsh-clinebot: /usage')

    // 5. POST /dsh-clinebot/register — upsert into DSH llm-pi-ai
    ctx.effect(() => ctx.webServer.register({
      kind: 'exact',
      path: '/dsh-clinebot/register',
      handler: async (req, res) => {
        if (req.method !== 'POST') return writeJson(res, 405, { ok: false, error: 'POST only' })
        if (!isTrustedSettingsRequest(req)) {
          return writeJson(res, 403, { ok: false, error: 'Forbidden' })
        }
        try {
          const bodyBuf = await readBody(req)
          let body = {}
          try { body = JSON.parse(bodyBuf.toString('utf8')) } catch {}
          const activeModels = body.models || publicConfig(live()).enabledModels
          const result = await upsertPiAiProvider(ctx, live(), activeModels)
          writeJson(res, 200, { ok: true, provider: result })
        } catch (err) {
          writeJson(res, 500, { ok: false, error: String(err?.message || err) })
        }
      },
    }), 'dsh-clinebot: /register')

    // 6. POST /dsh-clinebot/unregister — remove from DSH
    ctx.effect(() => ctx.webServer.register({
      kind: 'exact',
      path: '/dsh-clinebot/unregister',
      handler: async (req, res) => {
        if (req.method !== 'POST') return writeJson(res, 405, { ok: false, error: 'POST only' })
        if (!isTrustedSettingsRequest(req)) {
          return writeJson(res, 403, { ok: false, error: 'Forbidden' })
        }
        try {
          await removePiAiProvider(ctx)
          writeJson(res, 200, { ok: true })
        } catch (err) {
          writeJson(res, 500, { ok: false, error: String(err?.message || err) })
        }
      },
    }), 'dsh-clinebot: /unregister')

    // 7. POST /dsh-clinebot/smoke — live ping test
    ctx.effect(() => ctx.webServer.register({
      kind: 'exact',
      path: '/dsh-clinebot/smoke',
      handler: async (req, res) => {
        if (req.method !== 'POST') return writeJson(res, 405, { ok: false, error: 'POST only' })
        if (!isTrustedSettingsRequest(req)) {
          return writeJson(res, 403, { ok: false, error: 'Forbidden' })
        }
        try {
          const bodyBuf = await readBody(req)
          let body = {}
          try { body = JSON.parse(bodyBuf.toString('utf8')) } catch {}

          const pub = publicConfig(live())
          const activeKey = await resolveActiveAccountKey(ctx, live())
          if (!activeKey.value) {
            return writeJson(res, 400, {
              ok: false,
              error: `API key not found. Ensure ${activeKey.envName} is added to DSH credentials or environment.`,
            })
          }

          const modelToTest = body.model || pub.defaultModel || DEFAULT_MODEL_ID
          const outcome = await smokeChat(pub.baseUrl, activeKey.value, {
            model: modelToTest,
            timeoutMs: pub.smokeTimeoutMs,
          })
          recordSessionRequest({
            latencyMs: outcome.latencyMs,
            ok: outcome.ok,
            error: outcome.error,
            promptTokens: outcome.promptTokens || 5,
            completionTokens: outcome.completionTokens || 10,
          })

          let failover = null
          if (outcome.status === 429) {
            failover = await rotateToNextAccount(ctx, live(), 'smoke_429', settingsApi)
            if (failover.rotated) {
              await syncProviderState(live())
            }
          }

          writeJson(res, outcome.ok ? 200 : 502, { ...outcome, failover })
        } catch (err) {
          recordSessionRequest({ ok: false, error: String(err?.message || err) })
          writeJson(res, 500, { ok: false, error: String(err?.message || err) })
        }
      },
    }), 'dsh-clinebot: /smoke')

    // 8. POST /dsh-clinebot/models/sync — sync real models from official ClinePass subscription plan
    ctx.effect(() => ctx.webServer.register({
      kind: 'exact',
      path: '/dsh-clinebot/models/sync',
      handler: async (req, res) => {
        if (!isTrustedSettingsRequest(req)) {
          return writeJson(res, 403, { ok: false, error: 'Forbidden' })
        }
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

    // 9. POST /dsh-clinebot/models/toggle — toggle disabled/enabled status in picker
    ctx.effect(() => ctx.webServer.register({
      kind: 'exact',
      path: '/dsh-clinebot/models/toggle',
      handler: async (req, res) => {
        if (req.method !== 'POST') return writeJson(res, 405, { ok: false, error: 'POST only' })
        if (!isTrustedSettingsRequest(req)) {
          return writeJson(res, 403, { ok: false, error: 'Forbidden' })
        }
        try {
          const bodyBuf = await readBody(req)
          let body = {}
          try { body = JSON.parse(bodyBuf.toString('utf8')) } catch {}

          if (settingsApi?.replace) {
            const patch = {}
            if (Array.isArray(body.disabledModels)) {
              patch.disabledModels = body.disabledModels
            } else if (Array.isArray(body.enabledModels)) {
              // Convert legacy enabledModels toggle to disabledModels
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

    // 10. POST /dsh-clinebot/accounts/active — switch or pin active account
    ctx.effect(() => ctx.webServer.register({
      kind: 'exact',
      path: '/dsh-clinebot/accounts/active',
      handler: async (req, res) => {
        if (req.method !== 'POST') return writeJson(res, 405, { ok: false, error: 'POST only' })
        if (!isTrustedSettingsRequest(req)) {
          return writeJson(res, 403, { ok: false, error: 'Forbidden' })
        }
        try {
          const bodyBuf = await readBody(req)
          let body = {}
          try { body = JSON.parse(bodyBuf.toString('utf8')) } catch {}
          const account = String(body.account || '').trim()

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

    // 11. POST /dsh-clinebot/auth/begin — start loopback auth listener
    let authSession = null
    ctx.effect(() => ctx.webServer.register({
      kind: 'exact',
      path: '/dsh-clinebot/auth/begin',
      handler: async (req, res) => {
        if (req.method !== 'POST') return writeJson(res, 405, { ok: false, error: 'POST only' })
        if (!isTrustedSettingsRequest(req)) {
          return writeJson(res, 403, { ok: false, error: 'Forbidden' })
        }
        try {
          const authUrl = 'https://app.cline.bot'
          authSession = {
            state: 'waiting',
            startedAt: Date.now(),
            authUrl,
          }
          writeJson(res, 200, {
            ok: true,
            status: authSession.state,
            authUrl,
          })
        } catch (err) {
          writeJson(res, 500, { ok: false, error: String(err?.message || err) })
        }
      },
    }), 'dsh-clinebot: /auth/begin')

    // 12. GET /dsh-clinebot/auth/status — query current fast auth state
    ctx.effect(() => ctx.webServer.register({
      kind: 'exact',
      path: '/dsh-clinebot/auth/status',
      handler: async (req, res) => {
        if (req.method !== 'GET') return writeJson(res, 405, { ok: false, error: 'GET only' })
        writeJson(res, 200, {
          ok: true,
          status: authSession?.state || 'idle',
          authUrl: authSession?.authUrl || 'https://app.cline.bot',
        })
      },
    }), 'dsh-clinebot: /auth/status')
  }

  // Register /cline chat slash-command if commands service is present
  ctx.inject(['commands'], (cmdCtx) => {
    const commands = cmdCtx.commands
    if (typeof commands?.register !== 'function') return

    const unregister = commands.register({
      name: 'cline',
      description: 'Check ClinePass subscription quota, models, accounts and test connectivity (/cline [quota|models|accounts|switch <name>|test [model]|ping|rotate])',
      execute: async (rawArgs) => {
        const pub = publicConfig(live())
        const subcmd = String(rawArgs || '').trim().toLowerCase().split(/\s+/)[0] || 'quota'
        const param = String(rawArgs || '').trim().split(/\s+/)[1] || ''

        // 1. Subcommand /cline models
        if (subcmd === 'models') {
          const allModels = getAllModels(pub.dynamicModels)
          const disabledSet = new Set(pub.disabledModels || [])
          const lines = [
            '### 🎯 ClinePass Models Catalog',
            `* **Всего моделей**: ${allModels.length} (${allModels.filter((m) => !disabledSet.has(m.id)).length} активно)`,
            '',
          ]
          for (const m of allModels) {
            const active = !disabledSet.has(m.id) ? '✅' : '❌'
            const isVis = isVisionModel(m.id, pub.dynamicModels) ? '📷 Vision' : '📝 Text'
            const efforts = Array.isArray(m.reasoningEfforts) ? `🧠 [${m.reasoningEfforts.join(', ')}]` : ''
            lines.push(`* ${active} **${m.name}** (\`${m.id}\`) — ${isVis} · ${formatModelContext(m.contextLength)} ${efforts}`)
          }
          return lines.join('\n')
        }

        // 2. Subcommand /cline accounts
        if (subcmd === 'accounts') {
          const pool = await resolveAccountPool(ctx, live())
          const lines = [
            '### 🔑 ClinePass Accounts Pool',
            `* **Active Account**: \`${pub.activeAccount || pub.apiKeyEnv}\``,
            '',
          ]
          for (const acc of pool) {
            const pinBadge = acc.isPinned ? '📌 [Pinned]' : ''
            const statusBadge = acc.present ? '✅ Configured' : '⚠️ Missing Key'
            const cacheKey = `cline:usage:${(acc.value || '').slice(-8)}`
            const cached = usageCache.get(cacheKey)?.data
            const usageInfo = cached?.windows?.fiveHour ? ` · ⏱ ${cached.windows.fiveHour.percentUsed}% used` : ''
            lines.push(`* **${acc.label}** (\`${acc.apiKeyEnv}\`): ${statusBadge} ${pinBadge}${usageInfo}`)
          }
          lines.push('', 'Switch active account: `/cline switch <env_variable_name>`')
          return lines.join('\n')
        }

        // 3. Subcommand /cline switch <account>
        if (subcmd === 'switch') {
          if (!param) {
            return '⚠️ Please specify account: `/cline switch <CLINEBOT_API_KEY_2>`'
          }
          if (settingsApi?.replace) {
            const next = Config({ ...live(), activeAccount: param })
            await settingsApi.replace(next)
            await syncProviderState(next)
            return `✅ Active account switched to \`${param}\``
          }
          return `⚠️ Could not apply setting (settings service unavailable).`
        }

        // 4. Subcommand /cline rotate (smart failover next)
        if (subcmd === 'rotate') {
          const res = await rotateToNextAccount(ctx, live(), 'slash_command', settingsApi)
          if (res.rotated) {
            await syncProviderState(live())
            return `🔄 **Account Rotated**: switched from \`${res.previousAccount}\` to \`${res.activeAccount}\`. DSH provider updated!`
          }
          return `⚠️ Rotation skipped: ${res.message || 'no alternative configured accounts in pool'}.`
        }

        // 5. Subcommand /cline ping (fresh host reachability probe)
        if (subcmd === 'ping') {
          const health = await probeHealth(pub.baseUrl, { bypassCache: true, timeoutMs: 5000 })
          if (health.ok) {
            return `🏓 **Cline API Pong**: \`${pub.baseUrl}\` is reachable (latency: **${health.latencyMs} ms**, HTTP ${health.status})`
          }
          return `❌ **Cline API Ping Failed**: ${health.error || 'Host unreachable'}`
        }

        // 6. Subcommand /cline test [model] / smoke
        if (subcmd === 'test' || subcmd === 'smoke') {
          const activeKey = await resolveActiveAccountKey(ctx, live())
          if (!activeKey.value) {
            return '⚠️ **ClineBot**: API key is not configured. Open **Settings → Plugins → ClineBot**.'
          }
          const modelToTest = param || pub.defaultModel || DEFAULT_MODEL_ID
          const outcome = await smokeChat(pub.baseUrl, activeKey.value, {
            model: modelToTest,
            timeoutMs: pub.smokeTimeoutMs,
          })
          recordSessionRequest({
            latencyMs: outcome.latencyMs,
            ok: outcome.ok,
            error: outcome.error,
            promptTokens: outcome.promptTokens || 5,
            completionTokens: outcome.completionTokens || 10,
          })

          let failoverNotice = ''
          if (outcome.status === 429) {
            const failover = await rotateToNextAccount(ctx, live(), 'smoke_429', settingsApi)
            if (failover.rotated) {
              await syncProviderState(live())
              failoverNotice = `\n🔄 **Auto-failover**: HTTP 429 detected! Active account automatically rotated to \`${failover.activeAccount}\`.`
            }
          }

          if (outcome.ok) {
            return [
              `### 🟢 Smoke Test Passed: \`${outcome.model}\``,
              `* **Latency**: ${outcome.latencyMs} ms`,
              `* **Tokens**: prompt: ${outcome.promptTokens}, completion: ${outcome.completionTokens} (total: ${outcome.totalTokens})`,
              `* **Preview**: _"${outcome.preview}"_`,
            ].join('\n')
          }
          return `❌ **Smoke Test Failed**: ${outcome.error} (HTTP ${outcome.status || 'timeout'})${failoverNotice}`
        }

        // 7. Subcommand /cline quota or /cline balance
        const activeKey = await resolveActiveAccountKey(ctx, live())
        if (!activeKey.value) {
          return '⚠️ **ClineBot**: API key is not configured. Open **Settings → Plugins → ClineBot**.'
        }

        const [health, usage] = await Promise.all([
          probeHealth(pub.baseUrl, { timeoutMs: 5000 }),
          fetchUsageLimits(pub.baseUrl, activeKey.value, { timeoutMs: 8000 }),
        ])

        const fiveHour = usage?.windows?.fiveHour
        const weekly = usage?.windows?.weekly
        const reset5h = fiveHour?.resetsAt ? new Date(fiveHour.resetsAt).toLocaleTimeString() : 'N/A'
        const resetWk = weekly?.resetsAt ? new Date(weekly.resetsAt).toLocaleDateString() : 'N/A'

        const lines = [
          `### 🤖 ClinePass Status (${usage?.plan || 'ClinePass'})`,
          `* **Host Ping**: ${health.ok ? `✅ ${health.latencyMs} ms` : '❌ Unreachable'}`,
          `* **Active Key**: \`${activeKey.envName}\` (${activeKey.source})`,
          `* **Default Model**: \`${pub.defaultModel}\``,
          '',
          `**⏱ 5-Hour Rolling Limit**: ${formatProgressBar(fiveHour?.percentUsed)} (reset: ${reset5h})`,
          `**📅 Weekly Window**: ${formatProgressBar(weekly?.percentUsed)} (reset: ${resetWk})`,
        ]

        if (fiveHour?.percentUsed >= 95) {
          lines.push('', '🚨 **CRITICAL LIMIT**: 5-hour quota is 95%+ consumed! New requests may be throttled until reset.')
        } else if (fiveHour?.percentUsed >= 80) {
          lines.push('', `⚠️ **Warning**: 5-hour quota is ${fiveHour.percentUsed}% consumed.`)
        }

        if (sessionStats.totalRequests > 0) {
          lines.push('', `**📊 Session Telemetry**: ${sessionStats.successfulRequests}/${sessionStats.totalRequests} successful requests, ~${sessionStats.totalTokensEst} total tokens`)
        }

        if (usage?.user?.email) {
          lines.push(`* **Account**: \`${usage.user.email}\``)
        }

        return lines.join('\n')
      },
    })

    ctx.effect(() => () => unregister?.(), 'dsh-clinebot: slash-command')
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
