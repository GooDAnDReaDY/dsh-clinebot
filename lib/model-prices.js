/**
 * Local cost estimates for ClinePass models.
 *
 * ClinePass is a subscription, not a per-token invoice surface. These figures
 * are explicit ESTIMATES used only for the composer read-out and local
 * analytics; users can replace any rate through `priceOverrides`. A model with
 * no known or overridden rate stays `unpriced` rather than being shown as $0.
 */

const PRICE_TABLE_VERSION = 1

const OPEN_WEIGHT = Object.freeze({ input: 0.15, output: 0.6, cacheRead: 0.003, cacheWrite: null })
const CLAUDE = Object.freeze({ input: 3, output: 15, cacheRead: 0.3, cacheWrite: 3.75 })
const PREMIUM = Object.freeze({ input: 2.5, output: 10, cacheRead: 0.25, cacheWrite: null })

let publicCatalog = {}

/** Normalize a provider-qualified model ID to the last path segment. */
export function normalizeModelKey(modelId) {
  const raw = String(modelId || '').trim().toLowerCase()
  if (!raw) return ''
  return raw.split('/').filter(Boolean).pop() || ''
}

/** Install a catalog downloaded from a public model registry. */
export function setPublicPriceCatalog(catalog) {
  publicCatalog = catalog && typeof catalog === 'object' && !Array.isArray(catalog) ? catalog : {}
  return publicCatalog
}

export function getPublicPriceCatalog() {
  return publicCatalog
}

/**
 * Resolve one model's rates, preferring a user override.
 * @param {string} modelId
 * @param {Record<string, { input?: number, output?: number, cacheRead?: number, cacheWrite?: number }>} [overrides]
 * @returns {{ input: number, output: number, cacheRead: number|null, cacheWrite: number|null, source: string } | null}
 */
export function resolveModelPrice(modelId, overrides = {}, catalog = publicCatalog) {
  const id = String(modelId || '').toLowerCase()
  const override = overrides && typeof overrides === 'object' ? overrides[modelId] : undefined
  if (override && typeof override === 'object') {
    return {
      input: Math.max(0, Number(override.input) || 0),
      output: Math.max(0, Number(override.output) || 0),
      cacheRead: override.cacheRead === undefined || override.cacheRead === null ? null : Math.max(0, Number(override.cacheRead) || 0),
      cacheWrite: override.cacheWrite === undefined || override.cacheWrite === null ? null : Math.max(0, Number(override.cacheWrite) || 0),
      source: 'override',
    }
  }
  if (!id) return null
  const publicPrice = catalog && typeof catalog === 'object' ? catalog[normalizeModelKey(id)] : null
  if (publicPrice && typeof publicPrice === 'object') {
    return {
      input: Math.max(0, Number(publicPrice.input) || 0),
      output: Math.max(0, Number(publicPrice.output) || 0),
      cacheRead: publicPrice.cacheRead === undefined || publicPrice.cacheRead === null ? null : Math.max(0, Number(publicPrice.cacheRead) || 0),
      cacheWrite: publicPrice.cacheWrite === undefined || publicPrice.cacheWrite === null ? null : Math.max(0, Number(publicPrice.cacheWrite) || 0),
      source: 'public',
    }
  }
  if (id.includes('claude')) return { ...CLAUDE, source: 'estimate' }
  if (id.includes('gpt-') || id.includes('o3') || id.includes('o4')) return { ...PREMIUM, source: 'estimate' }
  if (/(deepseek|glm|kimi|qwen|minimax|mimo|llama|mistral)/.test(id)) return { ...OPEN_WEIGHT, source: 'estimate' }
  return null
}

/**
 * Estimate one request's USD cost from its token buckets.
 *
 * `promptTokens` includes cached input; cache buckets are priced separately.
 * Reasoning tokens are already part of `completionTokens` in the OpenAI wire.
 *
 * @param {{
 *   model: string,
 *   promptTokens?: number,
 *   completionTokens?: number,
 *   reasoningTokens?: number,
 *   cacheReadTokens?: number,
 *   cacheWriteTokens?: number,
 *   overrides?: Record<string, unknown>,
 * }} entry
 * @returns {{ usd: number, priced: boolean, breakdown: { input: number, output: number, cacheRead: number, cacheWrite: number } }}
 */
export function estimateCost({
  model,
  promptTokens = 0,
  completionTokens = 0,
  reasoningTokens = 0,
  cacheReadTokens = 0,
  cacheWriteTokens = 0,
  overrides = {},
}) {
  const price = resolveModelPrice(model, overrides)
  if (!price) {
    return { usd: 0, priced: false, breakdown: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 } }
  }
  const prompt = Math.max(0, Number(promptTokens) || 0)
  const cacheRead = Math.max(0, Number(cacheReadTokens) || 0)
  const cacheWrite = Math.max(0, Number(cacheWriteTokens) || 0)
  const uncachedInput = Math.max(0, prompt - cacheRead - cacheWrite)
  const output = Math.max(0, Number(completionTokens) || 0)
  const breakdown = {
    input: (uncachedInput * price.input) / 1_000_000,
    output: (output * price.output) / 1_000_000,
    cacheRead: price.cacheRead === null ? 0 : (cacheRead * price.cacheRead) / 1_000_000,
    cacheWrite: price.cacheWrite === null ? 0 : (cacheWrite * price.cacheWrite) / 1_000_000,
  }
  const usd = breakdown.input + breakdown.output + breakdown.cacheRead + breakdown.cacheWrite
  return { usd, priced: true, breakdown }
}

/**
 * Public price table for the browser composer read-out.
 * @param {Record<string, unknown>} [overrides]
 * @returns {{ version: number, currency: string, models: Array<Record<string, unknown>> }}
 */
export function priceTable(overrides = {}, modelIds = [], catalog = publicCatalog) {
  const rows = new Map()
  for (const modelId of Array.isArray(modelIds) ? modelIds : []) {
    const price = resolveModelPrice(modelId, overrides, catalog)
    if (!price) continue
    rows.set(modelId, {
      id: modelId,
      input: price.input,
      output: price.output,
      cacheRead: price.cacheRead,
      cacheWrite: price.cacheWrite,
      source: price.source,
    })
  }
  for (const [modelId, rates] of Object.entries(overrides || {})) {
    if (rows.has(modelId) || !rates || typeof rates !== 'object') continue
    rows.set(modelId, {
      id: modelId,
      input: Math.max(0, Number(rates.input) || 0),
      output: Math.max(0, Number(rates.output) || 0),
      cacheRead: rates.cacheRead === undefined ? null : Math.max(0, Number(rates.cacheRead) || 0),
      cacheWrite: rates.cacheWrite === undefined ? null : Math.max(0, Number(rates.cacheWrite) || 0),
      source: 'override',
    })
  }
  return { version: PRICE_TABLE_VERSION, currency: 'USD', models: [...rows.values()] }
}
