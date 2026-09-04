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
} from './models.js'
import {
  DEFAULT_BASE_URL,
  DEFAULT_API_KEY_ENV,
  DEFAULT_TIMEOUT_MS,
  DEFAULT_SMOKE_TIMEOUT_MS,
  normalizeBaseUrl,
  resolveApiKey,
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
  timeoutMs: z.number().default(DEFAULT_TIMEOUT_MS)
    .description('HTTP probe timeout in milliseconds.'),
  smokeTimeoutMs: z.number().default(DEFAULT_SMOKE_TIMEOUT_MS)
    .description('Timeout for smoke chat completions in milliseconds.'),
})

function publicConfig(cfg) {
  return {
    enabled: !!cfg?.enabled,
    baseUrl: normalizeBaseUrl(cfg?.baseUrl),
    apiKeyEnv: cfg?.apiKeyEnv || DEFAULT_API_KEY_ENV,
    defaultModel: cfg?.defaultModel || DEFAULT_MODEL_ID,
    enabledModels: Array.isArray(cfg?.enabledModels) && cfg.enabledModels.length
      ? cfg.enabledModels
      : getDefaultModelIds(),
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
    isRegistered,
    availableModels: getAllModels(),
  }
}

async function upsertPiAiProvider(ctx, cfg, customModels) {
  const settings = ctx?.get?.('settings')
  if (!settings?.mutate) {
    throw new Error('DSH settings service unavailable')
  }

  const pub = publicConfig(cfg)
  const selectedIds = new Set(customModels || pub.enabledModels)
  const modelsToRegister = CLINE_MODELS.filter((m) => selectedIds.has(m.id))

  const providerObj = buildPiAiProvider({
    baseUrl: pub.baseUrl,
    apiKeyEnv: pub.apiKeyEnv,
    models: modelsToRegister.length ? modelsToRegister : CLINE_MODELS,
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

    const cleanup = web.registerRoute('GET', `${baseRoute}/status`, async (req, res) => {
      try {
        const st = await buildStatus(ctx, live())
        writeJson(res, 200, st)
      } catch (err) {
        writeJson(res, 500, { ok: false, error: String(err?.message || err) })
      }
    })

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

    const modelsCleanup = web.registerRoute('POST', `${baseRoute}/models`, async (req, res) => {
      if (!isTrustedSettingsRequest(req)) {
        return writeJson(res, 403, { ok: false, error: 'Forbidden' })
      }
      try {
        const bodyBuf = await readBody(req)
        let body = {}
        try { body = JSON.parse(bodyBuf.toString('utf8')) } catch {}

        if (Array.isArray(body.enabledModels) && settingsApi?.set) {
          await settingsApi.set('enabledModels', body.enabledModels)
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
      cleanup?.()
      regCleanup?.()
      unregCleanup?.()
      smokeCleanup?.()
      modelsCleanup?.()
    }, 'dsh-clinebot: web routes')
  })

  // Expose service interface for programmatic calls from other plugins
  return {
    getStatus: () => buildStatus(ctx, live()),
    registerProvider: (models) => upsertPiAiProvider(ctx, live(), models),
    unregisterProvider: () => removePiAiProvider(ctx),
    runSmokeTest: async (model) => {
      const pub = publicConfig(live())
      const key = await resolveKeyValue(ctx, pub.apiKeyEnv)
      return smokeChat(pub.baseUrl, key.value, { model: model || pub.defaultModel })
    },
  }
}
