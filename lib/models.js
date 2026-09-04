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
 * Validate a custom model entry.
 */
export function validateCustomModel(raw) {
  if (!raw || typeof raw !== 'object') {
    return { ok: false, error: 'Model descriptor must be an object' }
  }

  let id = String(raw.id || '').trim()
  if (!id) {
    return { ok: false, error: 'Model ID is required' }
  }
  // If user didn't prefix with cline-pass/, allow both or auto-prefix if helpful
  if (!id.startsWith('cline-pass/') && !id.includes('/')) {
    id = `cline-pass/${id}`
  }

  const name = String(raw.name || '').trim() || id.split('/').pop() || id
  const contextLength = Number(raw.contextLength) > 0 ? Number(raw.contextLength) : 200000
  const maxTokens = Number(raw.maxTokens) > 0 ? Number(raw.maxTokens) : 8192
  const hasVision = Boolean(raw.hasVision || raw.input?.includes('vision') || raw.input?.includes('image'))
  const input = hasVision ? ['text', 'image'] : ['text']
  const category = ['coding', 'reasoning', 'multimodal', 'general'].includes(raw.category)
    ? raw.category
    : hasVision ? 'multimodal' : 'general'

  return {
    ok: true,
    model: {
      id,
      name,
      description: String(raw.description || 'User added custom model').trim(),
      contextLength,
      maxTokens,
      input,
      category,
      recommended: false,
      isCustom: true,
    },
  }
}

/**
 * Get all models combining built-in official models with custom user additions.
 */
export function getAllModels(customModels = []) {
  const result = [...CLINE_MODELS]
  const seenIds = new Set(result.map((m) => m.id))

  if (Array.isArray(customModels)) {
    for (const item of customModels) {
      const valid = validateCustomModel(item)
      if (valid.ok && !seenIds.has(valid.model.id)) {
        result.push(valid.model)
        seenIds.add(valid.model.id)
      }
    }
  }

  return result
}

export function findModel(id, customModels = []) {
  const all = getAllModels(customModels)
  return all.find((m) => m.id === id) || null
}

export function isSupportedModel(id, customModels = []) {
  return findModel(id, customModels) !== null
}

export function getDefaultModelIds(customModels = []) {
  return getAllModels(customModels).map((m) => m.id)
}
