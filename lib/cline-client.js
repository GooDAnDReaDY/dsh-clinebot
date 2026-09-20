/**
 * ClineBot / ClinePass client helpers for DeepSeek Harness.
 *
 * Implements OpenAI-compatible chat completions interface, usage quota tracking,
 * Stale-While-Revalidate caching, smart failover, and secure credential storage.
 */

import {
  CLINE_MODELS,
  DEFAULT_MODEL_ID,
  PROVIDER_ID,
  PROVIDER_DISPLAY_NAME,
  getAllModels,
  parsePlanIncludedModels,
  formatModelDescription,
} from './models.js'

export const DEFAULT_BASE_URL = 'https://api.cline.bot/api/v1'
export const DEFAULT_API_KEY_ENV = 'CLINEBOT_API_KEY'
export const DEFAULT_TIMEOUT_MS = 15000
export const DEFAULT_SMOKE_TIMEOUT_MS = 25000
export const USAGE_CACHE_TTL_MS = 60000

export { PROVIDER_ID, PROVIDER_DISPLAY_NAME, DEFAULT_MODEL_ID }

/**
 * Resolve or fallback credential reference descriptor.
 */
export async function toCredentialRef(name) {
  try {
    const mod = await import('@deepseek-ai/dsh-credentials')
    if (typeof mod.credentialRef === 'function') {
      return mod.credentialRef(name)
    }
  } catch {
    /* fallback when executed in standalone unit tests outside DSH bundle */
  }
  return typeof name === 'object' && name !== null ? name : { type: 'env', name: String(name || '') }
}

/**
 * Normalize base URL ensuring clean format without trailing slashes.
 */
export function normalizeBaseUrl(raw) {
  let s = String(raw || '').trim().replace(/\/+$/, '')
  if (!s) return DEFAULT_BASE_URL
  s = s.replace(/\/chat\/completions$/i, '')
  if (s === 'https://api.cline.bot' || s === 'http://api.cline.bot') {
    s += '/api/v1'
  }
  return s
}

// In-memory runtime session metrics for ClinePass requests
export const sessionStats = {
  totalRequests: 0,
  successfulRequests: 0,
  failedRequests: 0,
  promptTokensEst: 0,
  completionTokensEst: 0,
  totalTokensEst: 0,
  lastLatencyMs: null,
  lastRequestAt: null,
  lastError: null,
}

export function recordSessionRequest({ latencyMs, ok, error, promptTokens = 0, completionTokens = 0 }) {
  sessionStats.totalRequests += 1
  if (ok) {
    sessionStats.successfulRequests += 1
    sessionStats.lastLatencyMs = typeof latencyMs === 'number' ? latencyMs : null
    sessionStats.lastError = null
  } else {
    sessionStats.failedRequests += 1
    sessionStats.lastError = error || 'Request failed'
  }
  sessionStats.lastRequestAt = Date.now()
  sessionStats.promptTokensEst += Number(promptTokens) || 0
  sessionStats.completionTokensEst += Number(completionTokens) || 0
  sessionStats.totalTokensEst += (Number(promptTokens) || 0) + (Number(completionTokens) || 0)
}

export function resetSessionStats() {
  sessionStats.totalRequests = 0
  sessionStats.successfulRequests = 0
  sessionStats.failedRequests = 0
  sessionStats.promptTokensEst = 0
  sessionStats.completionTokensEst = 0
  sessionStats.totalTokensEst = 0
  sessionStats.lastLatencyMs = null
  sessionStats.lastRequestAt = null
  sessionStats.lastError = null
}

/**
 * Resolve API key from environment variables.
 */
export function resolveApiKey(apiKeyEnv, env = process.env) {
  const name = String(apiKeyEnv || DEFAULT_API_KEY_ENV).trim() || DEFAULT_API_KEY_ENV
  return {
    envName: name,
    value: String(env[name] || ''),
  }
}

/**
 * Save API key directly into DSH credentials service (~/.dsh/.credentials.yaml).
 */
export async function saveCredentialKey(ctx, apiKeyEnv, apiKey) {
  const name = String(apiKeyEnv || DEFAULT_API_KEY_ENV).trim() || DEFAULT_API_KEY_ENV
  const value = String(apiKey || '').trim()

  if (!value) {
    throw new Error('API key cannot be empty')
  }

  const credentials = ctx?.credentials || ctx?.get?.('credentials')
  if (!credentials || typeof credentials.set !== 'function') {
    throw new Error('DSH credentials service is unavailable in this runtime profile')
  }

  const ref = await toCredentialRef(name)
  await credentials.set(ref, value)
  return { ok: true, envName: name }
}

