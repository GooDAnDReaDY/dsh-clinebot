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

