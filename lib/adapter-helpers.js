/**
 * Helper utilities for ClineBot LlmAdapter.
 */

/**
 * Yield one already-consumed item before the rest of an async iterator.
 * @template T
 * @param {T} first
 * @param {AsyncIterator<T> | AsyncIterable<T>} rest
 * @returns {AsyncGenerator<T>}
 */
export async function* prependAsync(first, rest) {
  yield first
  for await (const item of rest) yield item
}

/**
 * Whether a chunk carries the first model-visible token.
 * @param {Record<string, unknown>} chunk
 * @returns {boolean}
 */
export function isContentChunk(chunk) {
  return chunk?.type === 'text-delta'
    || chunk?.type === 'reasoning-delta'
    || chunk?.type === 'tool-call-delta'
}

/**
 * Read a `Retry-After` header as milliseconds.
 * @param {Headers | undefined} headers
 * @returns {number | undefined}
 */
export function retryAfterMs(headers) {
  const raw = headers?.get?.('retry-after')
  if (!raw) return undefined
  const seconds = Number(raw)
  return Number.isFinite(seconds) && seconds > 0 ? Math.round(seconds * 1000) : undefined
}

/**
 * Normalize the catalogue's reasoning-effort representation into a clean list.
 * @param {unknown} value
 * @returns {string[]}
 */
export function reasoningEfforts(value) {
  if (Array.isArray(value)) {
    return value.map((entry) => String(entry || '').trim().toLowerCase()).filter(Boolean)
  }
  if (value && typeof value === 'object') {
    return Object.keys(value).map((entry) => String(entry || '').trim().toLowerCase()).filter(Boolean)
  }
  return []
}

/**
 * Human label for a reasoning effort id.
 * @param {string} id
 * @returns {string}
 */
export function reasoningLabel(id) {
  if (id === 'low') return 'Low'
  if (id === 'medium') return 'Medium'
  if (id === 'high') return 'High'
  if (id === 'max') return 'Max'
  if (id === 'minimal') return 'Minimal'
  return id
}

/**
 * Read the attachment service defensively.
 * @param {object | undefined} ctx
 * @returns {unknown}
 */
export function attachmentStore(ctx) {
  try {
    return ctx?.get?.('attachments') || ctx?.attachments
  } catch {
    return undefined
  }
}
