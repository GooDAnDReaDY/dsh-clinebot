import z from '@deepseek-ai/schemastery'
import { credentialRef } from '@deepseek-ai/dsh-credentials'
import { writeJson, readBody, isTrustedSettingsRequest } from './http.js'
import {
  CLINE_MODELS,
  DEFAULT_MODEL_ID,
  PROVIDER_ID,
  PROVIDER_DISPLAY_NAME,
  getAllModels,
  getDefaultModelIds,
  parsePlanIncludedModels,
} from './models.js'
import {
  DEFAULT_BASE_URL,
  DEFAULT_API_KEY_ENV,
  DEFAULT_TIMEOUT_MS,
  DEFAULT_SMOKE_TIMEOUT_MS,
  normalizeBaseUrl,
  resolveApiKey,
  saveCredentialKey,
  fetchUsageLimits,
  probeHealth,
  smokeChat,
  buildPiAiProvider,
  sessionStats,
  recordSessionRequest,
  resetSessionStats,
} from './cline-client.js'

export const name = '@goodandready/dsh-clinebot'
export const inject = ['settings', 'webServer', 'credentials']

export const NS = 'dsh-clinebot'
export const LLM_PI_AI_NS = 'llm-pi-ai'

export { sessionStats, recordSessionRequest, resetSessionStats }

export const Config = z.object({
  enabled: z.boolean().default(true)
    .description('When true, ClineBot is registered as a model provider in DSH.'),
  baseUrl: z.string().default(DEFAULT_BASE_URL)
    .description('Base API URL (default: https://api.cline.bot/api/v1).'),
  apiKeyEnv: z.string().default(DEFAULT_API_KEY_ENV)
    .description('Credential / env name containing the ClinePass API key (never store key directly here).'),
  defaultModel: z.string().default(DEFAULT_MODEL_ID)
    .description('Default model ID for chat and smoke tests.'),
  enabledModels: z.array(z.string()).default(getDefaultModelIds())
    .description('List of model IDs enabled for selection in DSH.'),
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
})

function publicConfig(cfg) {
  const dynamic = Array.isArray(cfg?.dynamicModels) ? cfg.dynamicModels : []
  const allDefaultIds = getDefaultModelIds(dynamic)
  return {
    enabled: !!cfg?.enabled,
    baseUrl: normalizeBaseUrl(cfg?.baseUrl),
    apiKeyEnv: cfg?.apiKeyEnv || DEFAULT_API_KEY_ENV,
    defaultModel: cfg?.defaultModel || DEFAULT_MODEL_ID,
    dynamicModels: dynamic,
    enabledModels: Array.isArray(cfg?.enabledModels) && cfg.enabledModels.length
      ? cfg.enabledModels
      : allDefaultIds,
    timeoutMs: Number(cfg?.timeoutMs) || DEFAULT_TIMEOUT_MS,
    smokeTimeoutMs: Number(cfg?.smokeTimeoutMs) || DEFAULT_SMOKE_TIMEOUT_MS,
  }
}