function abortAfter(ms) {
  const ac = new AbortController()
  const timer = setTimeout(() => ac.abort(), Math.max(1, Number(ms) || DEFAULT_TIMEOUT_MS))
  if (typeof timer.unref === 'function') timer.unref()
  return { signal: ac.signal, cancel: () => clearTimeout(timer) }
}

// In-memory caches for quota queries and host health probes
export const usageCache = new Map()
export const probeCache = new Map()

export function clearProbeCache() {
  probeCache.clear()
}

export function clearUsageCache() {
  usageCache.clear()
}

/**
 * Resilient retry runner for transient network errors (ECONNRESET, ETIMEDOUT, 502, 503, 504, 429).
 */
export async function retryWithBackoff(fn, {
  maxRetries = 3,
  initialDelayMs = 500,
  maxDelayMs = 5000,
} = {}) {
  let attempt = 0
  let delay = initialDelayMs
  while (true) {
    try {
      const res = await fn()
      if (res && typeof res.status === 'number' && [429, 502, 503, 504].includes(res.status) && attempt < maxRetries) {
        attempt++
        const retryAfter = res.headers?.get ? Number(res.headers.get('retry-after')) * 1000 : 0
        const waitTime = retryAfter > 0 ? Math.min(retryAfter, maxDelayMs) : delay
        await new Promise((r) => setTimeout(r, waitTime))
        delay = Math.min(delay * 2, maxDelayMs)
        continue
      }
      return res
    } catch (err) {
      if (attempt < maxRetries) {
        attempt++
        await new Promise((r) => setTimeout(r, delay))
        delay = Math.min(delay * 2, maxDelayMs)
        continue
      }
      throw err
    }
  }
}

/**
 * Fetch official ClinePass rate limits and account quota.
 * Uses Stale-While-Revalidate (SWR) caching with keep-alive and network retry.
 */
export async function fetchUsageLimits(baseUrl, apiKey, {
  timeoutMs = DEFAULT_TIMEOUT_MS,
  fetchImpl = fetch,
  bypassCache = false,
  ttlMs = USAGE_CACHE_TTL_MS,
} = {}) {
  const base = normalizeBaseUrl(baseUrl)
  if (!apiKey) {
    return { ok: false, error: 'API key is missing' }
  }

  const cacheKey = `cline:usage:${apiKey.slice(-8)}`
  const now = Date.now()

  const doFetch = async () => {
    const { signal, cancel } = abortAfter(timeoutMs)
    try {
      const headers = {
        Authorization: `Bearer ${apiKey}`,
        Accept: 'application/json',
      }

      let limitsRes
      try {
        limitsRes = await fetchImpl(`${base}/users/me/plan/usage-limits`, {
          method: 'GET',
          headers,
          signal,
          keepalive: true,
        })
      } catch (netErr) {
        // Quick 1-retry fallback on transient network drop
        await new Promise((r) => setTimeout(r, 250))
        limitsRes = await fetchImpl(`${base}/users/me/plan/usage-limits`, {
          method: 'GET',
          headers,
          signal,
          keepalive: true,
        })
      }

      if (!limitsRes.ok) {
        const errText = await limitsRes.text().catch(() => '')
        const outcome = {
          ok: false,
          status: limitsRes.status,
          error: `ClinePass limits error (HTTP ${limitsRes.status}): ${errText.slice(0, 150)}`,
          checkedAt: Date.now(),
        }
        if (!usageCache.has(cacheKey)) {
          usageCache.set(cacheKey, { data: outcome, expiresAt: Date.now() + 5000, isRevalidating: false })
        }
        return outcome
      }

      const limitsData = await limitsRes.json().catch(() => ({}))
      const rawLimits = limitsData?.data?.limits || limitsData?.limits || []

      const parseWindow = (type) => {
        const found = Array.isArray(rawLimits) ? rawLimits.find((l) => l.type === type) : null
        if (!found) return null
        const percentUsed = typeof found.percentUsed === 'number'
          ? Math.max(0, Math.min(100, Math.round(found.percentUsed * 10) / 10))
          : 0
        const remainingPercent = Math.max(0, Math.round((100 - percentUsed) * 10) / 10)
        return {
          type,
          percentUsed,
          remainingPercent,
          resetsAt: found.resetsAt || null,
        }
      }

      const fiveHour = parseWindow('5-hour')
      const weekly = parseWindow('weekly')
      const monthly = parseWindow('monthly')

      let userEmail = null
      let createdAt = null
      let planDisplayName = 'ClinePass ($9.99/mo)'
      let dynamicModels = []

      try {
        const [meRes, planRes] = await Promise.all([
          fetchImpl(`${base}/users/me`, { method: 'GET', headers, signal, keepalive: true }).catch(() => null),
          fetchImpl(`${base}/users/me/plan`, { method: 'GET', headers, signal, keepalive: true }).catch(() => null),
        ])

        if (meRes?.ok) {
          const meData = await meRes.json().catch(() => ({}))
          userEmail = meData?.data?.email || meData?.email || null
          createdAt = meData?.data?.createdAt || meData?.createdAt || null
        }

        if (planRes?.ok) {
          const planData = await planRes.json().catch(() => ({}))
          const plan = planData?.data?.plan || planData?.data || planData?.plan || planData
          if (plan?.displayName || plan?.title || plan?.name) {
            planDisplayName = `${plan.displayName || plan.title || plan.name} ($${((plan.pricePerSeatCents || plan.priceInCents || 999) / 100).toFixed(2)}/mo)`
          }
          const featuresIncluded = plan?.features?.included || plan?.includedModels
          if (featuresIncluded) {
            dynamicModels = parsePlanIncludedModels(featuresIncluded)
          }
        }
      } catch {
        /* best-effort secondary details */
      }

      const result = {
        ok: true,
        plan: planDisplayName,
        user: { email: userEmail, createdAt },
        windows: { fiveHour, weekly, monthly },
        dynamicModels,
        checkedAt: Date.now(),
      }

      usageCache.set(cacheKey, { data: result, expiresAt: Date.now() + ttlMs, isRevalidating: false })
      return result
    } catch (err) {
      const outcome = {
        ok: false,
        error: String(err?.message || err),
        checkedAt: Date.now(),
      }
      if (!usageCache.has(cacheKey)) {
        usageCache.set(cacheKey, { data: outcome, expiresAt: Date.now() + 5000, isRevalidating: false })
      }
      return outcome
    } finally {
      cancel()
    }
  }

  if (!bypassCache && usageCache.has(cacheKey)) {
    const cached = usageCache.get(cacheKey)
    if (cached.expiresAt > now) {
      return cached.data
    }
    // SWR: return stale data immediately, revalidate asynchronously
    if (!cached.isRevalidating) {
      cached.isRevalidating = true
      doFetch().catch(() => {})
    }
    return cached.data
  }

  return doFetch()
}

