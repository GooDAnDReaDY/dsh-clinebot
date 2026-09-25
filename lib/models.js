/**
 * Curated and extensible models catalog for ClineBot / ClinePass.
 *
 * Notice: GET /v1/models returns 404 on api.cline.bot, so DSH cannot rely on
 * dynamic OpenAI model discovery. Furthermore, ClinePass upstream proxy enforces
 * a uniform 200,000 token context window cap across subscription completion routes,
 * and /users/me/plan returns only feature strings without per-model context specs.
 * This catalogue provides the official ClinePass models (200k gateway capacity) plus
 * support for user-defined custom models with arbitrary context length and authentic
 * original model creator specifications (Moonshot 2M, Qwen 1M, MiniMax 1M, MiMo 1M, etc.).
 */

export const PROVIDER_ID = 'clinebot'
export const PROVIDER_DISPLAY_NAME = 'ClineBot (ClinePass)'
export const DEFAULT_MODEL_ID = 'cline-pass/deepseek-v4-flash'

/**
 * Authentic original model specifications from original creators:
 * Moonshot AI (Kimi): 2,000,000 tokens
 * Alibaba Cloud (Qwen): 1,000,000 tokens
 * MiniMax: 1,000,000 tokens
 * Xiaomi (MiMo): 1,000,000 tokens
 * DeepSeek: 128,000 tokens
 * Zhipu AI (GLM): 128,000 tokens
 */
export function getOriginalModelContext(nameOrId) {
  const norm = String(nameOrId || '').toLowerCase()
  if (norm.includes('kimi')) return 2000000
  if (norm.includes('qwen')) return 1000000
  if (norm.includes('minimax')) return 1000000
  if (norm.includes('mimo')) return 1000000
  if (norm.includes('deepseek')) return 128000
  if (norm.includes('glm')) return 128000
  return 200000
}

export function getOriginalModelProvider(nameOrId) {
  const norm = String(nameOrId || '').toLowerCase()
  if (norm.includes('kimi')) return 'Moonshot AI'
  if (norm.includes('qwen')) return 'Alibaba Cloud'
  if (norm.includes('minimax')) return 'MiniMax'
  if (norm.includes('mimo')) return 'Xiaomi'
  if (norm.includes('deepseek')) return 'DeepSeek'
  if (norm.includes('glm')) return 'Zhipu AI'
  return 'Original Vendor'
}

