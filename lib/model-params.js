/**
 * Normalization for per-model sampling and modality overrides.
 *
 * DSH's GenerateOptions exposes temperature/maxTokens/stop only; topP is a
 * plugin-level request default. Every value is optional and an empty/invalid
 * value clears the override.
 */

export const MAX_STOP_SEQUENCES = 4

export function normalizeInput(value) {
  if (value === undefined || value === null) return undefined
  const parts = Array.isArray(value) ? value : String(value).split(',')
  const set = new Set()
  for (const part of parts) {
    const token = String(part ?? '').trim().toLowerCase()
    if (!token) continue
    if (token === 'vision') set.add('image')
    else if (token === 'text' || token === 'image') set.add(token)
  }
  if (!set.has('text') && !set.has('image')) return undefined
  return set.has('image') ? ['text', 'image'] : ['text']
}

export function normalizeTemperature(value) {
  if (value === undefined || value === null || value === '') return undefined
  const number = Number(value)
  return Number.isFinite(number) && number >= 0 && number <= 2 ? number : undefined
}

export function normalizeTopP(value) {
  if (value === undefined || value === null || value === '') return undefined
  const number = Number(value)
  return Number.isFinite(number) && number >= 0 && number <= 1 ? number : undefined
}

export function normalizeStop(value) {
  if (value === undefined || value === null) return undefined
  const parts = Array.isArray(value) ? value : String(value).split(/[,\n]/)
  const stop = parts
    .map((entry) => String(entry ?? '').trim())
    .filter(Boolean)
    .slice(0, MAX_STOP_SEQUENCES)
  return stop.length > 0 ? stop : undefined
}

export function normalizeModelParams(source = {}) {
  const out = {}
  const input = normalizeInput(source?.input)
  if (input) out.input = input
  const temperature = normalizeTemperature(source?.temperature)
  if (temperature !== undefined) out.temperature = temperature
  const topP = normalizeTopP(source?.topP ?? source?.top_p)
  if (topP !== undefined) out.topP = topP
  const stop = normalizeStop(source?.stop)
  if (stop) out.stop = stop
  return out
}

export function modelParamsFrom(source) {
  return normalizeModelParams(source || {})
}