/**
 * Health check probe with SWR caching.
 */
export async function probeHealth(baseUrl, {
  timeoutMs = DEFAULT_TIMEOUT_MS,
  fetchImpl = fetch,
  bypassCache = false,
  ttlMs = 25000,
} = {}) {
  const base = normalizeBaseUrl(baseUrl)
  const root = base.replace(/\/api\/v1$/i, '')
  const cacheKey = `cline:health:${root}`
  const now = Date.now()

  const doProbe = async () => {
    const { signal, cancel } = abortAfter(timeoutMs)
    const start = Date.now()
    try {
      const res = await retryWithBackoff(async () => {
        return await fetchImpl(root, { method: 'HEAD', signal, keepalive: true })
      })
      const latencyMs = Date.now() - start
      const reachable = res.status > 0 && res.status < 500
      const outcome = {
        ok: reachable,
        status: res.status,
        latencyMs,
        error: reachable ? null : `HTTP status ${res.status}`,
        checkedAt: Date.now(),
      }
      probeCache.set(cacheKey, { data: outcome, expiresAt: Date.now() + ttlMs, isRevalidating: false })
      return outcome
    } catch (err) {
      const latencyMs = Date.now() - start
      const outcome = {
        ok: false,
        latencyMs,
        error: String(err?.message || err),
        checkedAt: Date.now(),
      }
      probeCache.set(cacheKey, { data: outcome, expiresAt: Date.now() + 5000, isRevalidating: false })
      return outcome
    } finally {
      cancel()
    }
  }

  if (!bypassCache && probeCache.has(cacheKey)) {
    const cached = probeCache.get(cacheKey)
    if (cached.expiresAt > now) {
      return cached.data
    }
    if (!cached.isRevalidating) {
      cached.isRevalidating = true
      doProbe().catch(() => {})
    }
    return cached.data
  }

  return doProbe()
}

/**
 * Non-streaming lightweight chat completion to verify credentials and endpoint latency.
 */
