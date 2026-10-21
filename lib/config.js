import z from '@deepseek-ai/schemastery'
import {
  DEFAULT_BASE_URL,
  DEFAULT_API_KEY_ENV,
  DEFAULT_TIMEOUT_MS,
  DEFAULT_SMOKE_TIMEOUT_MS,
  DEFAULT_STREAM_IDLE_TIMEOUT_MS,
  normalizeBaseUrl,
} from './cline-client.js'
import {
  DEFAULT_MODEL_ID,
  getAllModels,
  getActiveModelIds,
  migrateModelId,
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
  filterModelsByPlan: z.boolean().default(true)
    .description('Automatically hide models not included in active subscription plan from chat picker.').volatile(),
  visibleModels: z.array(z.string()).default([])
    .description('User-selected visible models in chat model picker (empty means all supported models).').volatile(),
  showSidebarQuota: z.boolean().default(true)
    .description('Display compact quota meter in DSH sidebar footer.').volatile(),
  showComposerCost: z.boolean().default(true)
    .description('Display the estimated session cost widget in the chat composer.').volatile(),
  webSearch: z.boolean().default(true)
    .description('Enable native DSH web search provider via ClineBot.').volatile(),
  offloadSeenImages: z.boolean().default(true)
    .description('Offload previously seen images in conversation history to optimize prompt cache.').volatile(),
  maxPayloadMb: z.number().default(40)
    .description('Maximum multimodal payload budget in MB before evicting oldest images.').volatile(),
  priceOverrides: z.dict(z.object({
    input: z.number().default(0),
    output: z.number().default(0),
    cacheRead: z.number().default(0),
    cacheWrite: z.number().default(0),
  })).default({})
    .description('User-supplied USD per 1M token rates for local cost estimates.').volatile(),
  priceCatalogUrl: z.string().default('https://models.dev/api.json')
    .description('Public model price catalog URL used by the optional price sync.').volatile(),
  priceCatalogPath: z.string().default('~/.dsh/clinebot-prices.json')
    .description('Local cache for the public price catalog.').volatile(),
  eventLogPath: z.string().default('~/.dsh/clinebot-events.json')
    .description('Local ring buffer for account cooldown, recovery and routing events.').volatile(),
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
  modelContextOverrides: z.array(z.object({
    modelId: z.string(),
    contextLength: z.number().default(200000),
    maxTokens: z.number().default(8192),
  })).default([])
    .description('Custom user-defined model context length and max token overrides.').volatile(),
  contextWindow: z.number().min(0).max(10000000).default(0)
    .description('Global custom context window in tokens (0 follows the catalog; per-model overrides win).').volatile(),
  maxOutputTokens: z.number().min(-1).max(2000000).default(-1)
    .description('Per-turn output cap: -1 derives from the model, 0 omits max_tokens, a positive value tightens the cap.').volatile(),
  modelReasoningDefaults: z.dict(z.string()).default({})
    .description('Configured default reasoning effort per model (low, medium, high, max).').volatile(),
  modelRoutes: z.dict(z.string()).default({})
    .description('Per-model target account routing map (e.g. { "deepseek-v4-pro": "KEY_2" }).').volatile(),
  customModels: z.array(z.object({
    id: z.string(),
    name: z.string(),
    contextLength: z.number().default(128000),
    maxTokens: z.number().default(8192),
    category: z.string().default('general'),
    isReasoning: z.boolean().default(false),
  })).default([])
    .description('User-defined custom gateway models.').volatile(),
  statsPath: z.string().default('~/.dsh/clinebot-stats.json')
    .description('Local on-disk persistent path for token usage analytics.').volatile(),
  statsRetentionDays: z.number().min(0).max(3650).default(95)
    .description('Retention for day/hour/session telemetry in days. 0 keeps everything.').volatile(),
  dailyBudgetUsd: z.number().min(0).default(0)
    .description('Optional daily estimated-spend guard in USD. 0 disables the guard.').volatile(),
  monthlyBudgetUsd: z.number().min(0).default(0)
    .description('Optional monthly estimated-spend guard in USD. 0 disables the guard.').volatile(),
  timeoutMs: z.number().default(DEFAULT_TIMEOUT_MS)
    .description('HTTP probe timeout in milliseconds.').volatile(),
  smokeTimeoutMs: z.number().default(DEFAULT_SMOKE_TIMEOUT_MS)
    .description('Timeout for smoke chat completions in milliseconds.').volatile(),
  streamIdleTimeoutMs: z.number().default(DEFAULT_STREAM_IDLE_TIMEOUT_MS)
    .description('Idle timeout between SSE stream chunks in milliseconds.').volatile(),
  modelsCachePath: z.string().default('~/.dsh/clinebot-models-cache.json')
    .description('Local on-disk cache path for models snapshot.').volatile(),
  accounts: z.array(z.object({
    label: z.string().default(''),
    apiKeyEnv: z.string(),
  })).default([])
    .description('Additional accounts for multi-account failover and rate limit rotation.').volatile(),
  activeAccount: z.string().default('')
    .description('Manually pinned active account envName or empty for auto/default.').volatile(),
  accountMode: z.union(['least_used', 'round_robin']).default('least_used')
    .description('Account selection strategy: least_used (quota-aware) or round_robin (sequential rotation).').volatile(),
})

