import z from '@deepseek-ai/schemastery'
import {
  DEFAULT_BASE_URL,
  DEFAULT_API_KEY_ENV,
  DEFAULT_TIMEOUT_MS,
  DEFAULT_SMOKE_TIMEOUT_MS,
  normalizeBaseUrl,
} from './cline-client.js'
import {
  DEFAULT_MODEL_ID,
  getAllModels,
  getDefaultModelIds,
  getActiveModelIds,
} from './models.js'


// DSH settings.describe only publishes fields marked volatile. Without them the
// namespace is omitted and the configuration page stays unavailable.
if (typeof z.prototype?.volatile !== 'function') {
  z.prototype.volatile = function volatile() {
    if (this.meta && this.meta.volatile) throw new TypeError('volatile schema is already wrapped')
    return typeof this.extra === 'function' ? this.extra('volatile', true) : this
  }
}

export const NS = 'dsh-clinebot'
export const LLM_PI_AI_NS = 'llm-pi-ai'

export const Config = z.object({
  enabled: z.boolean().default(true)
    .description('When true, ClineBot is registered as a model provider in DSH.').volatile(),
  baseUrl: z.string().default(DEFAULT_BASE_URL)
    .description('Base API URL (default: https://api.cline.bot/api/v1).').volatile(),
  apiKeyEnv: z.string().default(DEFAULT_API_KEY_ENV)
    .description('Credential / env name containing the ClinePass API key (never store key directly here).').volatile(),
  defaultModel: z.string().default(DEFAULT_MODEL_ID)
    .description('Default model ID for chat and smoke tests.').volatile(),
  disabledModels: z.array(z.string()).default([])
    .description('List of model IDs explicitly disabled by the user (new models are enabled automatically).').volatile(),
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
    reasoningEfforts: z.any().default(undefined),
  })).default([])
    .description('Models automatically discovered from the official ClinePass subscription plan.'),
  planSyncedAt: z.number().default(0)
    .description('Timestamp when models were last synchronized with active subscription plan.'),
  timeoutMs: z.number().default(DEFAULT_TIMEOUT_MS)
    .description('HTTP probe timeout in milliseconds.').volatile(),
  smokeTimeoutMs: z.number().default(DEFAULT_SMOKE_TIMEOUT_MS)
    .description('Timeout for smoke chat completions in milliseconds.').volatile(),
  modelsCachePath: z.string().default('~/.dsh/clinebot-models-cache.json')
    .description('Local on-disk cache path for models snapshot.').volatile(),
  accounts: z.array(z.object({
    label: z.string().default(''),
    apiKeyEnv: z.string(),
  })).default([])
    .description('Additional accounts for multi-account failover and rate limit rotation.').volatile(),
  activeAccount: z.string().default('')
    .description('Manually pinned active account envName or empty for auto/default.').volatile(),
})


function isVolatileRef(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value) && typeof value.get === 'function'
}

// DSH stores each volatile field as { get } or getter functions. structuredClone
// cannot copy functions or getters, so callers need a plain snapshot before validation.
export function plainConfig(cfg) {
  while (typeof cfg === 'function') {
    cfg = cfg()
  }
  if (isVolatileRef(cfg)) return plainConfig(cfg.get())
  if (!cfg || typeof cfg !== 'object') return cfg
  if (Array.isArray(cfg)) {
    return cfg.map((item) => plainConfig(item))
  }
  const out = {}
  for (const key of Object.keys(cfg)) {
    out[key] = plainConfig(cfg[key])
  }
  return out
}

export function volatileConfig(cfg) {
  const plain = plainConfig(cfg)
  if (!plain || typeof plain !== 'object') return plain
  const out = {}
  for (const [key, field] of Object.entries(Config.dict || {})) {
    if (field?.meta?.volatile && Object.hasOwn(plain, key)) {
      out[key] = plain[key]
    }
  }
  return out
}

export function publicConfig(cfg) {
  cfg = plainConfig(cfg)
  const dynamic = Array.isArray(cfg?.dynamicModels) ? cfg.dynamicModels : []
  const isSynced = dynamic.length > 0
  const allModels = getAllModels(dynamic)
  const allDefaultIds = allModels.map((m) => m.id)

  let disabledList = Array.isArray(cfg?.disabledModels) ? cfg.disabledModels : []
  if (cfg?.disabledModels === undefined && Array.isArray(cfg?.enabledModels) && cfg.enabledModels.length > 0) {
    const enabledSet = new Set(cfg.enabledModels)
    disabledList = allDefaultIds.filter((id) => !enabledSet.has(id))
  }

  let activeIds = getActiveModelIds(allDefaultIds, disabledList)
  if (!activeIds.length && allDefaultIds.length) {
    activeIds = [allDefaultIds[0]]
  }

  let defaultModel = cfg?.defaultModel || DEFAULT_MODEL_ID
  let defaultModelWarning = null

  if (allDefaultIds.length > 0 && !allDefaultIds.includes(defaultModel)) {
    const fallbackModel = activeIds[0] || allDefaultIds[0]
    defaultModelWarning = `Configured default model "${defaultModel}" is not available in your active plan. Using "${fallbackModel}" instead.`
    defaultModel = fallbackModel
  }

  const planSyncedAt = Number(cfg?.planSyncedAt) || (isSynced ? (dynamic.planSyncedAt || 0) : 0)

  return {
    enabled: !!cfg?.enabled,
    baseUrl: normalizeBaseUrl(cfg?.baseUrl),
    apiKeyEnv: cfg?.apiKeyEnv || DEFAULT_API_KEY_ENV,
    defaultModel,
    defaultModelWarning,
    dynamicModels: dynamic,
    planSynced: isSynced,
    planSyncedAt,
    disabledModels: disabledList,
    enabledModels: activeIds,
    timeoutMs: Number(cfg?.timeoutMs) || DEFAULT_TIMEOUT_MS,
    smokeTimeoutMs: Number(cfg?.smokeTimeoutMs) || DEFAULT_SMOKE_TIMEOUT_MS,
    modelsCachePath: String(cfg?.modelsCachePath || '~/.dsh/clinebot-models-cache.json'),
    accounts: Array.isArray(cfg?.accounts) ? cfg.accounts : [],
    activeAccount: String(cfg?.activeAccount || ''),
  }
}
