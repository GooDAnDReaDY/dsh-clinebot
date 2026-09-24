/**
 * Curated and extensible models catalog for ClineBot / ClinePass.
 *
 * Notice: GET /v1/models returns 404 on api.cline.bot, so DSH cannot rely on
 * dynamic OpenAI model discovery. Furthermore, ClinePass upstream proxy enforces
 * a uniform 200,000 token context window cap across subscription completion routes,
 * and /users/me/plan returns only feature strings without per-model context specs.
 * This catalogue provides the official ClinePass models (200k gateway capacity) plus
 * support for user-defined custom models with arbitrary context length.
 */

export const PROVIDER_ID = 'clinebot'
export const PROVIDER_DISPLAY_NAME = 'ClineBot (ClinePass)'
export const DEFAULT_MODEL_ID = 'cline-pass/deepseek-v4-flash'

export const CLINE_MODELS = Object.freeze([
  {
    id: 'cline-pass/deepseek-v4-flash',
    name: 'DeepSeek V4 Flash',
    description: 'High-speed reasoning & code completion model optimized for agentic loops.',
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
      matched.push({
        id: `cline-pass/${idPart}`,
        name,
        description: `Official ClinePass subscription model: ${name}`,
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
 */
export function getAllModels(dynamicModels = []) {
  if (Array.isArray(dynamicModels) && dynamicModels.length > 0) {
    const normalize = (s) => String(s || '').toLowerCase().replace(/[\s._-]+/g, '')
    return dynamicModels.map((dm) => {
      const targetNorm = normalize(dm.id.replace(/^cline-pass\//, ''))
      const curated = CLINE_MODELS.find(
        (cm) => cm.id === dm.id || normalize(cm.id.replace(/^cline-pass\//, '')) === targetNorm || normalize(cm.name) === targetNorm
      )
      if (curated) {
        return {
          ...curated,
          ...dm,
          description: dm.description || curated.description,
          contextLength: dm.contextLength || curated.contextLength,
          maxTokens: dm.maxTokens || curated.maxTokens,
          input: dm.input && dm.input.length ? dm.input : curated.input,
          category: dm.category || curated.category,
          reasoningEfforts: dm.reasoningEfforts !== undefined ? dm.reasoningEfforts : curated.reasoningEfforts,
          unverified: false,
        }
      }
      return {
        ...dm,
        unverified: false,
      }
    })
  }

  return CLINE_MODELS.map((m) => ({ ...m, unverified: true }))
}

export function findModel(id, dynamicModels = []) {
  const all = getAllModels(dynamicModels)
  const found = all.find((m) => m.id === id)
  if (found) return found
  return CLINE_MODELS.find((m) => m.id === id) || null
}

export function isSupportedModel(id, dynamicModels = []) {
  return findModel(id, dynamicModels) !== null
}

export function getDefaultModelIds(dynamicModels = []) {
  return getAllModels(dynamicModels).map((m) => m.id)
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
 * Format context length cleanly (e.g. 200000 -> '200K', 128000 -> '128K').
 */
export function formatModelContext(contextLength) {
  const num = Number(contextLength) || 200000
  if (num >= 1000000) return `${Math.round(num / 1000000)}M`
  if (num >= 1000) return `${Math.round(num / 1000)}K`
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
export function isVisionModel(id, dynamicModels = []) {
  const m = findModel(id, dynamicModels)
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