export const CLINE_MODELS = Object.freeze([
  {
    id: 'cline-pass/deepseek-v4-flash',
    name: 'DeepSeek V4 Flash',
    description: 'High-speed reasoning & code completion model optimized for agentic loops.',
    clineContextLength: 128000,
    defaultContextLength: 128000,
    originalContextLength: 128000,
    originalProvider: 'DeepSeek',
    contextLength: 128000,
    maxTokens: 8192,
    input: ['text', 'image'],
    category: 'coding',
    recommended: true,
    isCustom: false,
    reasoningEfforts: ['low', 'medium', 'high'],
  },
  {
    id: 'cline-pass/deepseek-v4-pro',
    name: 'DeepSeek V4 Pro',
    description: 'Flagship reasoning and multi-turn architectural coding model.',
    clineContextLength: 128000,
    defaultContextLength: 128000,
    originalContextLength: 128000,
    originalProvider: 'DeepSeek',
    contextLength: 128000,
    maxTokens: 8192,
    input: ['text', 'image'],
    category: 'coding',
    recommended: true,
    isCustom: false,
    reasoningEfforts: ['low', 'medium', 'high', 'max'],
  },
  {
    id: 'cline-pass/glm-5.2',
    name: 'GLM 5.2',
    description: 'Bilingual general & coding model with strong instruction following.',
    clineContextLength: 128000,
    defaultContextLength: 128000,
    originalContextLength: 128000,
    originalProvider: 'Zhipu AI',
    contextLength: 128000,
    maxTokens: 8192,
    input: ['text'],
    category: 'general',
    recommended: false,
    isCustom: false,
    reasoningEfforts: ['low', 'medium', 'high'],
  },
  {
    id: 'cline-pass/kimi-k3',
    name: 'Kimi K3',
    description: 'Long-context reasoning & document synthesis model by Moonshot AI.',
    clineContextLength: 200000,
    defaultContextLength: 200000,
    originalContextLength: 2000000,
    originalProvider: 'Moonshot AI',
    contextLength: 200000,
    maxTokens: 8192,
    input: ['text'],
    category: 'reasoning',
    recommended: true,
    isCustom: false,
    reasoningEfforts: ['low', 'medium', 'high', 'max'],
  },
  {
    id: 'cline-pass/kimi-k2.7-code',
    name: 'Kimi K2.7 Code',
    description: 'Specialized coding model with agentic tool calling support.',
    clineContextLength: 200000,
    defaultContextLength: 200000,
    originalContextLength: 2000000,
    originalProvider: 'Moonshot AI',
    contextLength: 200000,
    maxTokens: 8192,
    input: ['text'],
    category: 'coding',
    recommended: false,
    isCustom: false,
  },
  {
    id: 'cline-pass/kimi-k2.6',
    name: 'Kimi K2.6',
    description: 'Balanced long-context conversational model.',
    clineContextLength: 200000,
    defaultContextLength: 200000,
    originalContextLength: 2000000,
    originalProvider: 'Moonshot AI',
    contextLength: 200000,
    maxTokens: 8192,
    input: ['text'],
    category: 'general',
    recommended: false,
    isCustom: false,
  },
  {
    id: 'cline-pass/qwen3.7-max',
    name: 'Qwen 3.7 Max',
    description: 'Large-scale multimodal foundation model from Alibaba Cloud with reasoning support.',
    clineContextLength: 128000,
    defaultContextLength: 128000,
    originalContextLength: 1000000,
    originalProvider: 'Alibaba Cloud',
    contextLength: 128000,
    maxTokens: 8192,
    input: ['text', 'image'],
    category: 'multimodal',
    recommended: true,
    isCustom: false,
    reasoningEfforts: ['low', 'medium', 'high', 'max'],
  },
  {
    id: 'cline-pass/qwen3.7-plus',
    name: 'Qwen 3.7 Plus',
    description: 'Fast, capable multimodal model with strong multilingual skills and reasoning.',
    clineContextLength: 128000,
    defaultContextLength: 128000,
    originalContextLength: 1000000,
    originalProvider: 'Alibaba Cloud',
    contextLength: 128000,
    maxTokens: 8192,
    input: ['text', 'image'],
    category: 'multimodal',
    recommended: false,
    isCustom: false,
    reasoningEfforts: ['low', 'medium', 'high', 'max'],
  },
  {
    id: 'cline-pass/minimax-m3',
    name: 'MiniMax M3',
    description: 'High throughput reasoning and synthesis model.',
    clineContextLength: 200000,
    defaultContextLength: 200000,
    originalContextLength: 1000000,
    originalProvider: 'MiniMax',
    contextLength: 200000,
    maxTokens: 8192,
    input: ['text'],
    category: 'reasoning',
    recommended: false,
    isCustom: false,
    reasoningEfforts: ['low', 'medium', 'high'],
  },
  {
    id: 'cline-pass/mimo-v2.5',
    name: 'MiMo V2.5',
    description: 'Xiaomi MiMo efficient instruction model with reasoning and multimodal support.',
    clineContextLength: 128000,
    defaultContextLength: 128000,
    originalContextLength: 1000000,
    originalProvider: 'Xiaomi',
    contextLength: 128000,
    maxTokens: 8192,
    input: ['text', 'image'],
    category: 'general',
    recommended: false,
    isCustom: false,
    reasoningEfforts: ['low', 'medium', 'high', 'max'],
  },
  {
    id: 'cline-pass/mimo-v2.5-pro',
    name: 'MiMo V2.5 Pro',
    description: 'Xiaomi MiMo advanced agentic reasoning model with multimodal support.',
    clineContextLength: 128000,
    defaultContextLength: 128000,
    originalContextLength: 1000000,
    originalProvider: 'Xiaomi',
    contextLength: 128000,
    maxTokens: 8192,
    input: ['text', 'image'],
    category: 'coding',
    recommended: false,
    isCustom: false,
    reasoningEfforts: ['low', 'medium', 'high', 'max'],
  },
])

/**
 * Parse human-readable included models string from ClinePass plan features.
 * Example: "Includes Kimi K3, GLM 5.2, Kimi K2.6, Kimi K2.7 Code, Mimo v2.5, Mimo v2.5 Pro, Minimax M3, Qwen3.7 Plus, Qwen3.7 Max, DeepSeek V4 Pro, and DeepSeek V4 Flash"
 */
