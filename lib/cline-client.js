/**
 * ClineBot / ClinePass client helpers for DeepSeek Harness.
 *
 * Implements OpenAI-compatible chat completions interface, usage quota tracking,
 * and secure credential storage via DSH credentials service.
 */

import {
  CLINE_MODELS,
  DEFAULT_MODEL_ID,
  PROVIDER_ID,
  PROVIDER_DISPLAY_NAME,
  getAllModels,
} from './models.js'

export const DEFAULT_BASE_URL = 'https://api.cline.bot/api/v1'
export const DEFAULT_API_KEY_ENV = 'CLINEBOT_API_KEY'
export const DEFAULT_TIMEOUT_MS = 15000
export const DEFAULT_SMOKE_TIMEOUT_MS = 25000

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

// In-memory cache for quota queries to avoid hammering the ClinePass endpoint
const usageCache = new Map()
export function clearUsageCache() {
  usageCache.clear()
}

/**
 * Fetch official ClinePass rate limits and account quota.
 * Endpoints:
 * - GET /users/me/plan/usage-limits (5-hour, weekly, monthly rolling limits)
 * - GET /users/me (account metadata)
 */
export async function fetchUsageLimits(baseUrl, apiKey, {
  timeoutMs = DEFAULT_TIMEOUT_MS,
  fetchImpl = fetch,
  bypassCache = false,
} = {}) {
  const base = normalizeBaseUrl(baseUrl)
  if (!apiKey) {
    return { ok: false, error: 'API key is missing' }
  }

  const cacheKey = `cline:usage:${apiKey.slice(-8)}`
  const now = Date.now()

  if (!bypassCache && usageCache.has(cacheKey)) {
    const cached = usageCache.get(cacheKey)
    if (cached.expiresAt > now) {
      return cached.data
    }
  }

  const { signal, cancel } = abortAfter(timeoutMs)
  try {
    const headers = {
      Authorization: `Bearer ${apiKey}`,
      Accept: 'application/json',
    }

    // 1. Fetch usage limits
    const limitsRes = await fetchImpl(`${base}/users/me/plan/usage-limits`, {
      method: 'GET',
      headers,
      signal,
    })

    if (!limitsRes.ok) {
      const errText = await limitsRes.text().catch(() => '')
      return {
        ok: false,
        status: limitsRes.status,
        error: `ClinePass limits error (HTTP ${limitsRes.status}): ${errText.slice(0, 150)}`,
      }
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

    // 2. Fetch user metadata (optional, best-effort)
    let userEmail = null
    let createdAt = null
    try {
      const meRes = await fetchImpl(`${base}/users/me`, { method: 'GET', headers, signal })
      if (meRes.ok) {
        const meData = await meRes.json().catch(() => ({}))
        const me = meData?.data || meData?.user || meData
        userEmail = me?.email || null
        createdAt = me?.createdAt || null
      }
    } catch {
      /* ignore user metadata failure */
    }

    const result = {
      ok: true,
      plan: 'ClinePass ($9.99/mo)',
      user: {
        email: userEmail,
        createdAt,
      },
      windows: {
        fiveHour: fiveHour || { type: '5-hour', percentUsed: 0, remainingPercent: 100, resetsAt: null },
        weekly: weekly || { type: 'weekly', percentUsed: 0, remainingPercent: 100, resetsAt: null },
        monthly: monthly || { type: 'monthly', percentUsed: 0, remainingPercent: 100, resetsAt: null },
      },
      checkedAt: now,
    }

    // Cache for 60 seconds
    usageCache.set(cacheKey, { expiresAt: now + 60000, data: result })
    return result
  } catch (err) {
    return {
      ok: false,
      error: String(err?.message || err),
    }
  } finally {
    cancel()
  }
}

/**
 * Quick network probe to verify server availability.
 */
export async function probeHealth(baseUrl, { timeoutMs = DEFAULT_TIMEOUT_MS, fetchImpl = fetch } = {}) {
  const root = normalizeBaseUrl(baseUrl)
  const { signal, cancel } = abortAfter(timeoutMs)
  const start = Date.now()
  try {
    const res = await fetchImpl(root, { method: 'GET', signal }).catch(async () => {
      return await fetchImpl(root, { method: 'HEAD', signal })
    })
    const latencyMs = Date.now() - start
    const reachable = res.status > 0 && res.status < 500
    return {
      ok: reachable,
      status: res.status,
      latencyMs,
      error: reachable ? null : `HTTP status ${res.status}`,
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
        messages: [{ role: 'user', content: 'ping' }],
        max_tokens: 8,
        stream: false,
      }),
      signal,
    })

    const latencyMs = Date.now() - start
    const data = await res.json().catch(() => ({}))

    if (!res.ok) {
      const errorMsg = data?.error?.message || data?.message || `HTTP ${res.status}`
      return {
        ok: false,
        status: res.status,
        latencyMs,
        error: errorMsg,
      }
    }

    const content = data?.choices?.[0]?.message?.content
    return {
      ok: true,
      status: res.status,
      latencyMs,
      model: data?.model || model,
      preview: typeof content === 'string' ? content.trim().slice(0, 150) : '',
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
    if (typeof m === 'string') {
      const found = allAvailable.find((item) => item.id === m)
      return {
        id: m,
        name: found?.name || m,
        input: found?.input || ['text'],
        provider: PROVIDER_ID,
      }
    }
    return {
      id: m.id,
      name: m.name || m.id,
      input: m.input || ['text'],
      provider: PROVIDER_ID,
    }
  })

  return {
    displayName,
    api: 'openai-completions',
    baseURL: normalizeBaseUrl(baseUrl),
    apiKeyEnv: apiKeyEnv || DEFAULT_API_KEY_ENV,
    headers: {},
    models: modelList,
    modelOverrides: {},
    defaultInput: ['text'],
  }
}
