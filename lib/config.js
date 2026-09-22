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
    reasoningEfforts: z.any().default(undefined),
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

export function publicConfig(cfg) {
  const dynamic = Array.isArray(cfg?.dynamicModels) ? cfg.dynamicModels : []
  const allDefaultIds = getDefaultModelIds(dynamic)

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
