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
  validateCustomModel,
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
} from './cline-client.js'

export const name = '@goodandready/dsh-clinebot'
export const inject = ['settings', 'webServer', 'credentials']

export const NS = 'dsh-clinebot'
export const LLM_PI_AI_NS = 'llm-pi-ai'

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
  customModels: z.array(z.object({
    id: z.string(),
    name: z.string(),
    description: z.string().default(''),
    contextLength: z.number().default(200000),
    maxTokens: z.number().default(8192),
    input: z.array(z.string()).default(['text']),
    category: z.string().default('general'),
    isCustom: z.boolean().default(true),
  })).default([])
    .description('User-added custom models from the ClinePass subscription.'),
  timeoutMs: z.number().default(DEFAULT_TIMEOUT_MS)
    .description('HTTP probe timeout in milliseconds.'),
  smokeTimeoutMs: z.number().default(DEFAULT_SMOKE_TIMEOUT_MS)
    .description('Timeout for smoke chat completions in milliseconds.'),
})

function publicConfig(cfg) {
  const custom = Array.isArray(cfg?.customModels) ? cfg.customModels : []
  const allDefaultIds = getDefaultModelIds(custom)
  return {
    enabled: !!cfg?.enabled,
    baseUrl: normalizeBaseUrl(cfg?.baseUrl),
    apiKeyEnv: cfg?.apiKeyEnv || DEFAULT_API_KEY_ENV,
    defaultModel: cfg?.defaultModel || DEFAULT_MODEL_ID,
    customModels: custom,
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
  const allModels = getAllModels(pub.customModels)

  let usage = null
  if (key.value) {
    usage = await fetchUsageLimits(pub.baseUrl, key.value, { timeoutMs: pub.timeoutMs }).catch(() => null)
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
    isRegistered,
    availableModels: allModels,
  }
}

async function upsertPiAiProvider(ctx, cfg, customModelIds) {
  const settings = ctx?.get?.('settings')
  if (!settings?.mutate) {
    throw new Error('DSH settings service unavailable')
  }

  const pub = publicConfig(cfg)
  const allModels = getAllModels(pub.customModels)
  const selectedIds = new Set(customModelIds || pub.enabledModels)
  const modelsToRegister = allModels.filter((m) => selectedIds.has(m.id))

  const providerObj = buildPiAiProvider({
    baseUrl: pub.baseUrl,
    apiKeyEnv: pub.apiKeyEnv,
    models: modelsToRegister.length ? modelsToRegister : allModels,
    customModels: pub.customModels,
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
  ctx.inject(['webServer'], (wsCtx) => {
    const web = wsCtx.webServer
    if (!web?.registerRoute) return

    const baseRoute = '/api/plugins/dsh-clinebot'

    // 1. GET /status
    const statusCleanup = web.registerRoute('GET', `${baseRoute}/status`, async (req, res) => {
      try {
        const st = await buildStatus(ctx, live())
        writeJson(res, 200, st)
      } catch (err) {
        writeJson(res, 500, { ok: false, error: String(err?.message || err) })
      }
    })

    // 2. POST /save-key — direct saving into DSH credentials service
    const saveKeyCleanup = web.registerRoute('POST', `${baseRoute}/save-key`, async (req, res) => {
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
    })

    // 3. GET /usage — direct fresh usage limit query
    const usageCleanup = web.registerRoute('GET', `${baseRoute}/usage`, async (req, res) => {
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
    })

    // 4. POST /register — upsert into DSH llm-pi-ai
    const regCleanup = web.registerRoute('POST', `${baseRoute}/register`, async (req, res) => {
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
    })

    // 5. POST /unregister — remove from DSH
    const unregCleanup = web.registerRoute('POST', `${baseRoute}/unregister`, async (req, res) => {
      if (!isTrustedSettingsRequest(req)) {
        return writeJson(res, 403, { ok: false, error: 'Forbidden' })
      }
      try {
        await removePiAiProvider(ctx)
        writeJson(res, 200, { ok: true })
      } catch (err) {
        writeJson(res, 500, { ok: false, error: String(err?.message || err) })
      }
    })

    // 6. POST /smoke — live ping test
    const smokeCleanup = web.registerRoute('POST', `${baseRoute}/smoke`, async (req, res) => {
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
        writeJson(res, outcome.ok ? 200 : 502, outcome)
      } catch (err) {
        writeJson(res, 500, { ok: false, error: String(err?.message || err) })
      }
    })

    // 7. POST /models/custom — add new custom model
    const addCustomModelCleanup = web.registerRoute('POST', `${baseRoute}/models/custom`, async (req, res) => {
      if (!isTrustedSettingsRequest(req)) {
        return writeJson(res, 403, { ok: false, error: 'Forbidden' })
      }
      try {
        const bodyBuf = await readBody(req)
        let body = {}
        try { body = JSON.parse(bodyBuf.toString('utf8')) } catch {}

        const validated = validateCustomModel(body)
        if (!validated.ok) {
          return writeJson(res, 400, { ok: false, error: validated.error })
        }

        const currentCustom = Array.isArray(live().customModels) ? [...live().customModels] : []
        const existingIdx = currentCustom.findIndex((m) => m.id === validated.model.id)
        if (existingIdx >= 0) {
          currentCustom[existingIdx] = validated.model
        } else {
          currentCustom.push(validated.model)
        }

        const currentEnabled = new Set(live().enabledModels || getDefaultModelIds())
        currentEnabled.add(validated.model.id)

        if (settingsApi?.set) {
          await settingsApi.set('customModels', currentCustom)
          await settingsApi.set('enabledModels', Array.from(currentEnabled))
          if (await checkRegisteredInPiAi(ctx)) {
            await upsertPiAiProvider(ctx, live(), Array.from(currentEnabled))
          }
        }

        writeJson(res, 200, { ok: true, model: validated.model, customModels: currentCustom })
      } catch (err) {
        writeJson(res, 500, { ok: false, error: String(err?.message || err) })
      }
    })

    // 8. DELETE /models/custom — remove custom model
    const removeCustomModelCleanup = web.registerRoute('DELETE', `${baseRoute}/models/custom`, async (req, res) => {
      if (!isTrustedSettingsRequest(req)) {
        return writeJson(res, 403, { ok: false, error: 'Forbidden' })
      }
      try {
        const bodyBuf = await readBody(req)
        let body = {}
        try { body = JSON.parse(bodyBuf.toString('utf8')) } catch {}

        const modelId = String(body.id || '').trim()
        if (!modelId) {
          return writeJson(res, 400, { ok: false, error: 'Missing model ID' })
        }

        const currentCustom = (live().customModels || []).filter((m) => m.id !== modelId)
        const currentEnabled = (live().enabledModels || []).filter((id) => id !== modelId)

        if (settingsApi?.set) {
          await settingsApi.set('customModels', currentCustom)
          await settingsApi.set('enabledModels', currentEnabled)
          if (await checkRegisteredInPiAi(ctx)) {
            await upsertPiAiProvider(ctx, live(), currentEnabled)
          }
        }

        writeJson(res, 200, { ok: true, removed: modelId, customModels: currentCustom })
      } catch (err) {
        writeJson(res, 500, { ok: false, error: String(err?.message || err) })
      }
    })

    // 9. POST /models/toggle — toggle enabled status in picker
    const toggleModelCleanup = web.registerRoute('POST', `${baseRoute}/models/toggle`, async (req, res) => {
      if (!isTrustedSettingsRequest(req)) {
        return writeJson(res, 403, { ok: false, error: 'Forbidden' })
      }
      try {
        const bodyBuf = await readBody(req)
        let body = {}
        try { body = JSON.parse(bodyBuf.toString('utf8')) } catch {}

        if (Array.isArray(body.enabledModels) && settingsApi?.set) {
          await settingsApi.set('enabledModels', body.enabledModels)
          if (body.defaultModel) {
            await settingsApi.set('defaultModel', body.defaultModel)
          }
          if (await checkRegisteredInPiAi(ctx)) {
            await upsertPiAiProvider(ctx, live(), body.enabledModels)
          }
        }
        writeJson(res, 200, { ok: true, enabledModels: body.enabledModels })
      } catch (err) {
        writeJson(res, 500, { ok: false, error: String(err?.message || err) })
      }
    })

    ctx.effect(() => () => {
      statusCleanup?.()
      saveKeyCleanup?.()
      usageCleanup?.()
      regCleanup?.()
      unregCleanup?.()
      smokeCleanup?.()
      addCustomModelCleanup?.()
      removeCustomModelCleanup?.()
      toggleModelCleanup?.()
    }, 'dsh-clinebot: web routes')
  })

  // Register /cline chat slash-command if commands service is present
  ctx.inject(['commands'], (cmdCtx) => {
    const commands = cmdCtx.commands
    if (typeof commands?.register !== 'function') return

    const unregister = commands.register({
      name: 'cline',
      description: 'Check ClinePass subscription quota, rate limits and latency',
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
    getUsageLimits: async () => {
      const pub = publicConfig(live())
      const key = await resolveKeyValue(ctx, pub.apiKeyEnv)
      return fetchUsageLimits(pub.baseUrl, key.value)
    },
    runSmokeTest: async (model) => {
      const pub = publicConfig(live())
      const key = await resolveKeyValue(ctx, pub.apiKeyEnv)
      return smokeChat(pub.baseUrl, key.value, { model: model || pub.defaultModel })
    },
  }
}