export async function smokeChat(baseUrl, apiKey, {
  model = DEFAULT_MODEL_ID,
  timeoutMs = DEFAULT_SMOKE_TIMEOUT_MS,
  fetchImpl = fetch,
} = {}) {
  const base = normalizeBaseUrl(baseUrl)
  if (!apiKey) {
    return { ok: false, error: 'Missing API key. Set credential or environment variable.' }
  }

  const { signal, cancel } = abortAfter(timeoutMs)
  const start = Date.now()
  try {
    const res = await fetchImpl(`${base}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: model || DEFAULT_MODEL_ID,
        messages: [{ role: 'user', content: 'Say pong' }],
        max_tokens: 150,
        stream: false,
      }),
      signal,
      keepalive: true,
    })

    const latencyMs = Date.now() - start
    const data = await res.json().catch(() => ({}))

    if (!res.ok) {
      const errorMsg = data?.error?.message || (typeof data?.error === 'string' ? data.error : null) || data?.message || `HTTP ${res.status}`
      return {
        ok: false,
        status: res.status,
        latencyMs,
        error: errorMsg,
      }
    }

    const payload = data?.data && typeof data.data === 'object' ? data.data : data
    const content = payload?.choices?.[0]?.message?.content || payload?.choices?.[0]?.message?.reasoning
    const promptTokens = Number(data?.usage?.prompt_tokens) || Number(payload?.usage?.prompt_tokens) || 0
    const completionTokens = Number(data?.usage?.completion_tokens) || Number(payload?.usage?.completion_tokens) || 0
    const totalTokens = Number(data?.usage?.total_tokens) || Number(payload?.usage?.total_tokens) || (promptTokens + completionTokens)
    return {
      ok: true,
      status: res.status,
      latencyMs,
      model: payload?.model || model,
      preview: typeof content === 'string' ? content.trim().slice(0, 150) : 'OK',
      promptTokens,
      completionTokens,
      totalTokens,
    }
  } catch (err) {
    const latencyMs = Date.now() - start
    return {
      ok: false,
      latencyMs,
      error: String(err?.message || err),
    }
  } finally {
    cancel()
  }
}

/**
 * Shape for llm-pi-ai.providers.clinebot (openai-completions).
 */
export function buildPiAiProvider({
  baseUrl = DEFAULT_BASE_URL,
  apiKeyEnv = DEFAULT_API_KEY_ENV,
  models = [],
  customModels = [],
  displayName = PROVIDER_DISPLAY_NAME,
} = {}) {
  const allAvailable = getAllModels(customModels)
  const modelList = (Array.isArray(models) && models.length ? models : allAvailable).map((m) => {
    let item
    if (typeof m === 'string') {
      item = allAvailable.find((x) => x.id === m) || { id: m, name: m }
    } else {
      item = m
    }
    const hasImage = item.input?.includes('image') || item.input?.includes('vision')
    const res = {
      id: item.id,
      name: item.name || item.id,
      description: formatModelDescription(item),
      contextWindow: Number(item.contextLength || item.contextWindow) || 200000,
      maxTokens: Number(item.maxTokens) || 8192,
      input: hasImage ? ['text', 'image'] : ['text'],
      provider: PROVIDER_ID,
    }
    const validEfforts = ['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max']
    if (Array.isArray(item.reasoningEfforts) && item.reasoningEfforts.length) {
      const efforts = {}
      for (const effort of item.reasoningEfforts) {
        const key = String(effort).trim().toLowerCase()
        if (validEfforts.includes(key)) {
          efforts[key] = key
        }
      }
      res.reasoningEfforts = Object.keys(efforts).length ? efforts : false
    } else if (item.reasoningEfforts && typeof item.reasoningEfforts === 'object' && !Array.isArray(item.reasoningEfforts)) {
      const efforts = {}
      for (const [k, v] of Object.entries(item.reasoningEfforts)) {
        const key = String(k).trim().toLowerCase()
        if (validEfforts.includes(key)) {
          efforts[key] = typeof v === 'string' && v.trim() ? v.trim() : key
        }
      }
      res.reasoningEfforts = Object.keys(efforts).length ? efforts : false
    } else {
      res.reasoningEfforts = false
    }
    return res
  })

  return {
    displayName,
    api: 'openai-completions',
    baseURL: normalizeBaseUrl(baseUrl),
    apiKeyEnv: apiKeyEnv || DEFAULT_API_KEY_ENV,
    models: modelList,
  }
}

/**
 * Safely resolve key value from DSH credentials service or process.env.
 */
export async function resolveKeyValue(ctx, apiKeyEnv) {
  const refName = String(apiKeyEnv || DEFAULT_API_KEY_ENV).trim() || DEFAULT_API_KEY_ENV
  const creds = (ctx?.get && ctx.get('credentials')) || ctx?.credentials
  if (creds && typeof creds.resolve === 'function') {
    try {
      const ref = await toCredentialRef(refName)
      const hit = await creds.resolve(ref)
      if (hit?.value) {
        return { envName: refName, value: hit.value, source: 'credentials' }
      }
    } catch {
      /* miss */
    }
  }

  const fromEnv = resolveApiKey(refName)
  if (fromEnv.value) {
    return { ...fromEnv, source: 'env' }
  }

  return { envName: refName, value: '', source: 'none' }
}


export { resolveAccountPool, isAccountQuotaExhausted, rotateToNextAccount } from './account-pool.js'