async function resolveKeyValue(ctx, apiKeyEnv) {
  const refName = String(apiKeyEnv || DEFAULT_API_KEY_ENV).trim() || DEFAULT_API_KEY_ENV
  if (ctx?.credentials && typeof ctx.credentials.resolve === 'function') {
    try {
      const hit = await ctx.credentials.resolve(credentialRef(refName))
      if (hit?.value) {
        return { envName: refName, value: hit.value, source: 'credentials' }
      }
    } catch {
      /* credentials service miss, fall through */
    }
  }

  const fromEnv = resolveApiKey(refName)
  if (fromEnv.value) {
    return { ...fromEnv, source: 'env' }
  }

  return { envName: refName, value: '', source: 'none' }
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

async function buildStatus(ctx, cfg) {
  const pub = publicConfig(cfg)
  const key = await resolveKeyValue(ctx, pub.apiKeyEnv)
  const health = await probeHealth(pub.baseUrl, { timeoutMs: pub.timeoutMs })
  const isRegistered = await checkRegisteredInPiAi(ctx)
  const allModels = getAllModels(pub.dynamicModels)

  let usage = null
  if (key.value) {
    usage = await fetchUsageLimits(pub.baseUrl, key.value, { timeoutMs: pub.timeoutMs }).catch(() => null)
  }

  // Evaluate warning state
  let quotaWarning = null
  if (usage?.windows?.fiveHour) {
    const pct = usage.windows.fiveHour.percentUsed
    if (pct >= 95) {
      quotaWarning = {
        level: 'exhausted',
        message: `5-часовой лимит почти полностью исчерпан (${pct}%). Новые запросы могут отклоняться провайдером до сброса.`,
        resetsAt: usage.windows.fiveHour.resetsAt,
      }
    } else if (pct >= 80) {
      quotaWarning = {
        level: 'warning',
        message: `Внимание: израсходовано ${pct}% 5-часового скользящего лимита.`,
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
      envName: key.envName,
      present: !!key.value,
      source: key.source,
    },
    health,
    usage,
    quotaWarning,
    sessionStats: { ...sessionStats },
    isRegistered,
    availableModels: allModels,
  }
}

async function upsertPiAiProvider(ctx, cfg, dynamicModelIds) {
  const settings = ctx?.get?.('settings')
  if (!settings?.mutate) {
    throw new Error('DSH settings service unavailable')
  }

  const pub = publicConfig(cfg)
  const allModels = getAllModels(pub.dynamicModels)
  const selectedIds = new Set(dynamicModelIds || pub.enabledModels)
  const modelsToRegister = allModels.filter((m) => selectedIds.has(m.id))

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
  let liveCfg = Config(structuredClone(config || {}))
  let settingsApi

  const settingsService = ctx.get('settings')
  if (typeof settingsService?.register === 'function') {
    const scope = settingsService.register(NS, Config, { base: config })
    settingsApi = scope
    liveCfg = Config(scope.get() ?? config)
    ctx.effect(() => scope.watch((next) => {
      liveCfg = Config(next ?? config)
    }), 'dsh-clinebot: settings')
  }

  const live = () => liveCfg

  // Web server HTTP route handlers
  if (ctx.webServer?.register) {
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
          const key = await resolveKeyValue(ctx, pub.apiKeyEnv)
          if (!key.value) {
            return writeJson(res, 400, { ok: false, error: 'API key not found' })
          }
          const usageData = await fetchUsageLimits(pub.baseUrl, key.value, {
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
          const result = await upsertPiAiProvider(ctx, live(), body.models)
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
          const key = await resolveKeyValue(ctx, pub.apiKeyEnv)
          if (!key.value) {
            return writeJson(res, 400, {
              ok: false,
              error: `API key not found. Ensure ${key.envName} is added to DSH credentials or environment.`,
            })
          }

          const modelToTest = body.model || pub.defaultModel || DEFAULT_MODEL_ID
          const outcome = await smokeChat(pub.baseUrl, key.value, {
            model: modelToTest,
            timeoutMs: pub.smokeTimeoutMs,
          })
          recordSessionRequest({
            latencyMs: outcome.latencyMs,
            ok: outcome.ok,
            error: outcome.error,
            promptTokens: 5,
            completionTokens: 10,
          })
          writeJson(res, outcome.ok ? 200 : 502, outcome)
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
          const key = await resolveKeyValue(ctx, pub.apiKeyEnv)
          if (!key.value) {
            return writeJson(res, 400, { ok: false, error: 'API key not configured' })
          }

          const usageData = await fetchUsageLimits(pub.baseUrl, key.value, {
            timeoutMs: pub.timeoutMs,
            bypassCache: true,
          })

          if (!usageData.ok) {
            return writeJson(res, 502, { ok: false, error: usageData.error || 'Failed to fetch plan models' })
          }

          const dynamicModels = Array.isArray(usageData.dynamicModels) ? usageData.dynamicModels : []
          const allModels = getAllModels(dynamicModels)
          const allIds = allModels.map((m) => m.id)

          // Preserve currently enabled models, plus add any newly discovered ones
          const existingEnabled = new Set(live().enabledModels || getDefaultModelIds())
          for (const m of allModels) {
            existingEnabled.add(m.id)
          }

          if (settingsApi?.replace) {
            const next = Config({
              ...live(),
              dynamicModels,
              enabledModels: Array.from(existingEnabled),
            })
            await settingsApi.replace(next)
            if (await checkRegisteredInPiAi(ctx)) {
              await upsertPiAiProvider(ctx, next, Array.from(existingEnabled))
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

    // 9. POST /dsh-clinebot/models/toggle — toggle enabled status in picker
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

          if (Array.isArray(body.enabledModels) && settingsApi?.replace) {
            const patch = { enabledModels: body.enabledModels }
            if (body.defaultModel) patch.defaultModel = body.defaultModel
            const next = Config({ ...live(), ...patch })
            await settingsApi.replace(next)
            if (await checkRegisteredInPiAi(ctx)) {
              await upsertPiAiProvider(ctx, next, body.enabledModels)
            }
          }
          writeJson(res, 200, { ok: true, enabledModels: body.enabledModels })
        } catch (err) {
          writeJson(res, 500, { ok: false, error: String(err?.message || err) })
        }
      },
    }), 'dsh-clinebot: /models/toggle')
  }

  // Register /cline chat slash-command if commands service is present
  ctx.inject(['commands'], (cmdCtx) => {
    const commands = cmdCtx.commands
    if (typeof commands?.register !== 'function') return

    const unregister = commands.register({
      name: 'cline',
      description: 'Check ClinePass subscription quota, rate limits, session stats and latency',
      execute: async () => {
        const pub = publicConfig(live())
        const key = await resolveKeyValue(ctx, pub.apiKeyEnv)
        if (!key.value) {
          return '⚠️ **ClineBot**: API-ключ не настроен. Откройте **Настройки → ClineBot** и сохраните ключ.'
        }

        const [health, usage] = await Promise.all([
          probeHealth(pub.baseUrl, { timeoutMs: 5000 }),
          fetchUsageLimits(pub.baseUrl, key.value, { timeoutMs: 8000 }),
        ])

        const fiveHour = usage?.windows?.fiveHour
        const weekly = usage?.windows?.weekly
        const reset5h = fiveHour?.resetsAt ? new Date(fiveHour.resetsAt).toLocaleTimeString() : 'н/д'
        const resetWk = weekly?.resetsAt ? new Date(weekly.resetsAt).toLocaleDateString() : 'н/д'

        const lines = [
          `### 🤖 ClinePass Status (${usage?.plan || 'ClinePass'})`,
          `* **Пинг хоста**: ${health.ok ? `✅ ${health.latencyMs} мс` : '❌ Недоступен'}`,
          `* **Активный ключ**: ${key.envName} (${key.source})`,
          `* **Модель по умолчанию**: \`${pub.defaultModel}\``,
          '',
          `**⏱ 5-часовое окно**: ${formatProgressBar(fiveHour?.percentUsed)} (сброс: ${reset5h})`,
          `**📅 Недельное окно**: ${formatProgressBar(weekly?.percentUsed)} (сброс: ${resetWk})`,
        ]

        if (fiveHour?.percentUsed >= 95) {
          lines.push('', '🚨 **КРИТИЧЕСКИЙ ЛИМИТ**: 5-часовая квота израсходована на 95%+. Запросы могут быть заблокированы до сброса!')
        } else if (fiveHour?.percentUsed >= 80) {
          lines.push('', '⚠️ **Внимание**: 5-часовая квота израсходована на ' + fiveHour.percentUsed + '%.')
        }

        if (sessionStats.totalRequests > 0) {
          lines.push('', `**📊 Сессия DSH**: ${sessionStats.successfulRequests}/${sessionStats.totalRequests} успешных запросов, ~${sessionStats.totalTokensEst} токенов`)
        }

        if (usage?.user?.email) {
          lines.push(`* **Аккаунт**: \`${usage.user.email}\``)
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
      const key = await resolveKeyValue(ctx, pub.apiKeyEnv)
      const res = await smokeChat(pub.baseUrl, key.value, { model: model || pub.defaultModel })
      recordSessionRequest({
        latencyMs: res.latencyMs,
        ok: res.ok,
        error: res.error,
        promptTokens: 5,
        completionTokens: 10,
      })
      return res
    },
  }
}
