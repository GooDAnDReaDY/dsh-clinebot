/**
 * Curated and extensible models catalog for ClineBot / ClinePass.
 *
 * Notice: GET /v1/models returns 404 on api.cline.bot, so DSH cannot rely on
 * dynamic OpenAI model discovery. This catalogue provides the official ClinePass
 * models plus support for user-defined custom models added via the Settings page.
 */

export const PROVIDER_ID = 'clinebot'
export const PROVIDER_DISPLAY_NAME = 'ClineBot (ClinePass)'
export const DEFAULT_MODEL_ID = 'cline-pass/deepseek-v4-flash'

export const CLINE_MODELS = Object.freeze([
  {
    id: 'cline-pass/deepseek-v4-flash',
    name: 'DeepSeek V4 Flash',
    description: 'High-speed reasoning & code completion model optimized for agentic loops.',
    contextLength: 200000,
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
    contextLength: 200000,
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
    contextLength: 200000,
    maxTokens: 8192,
    input: ['text'],
    category: 'general',
    recommended: false,
    isCustom: false,
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
    reasoningEfforts: ['low', 'high', 'max'],
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
    description: 'Large-scale multimodal foundation model from Alibaba Cloud.',
    contextLength: 200000,
    maxTokens: 8192,
    input: ['text', 'image'],
    category: 'multimodal',
    recommended: true,
    isCustom: false,
  },
  {
    id: 'cline-pass/qwen3.7-plus',
    name: 'Qwen 3.7 Plus',
    description: 'Fast, capable multimodal model with strong multilingual skills.',
    contextLength: 200000,
    maxTokens: 8192,
    input: ['text', 'image'],
    category: 'multimodal',
    recommended: false,
    isCustom: false,
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
    description: 'Xiaomi MiMo efficient instruction model.',
    contextLength: 200000,
    maxTokens: 8192,
    input: ['text'],
    category: 'general',
    recommended: false,
    isCustom: false,
  },
  {
    id: 'cline-pass/mimo-v2.5-pro',
    name: 'MiMo V2.5 Pro',
    description: 'Xiaomi MiMo advanced agentic reasoning model.',
    contextLength: 200000,
    maxTokens: 8192,
    input: ['text'],
    category: 'coding',
    recommended: false,
    isCustom: false,
  },
  {
    id: 'cline-pass/claude-3-7-sonnet',
    name: 'Claude 3.7 Sonnet',
    description: 'Hybrid reasoning and standard generation model with high coding proficiency.',
    contextLength: 200000,
    maxTokens: 8192,
    input: ['text', 'image'],
    category: 'coding',
    recommended: true,
    isCustom: false,
    reasoningEfforts: ['low', 'medium', 'high'],
  },
  {
    id: 'cline-pass/gpt-4.5-preview',
    name: 'GPT-4.5 Preview',
    description: 'Advanced flagship frontier model with deep world knowledge and intuition.',
    contextLength: 128000,
    maxTokens: 16384,
    input: ['text', 'image'],
    category: 'general',
    recommended: true,
    isCustom: false,
  },
  {
    id: 'cline-pass/o3-mini',
    name: 'o3-mini',
    description: 'Fast, cost-effective reasoning model specialized for STEM and coding.',
    contextLength: 200000,
    maxTokens: 65536,
    input: ['text'],
    category: 'reasoning',
    recommended: true,
    isCustom: false,
    reasoningEfforts: ['low', 'medium', 'high'],
  },
  {
    id: 'cline-pass/gemini-2.5-pro',
    name: 'Gemini 2.5 Pro',
    description: 'State-of-the-art multimodal reasoning model with extended context.',
    contextLength: 1000000,
    maxTokens: 8192,
    input: ['text', 'image'],
    category: 'multimodal',
    recommended: true,
    isCustom: false,
    reasoningEfforts: ['low', 'medium', 'high'],
  },
  {
    id: 'cline-pass/gemini-2.5-flash',
    name: 'Gemini 2.5 Flash',
    description: 'Ultra-fast multimodal model optimized for real-time agent workflows.',
    contextLength: 1000000,
    maxTokens: 8192,
    input: ['text', 'image'],
    category: 'general',
    recommended: false,
    isCustom: false,
  },
  {
    id: 'cline-pass/qwen-2.5-coder-32b',
    name: 'Qwen 2.5 Coder 32B',
    description: 'Open-weights powerhouse for code generation, refactoring and bug fixing.',
    contextLength: 131072,
    maxTokens: 8192,
    input: ['text'],
    category: 'coding',
    recommended: false,
    isCustom: false,
  },
])

/**
 * Parse human-readable included models string from ClinePass plan features.
 * Example: "Includes Kimi K3, GLM 5.2, Kimi K2.6, Kimi K2.7 Code, Mimo v2.5, Mimo v2.5 Pro, Minimax M3, Qwen3.7 Plus, Qwen3.7 Max, DeepSeek V4 Pro, and DeepSeek V4 Flash"
 */
export function parsePlanIncludedModels(includedText) {
  if (!includedText || typeof includedText !== 'string') return []
  const clean = includedText
    .replace(/^includes\s+/i, '')
    .replace(/\band\b/gi, ',')
    .replace(/\./g, '')
    .trim()

  const parts = clean
    .split(',')
    .map((p) => p.trim())
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
      const idPart = name.toLowerCase().replace(/[\s_]+/g, '-')
      matched.push({
        id: `cline-pass/${idPart}`,
        name,
        description: `Official ClinePass subscription model: ${name}`,
        contextLength: 200000,
        maxTokens: 8192,
        input: ['text'],
        category: 'general',
        recommended: false,
        isCustom: false,
      })
    }
  }

  return matched
}

/**
 * Get all models from known catalog.
 */
export function getAllModels(dynamicModels = []) {
  const result = [...CLINE_MODELS]
  const seenIds = new Set(result.map((m) => m.id))

  if (Array.isArray(dynamicModels)) {
    for (const item of dynamicModels) {
      if (item && item.id && !seenIds.has(item.id)) {
        result.push(item)
        seenIds.add(item.id)
      }
    }
  }

  return result
}

export function findModel(id, dynamicModels = []) {
  const all = getAllModels(dynamicModels)
  return all.find((m) => m.id === id) || null
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
export async function saveModelsDiskCache(cachePath, models = []) {
  if (!cachePath || !Array.isArray(models) || !models.length) return false
  try {
    const fs = await import('node:fs/promises')
    const path = await import('node:path')
    const dir = path.dirname(cachePath)
    await fs.mkdir(dir, { recursive: true })
    const payload = JSON.stringify({ savedAt: Date.now(), models }, null, 2)
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
    return Array.isArray(parsed?.models) ? parsed.models : null
  } catch {
    return null
  }
}

