/**
 * ClineBot / ClinePass client helpers for DeepSeek Harness.
 *
 * Implements OpenAI-compatible chat completions interface targeted at
 * https://api.cline.bot/api/v1 (or custom reverse proxies / mocks).
 */

import { CLINE_MODELS, DEFAULT_MODEL_ID, PROVIDER_ID, PROVIDER_DISPLAY_NAME } from './models.js'

export const DEFAULT_BASE_URL = 'https://api.cline.bot/api/v1'
export const DEFAULT_API_KEY_ENV = 'CLINEBOT_API_KEY'
export const DEFAULT_TIMEOUT_MS = 15000
export const DEFAULT_SMOKE_TIMEOUT_MS = 25000

export { PROVIDER_ID, PROVIDER_DISPLAY_NAME, DEFAULT_MODEL_ID }

/**
 * Normalize base URL ensuring clean format without trailing slashes.
 * Keeps https://api.cline.bot/api/v1 intact.
 */
export function normalizeBaseUrl(raw) {
  let s = String(raw || '').trim().replace(/\/+$/, '')
  if (!s) return DEFAULT_BASE_URL
  // Strip trailing /chat/completions if entered by user
  s = s.replace(/\/chat\/completions$/i, '')
  // If user entered just origin without /api/v1 for official host, append it
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

function abortAfter(ms) {
  const ac = new AbortController()
  const timer = setTimeout(() => ac.abort(), Math.max(1, Number(ms) || DEFAULT_TIMEOUT_MS))
  if (typeof timer.unref === 'function') timer.unref()
  return { signal: ac.signal, cancel: () => clearTimeout(timer) }
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
      // Some endpoints disallow GET on root; try HEAD
      return await fetchImpl(root, { method: 'HEAD', signal })
    })
    const latencyMs = Date.now() - start
    // 200, 401, 403, 404, 405 all show the HTTP server responded
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
  displayName = PROVIDER_DISPLAY_NAME,
} = {}) {
  const modelList = (Array.isArray(models) && models.length ? models : CLINE_MODELS).map((m) => {
    if (typeof m === 'string') {
      const found = CLINE_MODELS.find((item) => item.id === m)
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