export function isVolatileRef(value) {
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
  const custom = Array.isArray(cfg?.customModels) ? cfg.customModels : []
  const modelContextOverrides = Array.isArray(cfg?.modelContextOverrides) ? cfg.modelContextOverrides : []
  const contextWindow = Math.max(0, Number(cfg?.contextWindow) || 0)
  // A global context override is the wildcard entry; explicit per-model rows
  // and an explicitly stored `*` row keep precedence.
  const effectiveOverrides = contextWindow > 0 && !modelContextOverrides.some((entry) => entry?.modelId === '*')
    ? [...modelContextOverrides, { modelId: '*', contextLength: contextWindow, maxTokens: 0 }]
    : modelContextOverrides
  const isSynced = dynamic.length > 0 && (Number(cfg?.planSyncedAt) > 0)
  const allModels = getAllModels(dynamic, effectiveOverrides, custom)
  const allDefaultIds = allModels.map((m) => m.id)

  let disabledList = Array.isArray(cfg?.disabledModels) ? cfg.disabledModels.map(migrateModelId) : []
  if (cfg?.disabledModels === undefined && Array.isArray(cfg?.enabledModels) && cfg.enabledModels.length > 0) {
    const enabledSet = new Set(cfg.enabledModels.map(migrateModelId))
    disabledList = allDefaultIds.filter((id) => !enabledSet.has(id))
  }

  const filterModelsByPlan = cfg?.filterModelsByPlan !== false
  const visibleModels = Array.isArray(cfg?.visibleModels) ? cfg.visibleModels.map(migrateModelId) : []

  const planModelSet = new Set(dynamic.map((m) => m.id))
  for (const m of allModels) {
    if (m.inPlan === undefined) {
      m.inPlan = isSynced ? (planModelSet.has(m.id) || planModelSet.has(migrateModelId(m.id)) || Boolean(m.isCustom)) : true
    }
  }

  let activeIds = getActiveModelIds(allDefaultIds, disabledList)
  if (filterModelsByPlan && isSynced && planModelSet.size > 0) {
    const inPlanIds = activeIds.filter((id) => {
      const m = allModels.find((mod) => mod.id === id)
      return m ? m.inPlan : true
    })
    if (inPlanIds.length > 0) {
      activeIds = inPlanIds
    }
  }
  if (visibleModels.length > 0) {
    const visibleSet = new Set(visibleModels)
    const filteredByVisible = activeIds.filter((id) => visibleSet.has(id))
    if (filteredByVisible.length > 0) {
      activeIds = filteredByVisible
    }
  }

  if (!activeIds.length && allDefaultIds.length) {
    activeIds = [allDefaultIds[0]]
  }

  let defaultModel = migrateModelId(cfg?.defaultModel || DEFAULT_MODEL_ID)
  let defaultModelWarning = null

  if (allDefaultIds.length > 0 && !allDefaultIds.includes(defaultModel)) {
    const fallbackModel = activeIds[0] || allDefaultIds[0]
    defaultModelWarning = `Configured default model "${defaultModel}" is not available in your active plan. Using "${fallbackModel}" instead.`
    defaultModel = fallbackModel
  }

  const planSyncedAt = Number(cfg?.planSyncedAt) || (isSynced ? (dynamic.planSyncedAt || 0) : 0)
  const rawMaxOutput = Number(cfg?.maxOutputTokens)
  const maxOutputTokens = Number.isFinite(rawMaxOutput) ? (rawMaxOutput === -1 ? null : rawMaxOutput) : null
  const priceOverrides = cfg?.priceOverrides && typeof cfg.priceOverrides === 'object' && !Array.isArray(cfg.priceOverrides)
    ? cfg.priceOverrides
    : {}

  return {
    enabled: !!cfg?.enabled,
    baseUrl: normalizeBaseUrl(cfg?.baseUrl),
    apiKeyEnv: cfg?.apiKeyEnv || DEFAULT_API_KEY_ENV,
    defaultModel,
    defaultModelWarning,
    dynamicModels: dynamic,
    planSynced: isSynced,
    planSyncedAt,
    modelContextOverrides: effectiveOverrides,
    contextWindow,
    maxOutputTokens,
    priceOverrides,
    modelReasoningDefaults: cfg?.modelReasoningDefaults && typeof cfg.modelReasoningDefaults === 'object' ? cfg.modelReasoningDefaults : {},
    modelRoutes: cfg?.modelRoutes && typeof cfg.modelRoutes === 'object' ? cfg.modelRoutes : {},
    customModels: custom,
    statsPath: String(cfg?.statsPath || '~/.dsh/clinebot-stats.json'),
    priceCatalogUrl: String(cfg?.priceCatalogUrl || 'https://models.dev/api.json'),
    priceCatalogPath: String(cfg?.priceCatalogPath || '~/.dsh/clinebot-prices.json'),
    eventLogPath: String(cfg?.eventLogPath || '~/.dsh/clinebot-events.json'),
    statsRetentionDays: Number.isFinite(Number(cfg?.statsRetentionDays))
      ? Math.max(0, Math.min(3650, Number(cfg.statsRetentionDays)))
      : 95,
    dailyBudgetUsd: Math.max(0, Number(cfg?.dailyBudgetUsd) || 0),
    monthlyBudgetUsd: Math.max(0, Number(cfg?.monthlyBudgetUsd) || 0),
    disabledModels: disabledList,
    filterModelsByPlan,
    visibleModels,
    showSidebarQuota: cfg?.showSidebarQuota !== false,
    showComposerCost: cfg?.showComposerCost !== false,
    webSearch: cfg?.webSearch !== false,
    offloadSeenImages: cfg?.offloadSeenImages !== false,
    maxPayloadMb: Number(cfg?.maxPayloadMb) || 40,
    enabledModels: activeIds,
    timeoutMs: Number(cfg?.timeoutMs) || DEFAULT_TIMEOUT_MS,
    smokeTimeoutMs: Number(cfg?.smokeTimeoutMs) || DEFAULT_SMOKE_TIMEOUT_MS,
    streamIdleTimeoutMs: Number(cfg?.streamIdleTimeoutMs) || DEFAULT_STREAM_IDLE_TIMEOUT_MS,
    modelsCachePath: String(cfg?.modelsCachePath || '~/.dsh/clinebot-models-cache.json'),
    accounts: Array.isArray(cfg?.accounts) ? cfg.accounts : [],
    activeAccount: String(cfg?.activeAccount || ''),
    accountMode: cfg?.accountMode === 'round_robin' ? 'round_robin' : 'least_used',
  }
}