export function parsePlanIncludedModels(includedInput) {
  if (!includedInput) return []
  let includedText = ''
  if (Array.isArray(includedInput)) {
    const foundStr = includedInput.find((item) => typeof item === 'string' && /includes\s+/i.test(item))
    if (foundStr) {
      includedText = foundStr
    } else {
      includedText = includedInput.filter((x) => typeof x === 'string').join(', ')
    }
  } else if (typeof includedInput === 'string') {
    includedText = includedInput
  } else {
    return []
  }
  const clean = includedText
    .replace(/^includes\s+/i, '')
    .replace(/\band\b/gi, ',')
    .replace(/[.;]+$/g, '')
    .trim()

  const parts = clean
    .split(',')
    .map((p) => p.trim().replace(/[.;]+$/g, '').trim())
    .filter(Boolean)

  const normalize = (s) =>
    String(s || '')
      .toLowerCase()
      .replace(/[\s._-]+/g, '')

  const matched = []
  for (const name of parts) {
    const targetNorm = normalize(name)
    const found = CLINE_MODELS.find(
      (m) =>
        normalize(m.name) === targetNorm ||
        normalize(m.id.replace(/^cline-pass\//, '')) === targetNorm
    )
    if (found) {
      matched.push(found)
    } else {
      // Dynamic fallback for newly introduced models mentioned in plan
      const idPart = name
        .toLowerCase()
        .trim()
        .replace(/^cline-pass\//, '')
        .replace(/qwen\s+([0-9])/i, 'qwen$1')
        .replace(/glm\s+([0-9])/i, 'glm-$1')
        .replace(/[\s_]+/g, '-')
        .replace(/-+/g, '-')
      const isVision = /(vision|vl|multimodal|omni|image)/i.test(name)
      const hasReasoning = /(reason|think|r1|pro|flash|max|plus|k3|m3|glm|qwen|mimo)/i.test(name)
      const origCtx = getOriginalModelContext(name)
      const origProv = getOriginalModelProvider(name)
      matched.push({
        id: `cline-pass/${idPart}`,
        name,
        description: `Official ClinePass subscription model: ${name}`,
        clineContextLength: 200000,
        defaultContextLength: 200000,
        originalContextLength: origCtx,
        originalProvider: origProv,
        contextLength: 200000,
        maxTokens: 8192,
        input: isVision ? ['text', 'image'] : ['text'],
        category: hasReasoning ? 'reasoning' : (isVision ? 'multimodal' : 'general'),
        recommended: false,
        isCustom: false,
        ...(hasReasoning ? { reasoningEfforts: ['low', 'medium', 'high', 'max'] } : {}),
      })
    }
  }

  return matched
}

/**
 * Get all models:
 * 1. When plan is synchronized (dynamicModels is a non-empty array):
 *    Registers strictly the models included in the active plan, enriching them
 *    with curated capabilities, reasoning efforts, and descriptions from CLINE_MODELS.
 * 2. When plan is unsynced (dynamicModels is empty):
 *    Falls back to the full curated CLINE_MODELS catalog marked with unverified: true.
 *
 * Applies user-defined modelContextOverrides (custom contextLength and maxTokens).
 */
export function getAllModels(dynamicModels = [], modelContextOverrides = []) {
  const overridesMap = new Map()
  if (Array.isArray(modelContextOverrides)) {
    for (const ov of modelContextOverrides) {
      if (ov && ov.modelId) overridesMap.set(ov.modelId, ov)
    }
  }

  function applyOverride(m) {
    const defaultCtx = m.clineContextLength || m.defaultContextLength || m.contextLength || 200000
    const origCtx = m.originalContextLength || getOriginalModelContext(m.id)
    const origProv = m.originalProvider || getOriginalModelProvider(m.id)
    const ov = overridesMap.get(m.id)
    const activeCtx = ov && typeof ov.contextLength === 'number' && ov.contextLength > 0
      ? ov.contextLength
      : defaultCtx
    const activeMaxTokens = ov && typeof ov.maxTokens === 'number' && ov.maxTokens > 0
      ? ov.maxTokens
      : m.maxTokens || 8192
    return {
      ...m,
      contextLength: activeCtx,
      maxTokens: activeMaxTokens,
      defaultContextLength: defaultCtx,
      clineContextLength: defaultCtx,
      originalContextLength: origCtx,
      originalProvider: origProv,
      isContextOverridden: activeCtx !== defaultCtx,
    }
  }

  if (Array.isArray(dynamicModels) && dynamicModels.length > 0) {
    const normalize = (s) => String(s || '').toLowerCase().replace(/[\s._-]+/g, '')
    return dynamicModels.map((dm) => {
      const targetNorm = normalize(dm.id.replace(/^cline-pass\//, ''))
      const curated = CLINE_MODELS.find(
        (cm) => cm.id === dm.id || normalize(cm.id.replace(/^cline-pass\//, '')) === targetNorm || normalize(cm.name) === targetNorm
      )
      if (curated) {
        return applyOverride({
          ...curated,
          ...dm,
          description: dm.description || curated.description,
          contextLength: dm.contextLength || curated.contextLength,
          maxTokens: dm.maxTokens || curated.maxTokens,
          clineContextLength: curated.clineContextLength || curated.contextLength,
          defaultContextLength: curated.defaultContextLength || curated.contextLength,
          originalContextLength: curated.originalContextLength || getOriginalModelContext(curated.id),
          originalProvider: curated.originalProvider || getOriginalModelProvider(curated.id),
          input: dm.input && dm.input.length ? dm.input : curated.input,
          category: dm.category || curated.category,
          reasoningEfforts: dm.reasoningEfforts !== undefined ? dm.reasoningEfforts : curated.reasoningEfforts,
          unverified: false,
        })
      }
      return applyOverride({
        ...dm,
        clineContextLength: dm.contextLength || 200000,
        defaultContextLength: dm.contextLength || 200000,
        originalContextLength: dm.originalContextLength || getOriginalModelContext(dm.id),
        originalProvider: dm.originalProvider || getOriginalModelProvider(dm.id),
        unverified: false,
      })
    })
  }

  return CLINE_MODELS.map((m) => applyOverride({ ...m, unverified: true }))
}

export function findModel(id, dynamicModels = [], modelContextOverrides = []) {
  const all = getAllModels(dynamicModels, modelContextOverrides)
  const found = all.find((m) => m.id === id)
  if (found) return found
  return CLINE_MODELS.find((m) => m.id === id) || null
}

export function isSupportedModel(id, dynamicModels = [], modelContextOverrides = []) {
  return findModel(id, dynamicModels, modelContextOverrides) !== null
}

export function getDefaultModelIds(dynamicModels = [], modelContextOverrides = []) {
  return getAllModels(dynamicModels, modelContextOverrides).map((m) => m.id)
}

/**
 * Filter out models explicitly disabled by user.
 * Any newly introduced model (not in disabledModelIds) is active by default.
 */
export function getActiveModelIds(allModels = [], disabledModelIds = []) {
  const disabledSet = new Set(Array.isArray(disabledModelIds) ? disabledModelIds : [])
  return (Array.isArray(allModels) ? allModels : [])
    .map((m) => (typeof m === 'string' ? m : m?.id))
    .filter((id) => Boolean(id && !disabledSet.has(id)))
}

/**
 * Format context length cleanly (e.g. 2000000 -> '2M', 1000000 -> '1M', 200000 -> '200K', 128000 -> '128K').
 */
export function formatModelContext(contextLength) {
  const num = Number(contextLength) || 200000
  if (num >= 1000000) {
    const m = num / 1000000
    return `${m % 1 === 0 ? m : m.toFixed(1)}M`
  }
  if (num >= 1000) {
    const k = num / 1000
    return `${k % 1 === 0 ? k : k.toFixed(1)}K`
  }
  return String(num)
}

/**
 * Format model description with compact tags for DSH model picker.
 */
export function formatModelDescription(model) {
  const parts = []
  const ctx = formatModelContext(model.contextLength || model.contextWindow)
  if (ctx) parts.push(ctx)
  if (model.input?.includes('image') || model.input?.includes('vision')) {
    parts.push('Vision')
  }
  if (model.category && model.category !== 'general') {
    const cat = model.category.charAt(0).toUpperCase() + model.category.slice(1)
    parts.push(cat)
  }
  const prefix = parts.length > 0 ? `[${parts.join(' · ')}] ` : ''
  const baseDesc = model.description || model.name || model.id
  return `${prefix}${baseDesc}`
}

/**
 * Check if a model supports vision input.
 */
export function isVisionModel(id, dynamicModels = [], modelContextOverrides = []) {
  const m = findModel(id, dynamicModels, modelContextOverrides)
  if (!m) return false
  return Boolean(m.input?.includes('image') || m.input?.includes('vision'))
}

/**
 * Disk caching for discovered models.
 */
export async function saveModelsDiskCache(cachePath, models = [], planSyncedAt = Date.now()) {
  if (!cachePath || !Array.isArray(models) || !models.length) return false
  try {
    const fs = await import('node:fs/promises')
    const path = await import('node:path')
    const dir = path.dirname(cachePath)
    await fs.mkdir(dir, { recursive: true })
    const payload = JSON.stringify({ savedAt: Date.now(), planSyncedAt, models }, null, 2)
    await fs.writeFile(cachePath, payload, 'utf8')
    return true
  } catch {
    return false
  }
}

export async function loadModelsDiskCache(cachePath) {
  if (!cachePath) return null
  try {
    const fs = await import('node:fs/promises')
    const raw = await fs.readFile(cachePath, 'utf8')
    const parsed = JSON.parse(raw)
    const list = Array.isArray(parsed?.models) ? parsed.models : (Array.isArray(parsed) ? parsed : null)
    if (!list) return null
    list.planSyncedAt = typeof parsed?.planSyncedAt === 'number' ? parsed.planSyncedAt : (typeof parsed?.savedAt === 'number' ? parsed.savedAt : 0)
    return list
  } catch {
    return null
  }
}
