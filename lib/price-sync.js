import { readFileSync, writeFileSync, renameSync, mkdirSync, existsSync } from 'node:fs'
import { homedir } from 'node:os'
import path from 'node:path'
import { normalizeModelKey, getPublicPriceCatalog, setPublicPriceCatalog } from './model-prices.js'

const DEFAULT_URL = 'https://models.dev/api.json'

function isPrivateHost(host) {
  const value = String(host || '').toLowerCase().replace(/^\[|\]$/g, '')
  if (!value || value === 'localhost' || value.endsWith('.localhost')) return true
  if (value === '::1' || value.startsWith('fc') || value.startsWith('fd') || value.startsWith('fe80:')) return true
  if (value.startsWith('::ffff:')) return isPrivateHost(value.slice(7))
  const parts = value.split('.')
  if (parts.length !== 4 || parts.some((part) => !/^\d+$/.test(part))) return false
  const octets = parts.map(Number)
  if (octets.some((part) => part > 255)) return false
  return octets[0] === 0 || octets[0] === 10 || octets[0] === 127
    || (octets[0] === 169 && octets[1] === 254)
    || (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31)
    || (octets[0] === 192 && octets[1] === 168)
    || (octets[0] === 100 && octets[1] >= 64 && octets[1] <= 127)
}

export function isAllowedPriceCatalogUrl(value) {
  try {
    const url = new URL(String(value || ''))
    if (url.protocol !== 'https:' || url.username || url.password) return false
    const host = url.hostname.toLowerCase()
    if (isPrivateHost(host)) return false
    return host === 'models.dev' || host.endsWith('.models.dev')
  } catch {
    return false
  }
}

const PROVIDER_PRIORITY = {
  opencode: 0,
  cline: 0,
  anthropic: 1,
  openai: 2,
  deepseek: 3,
  moonshotai: 4,
  'z-ai': 5,
  zhipuai: 6,
  google: 7,
  kilo: 8,
}

function expandHome(target) {
  const value = String(target || '')
  if (value === '~') return homedir()
  if (value.startsWith('~/')) return path.join(homedir(), value.slice(2))
  return value || path.join(homedir(), '.dsh', 'clinebot-prices.json')
}

function priority(provider) {
  return PROVIDER_PRIORITY[provider] ?? 50
}

/**
 * Flatten models.dev's provider→models document into one normalized catalog.
 * Last path segments are used because ClinePass IDs are vendor-qualified.
 * @param {Record<string, any>} data
 */
export function buildPublicCatalog(data) {
  const catalog = {}
  for (const provider of Object.values(data || {})) {
    if (!provider || typeof provider !== 'object') continue
    const providerId = String(provider.id || '')
    for (const model of Object.values(provider.models || {})) {
      const cost = model?.cost
      if (!cost || typeof cost !== 'object') continue
      const input = Number(cost.input)
      const output = Number(cost.output)
      if (!Number.isFinite(input) && !Number.isFinite(output)) continue
      const key = normalizeModelKey(model.canonical_model_id || model.id || model.name)
      if (!key) continue
      const candidate = {
        input: Number.isFinite(input) ? Math.max(0, input) : 0,
        output: Number.isFinite(output) ? Math.max(0, output) : 0,
        cacheRead: Number.isFinite(Number(cost.cache_read)) ? Math.max(0, Number(cost.cache_read)) : null,
        cacheWrite: Number.isFinite(Number(cost.cache_write)) ? Math.max(0, Number(cost.cache_write)) : null,
        provider: providerId,
        modelId: String(model.id || ''),
      }
      const paid = candidate.input + candidate.output > 0
      const current = catalog[key]
      if (!current
        || (paid && !current.paid)
        || (paid === current.paid && priority(providerId) < priority(current.provider))) {
        catalog[key] = { ...candidate, paid }
      }
    }
  }
  for (const entry of Object.values(catalog)) delete entry.paid
  return catalog
}

/** Load a cached public catalog; missing/corrupt files are empty. */
export function loadPublicPriceCache(cachePath) {
  try {
    const file = expandHome(cachePath)
    if (!existsSync(file)) return {}
    const parsed = JSON.parse(readFileSync(file, 'utf8'))
    return parsed?.models && typeof parsed.models === 'object' ? parsed.models : {}
  } catch {
    return {}
  }
}

let lastMissingSignature = ''
let lastAttemptAt = 0

/**
 * Refresh the public catalog only when one of the active models is missing.
 * A repeated missing set is retried at most once per interval, so an unknown
 * custom model cannot hammer models.dev on every sync.
 */
export async function ensurePublicPricesForModels(modelIds, {
  url = DEFAULT_URL,
  cachePath = '~/.dsh/clinebot-prices.json',
  fetchImpl,
  enabled = true,
  timeoutMs = 8000,
  minIntervalMs = 6 * 60 * 60 * 1000,
  now = Date.now(),
} = {}) {
  const ids = [...new Set((Array.isArray(modelIds) ? modelIds : []).map((id) => String(id || '').trim()).filter(Boolean))]
  const missing = ids.filter((id) => !getPublicPriceCatalog()[normalizeModelKey(id)])
  if (missing.length === 0) return { synced: false, missing: [], count: 0 }
  if (enabled === false) return { synced: false, skipped: true, missing, count: 0 }
  if (!fetchImpl && process.env.CLINEBOT_DISABLE_PRICE_AUTOSYNC === '1') {
    return { synced: false, skipped: true, missing, count: 0 }
  }
  const signature = missing.slice().sort().join('|')
  if (signature === lastMissingSignature && now - lastAttemptAt < minIntervalMs) {
    return { synced: false, skipped: true, missing, count: 0 }
  }
  lastMissingSignature = signature
  lastAttemptAt = now
  const result = await syncPublicPrices({ url, cachePath, fetchImpl, timeoutMs })
  setPublicPriceCatalog(result.catalog)
  const stillMissing = ids.filter((id) => !result.catalog[normalizeModelKey(id)])
  return {
    synced: true,
    count: result.count,
    syncedAt: result.syncedAt,
    source: result.source,
    missing: stillMissing,
  }
}

/**
 * Fetch and cache the public catalog. The caller owns applying it to
 * model-prices; keeping that side effect out of this helper makes it testable.
 */
export async function syncPublicPrices({
  url = DEFAULT_URL,
  cachePath = '~/.dsh/clinebot-prices.json',
  fetchImpl = fetch,
  timeoutMs = 15000,
} = {}) {
  if (!isAllowedPriceCatalogUrl(url)) throw new Error('Price catalog URL is not allowed')
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), Math.max(1000, Number(timeoutMs) || 15000))
  let data
  try {
    const response = await fetchImpl(url, {
      signal: controller.signal,
      headers: { accept: 'application/json' },
      cache: 'no-store',
      redirect: 'manual',
    })
    if (response?.status >= 300 && response?.status < 400) throw new Error('Price catalog redirect is not allowed')
    if (!response?.ok) throw new Error(`HTTP ${response?.status || 0}`)
    data = await response.json()
  } finally {
    clearTimeout(timer)
  }
  const catalog = buildPublicCatalog(data)
  const syncedAt = new Date().toISOString()
  const file = expandHome(cachePath)
  mkdirSync(path.dirname(file), { recursive: true })
  const temp = `${file}.${Date.now()}.tmp`
  writeFileSync(temp, JSON.stringify({ version: 1, source: url, syncedAt, models: catalog }, null, 2), 'utf8')
  renameSync(temp, file)
  return { catalog, count: Object.keys(catalog).length, syncedAt, source: url }
}
