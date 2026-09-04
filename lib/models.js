/**
 * Official curated models catalog for ClineBot / ClinePass.
 *
 * Notice: GET /v1/models returns 404 on api.cline.bot, so DSH cannot rely on
 * dynamic OpenAI model discovery. This static catalogue reflects the official
 * ClinePass open-weights models list (https://docs.cline.bot/getting-started/clinepass).
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
    input: ['text', 'vision'],
    category: 'coding',
    recommended: true,
  },
  {
    id: 'cline-pass/deepseek-v4-pro',
    name: 'DeepSeek V4 Pro',
    description: 'Flagship reasoning and multi-turn architectural coding model.',
    contextLength: 200000,
    maxTokens: 8192,
    input: ['text', 'vision'],
    category: 'coding',
    recommended: true,
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
  },
  {
    id: 'cline-pass/qwen3.7-max',
    name: 'Qwen 3.7 Max',
    description: 'Large-scale multimodal foundation model from Alibaba Cloud.',
    contextLength: 200000,
    maxTokens: 8192,
    input: ['text', 'vision'],
    category: 'multimodal',
    recommended: true,
  },
  {
    id: 'cline-pass/qwen3.7-plus',
    name: 'Qwen 3.7 Plus',
    description: 'Fast, capable multimodal model with strong multilingual skills.',
    contextLength: 200000,
    maxTokens: 8192,
    input: ['text', 'vision'],
    category: 'multimodal',
    recommended: false,
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
  },
])

const MODEL_MAP = new Map(CLINE_MODELS.map((m) => [m.id, m]))

export function findModel(id) {
  return MODEL_MAP.get(id) || null
}

export function isSupportedModel(id) {
  return MODEL_MAP.has(id)
}

export function getAllModels() {
  return [...CLINE_MODELS]
}

export function getDefaultModelIds() {
  return CLINE_MODELS.map((m) => m.id)
}
