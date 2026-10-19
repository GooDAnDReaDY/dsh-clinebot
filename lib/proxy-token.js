/**
 * Local Proxy Authentication Token (Issues #145, #247)
 *
 * Secures transparent proxy endpoints (/dsh-clinebot/v1/*) from unauthorized
 * LAN clients or cross-site browser requests (CSRF).
 * Token is stored strictly in-memory and isolated from process.env and child processes (#247).
 */

import crypto from 'node:crypto'
import { createRequire } from 'node:module'
import { writeJson, isLoopbackAddress, getConnection } from './http.js'
import { resolveAccountPool } from './account-pool.js'

export const LOCAL_PROXY_KEY_ENV = 'CLINEBOT_LOCAL_PROXY_TOKEN'

let cachedToken = null

// At module startup, scrub any token from process.env if present (#247)
if (process.env[LOCAL_PROXY_KEY_ENV]) {
  cachedToken = process.env[LOCAL_PROXY_KEY_ENV]
  delete process.env[LOCAL_PROXY_KEY_ENV]
}

const require = createRequire(import.meta.url)
let packageVersion = '0.5.33'
try {
  packageVersion = require('../package.json').version || '0.5.33'
} catch (err) {
  /* fallback to default version if manifest is unreadable */
}

export const USER_AGENT = `@goodandready/dsh-clinebot/${packageVersion}`

/**
 * Get or generate the local proxy bearer token.
 * Token is stored strictly in module-private memory and never exported to process.env (#247).
 *
 * @returns {string}
 */
export function getLocalProxyToken() {
  if (cachedToken) return cachedToken
  if (process.env[LOCAL_PROXY_KEY_ENV]) {
    cachedToken = process.env[LOCAL_PROXY_KEY_ENV]
    delete process.env[LOCAL_PROXY_KEY_ENV]
    return cachedToken
  }
  cachedToken = crypto.randomBytes(24).toString('hex')
  return cachedToken
}

/**
 * Manually set local proxy token (for testing).
 * Never leaks token to process.env (#247).
 *
 * @param {string|null} token
 */
export function setLocalProxyToken(token) {
  cachedToken = token
  delete process.env[LOCAL_PROXY_KEY_ENV]
}

/**
 * Reject cross-site and browser requests to proxy endpoints.
 */
export function hasDisallowedBrowserOrigin(req) {
  const secFetchSite = req.headers?.['sec-fetch-site']
  return secFetchSite === 'cross-site' || secFetchSite === 'same-site' || Boolean(req.headers?.['origin'])
}

/**
 * Verify whether incoming HTTP request is authorized to access proxy endpoints.
 */
export function isAuthorizedProxyRequest(req, accountPool = []) {
  const auth = req.headers?.['authorization'] || ''
  const match = auth.match(/^Bearer\s+(.+)$/i)
  if (!match) return false
  const token = match[1].trim()
  if (!token) return false
  const localToken = getLocalProxyToken()
  if (localToken && token === localToken) return true
  return Array.isArray(accountPool) && accountPool.some((acc) => acc.value && acc.value === token)
}

/**
 * Unified gate for proxy endpoints (/v1/chat/completions, /v1/models) (#247).
 * Verifies loopback address, browser origin, DSH connection rejection, and bearer token.
 */
export async function assertAuthorizedProxyRequest(ctx, req, res, live) {
  if (!isLoopbackAddress(req.socket?.remoteAddress)) {
    writeJson(res, 403, { ok: false, error: 'Loopback access only' })
    return { ok: false }
  }

  if (hasDisallowedBrowserOrigin(req)) {
    writeJson(res, 403, { ok: false, error: 'Cross-site or browser requests to proxy are forbidden' })
    return { ok: false }
  }

  const conn = getConnection(ctx) || req?.connectionService
  if (conn && typeof conn.requestRejection === 'function') {
    let rejection
    try {
      rejection = conn.requestRejection(req)
    } catch {
      rejection = 403
    }
    if (rejection !== undefined) {
      const status = typeof rejection === 'number' ? rejection : 403
      writeJson(res, status, {
        ok: false,
        error: status === 401 ? 'Authentication required' : 'Forbidden',
      })
      return { ok: false }
    }
  }

  const pool = await resolveAccountPool(ctx, typeof live === 'function' ? live() : live)
  if (!isAuthorizedProxyRequest(req, pool)) {
    writeJson(res, 401, { ok: false, error: 'Unauthorized: missing or invalid bearer token' })
    return { ok: false }
  }

  return { ok: true, pool }
}

/**
 * Write appropriate terminal JSON error response when retries are exhausted.
 */
export function sendProxyTerminalError(res, { hadTimeout, is429Exhausted, lastError, lastRetryAfter }) {
  if (hadTimeout) {
    const code = lastError?.code || (String(lastError?.message).toLowerCase().includes('body read') ? 'body_read_timeout' : 'upstream_timeout')
    return writeJson(res, 504, {
      error: {
        message: 'Gateway Timeout: upstream provider timed out across all available accounts',
        type: 'gateway_timeout',
        code,
        details: lastError?.message || null,
      },
    })
  }

  if (is429Exhausted) {
    if (lastRetryAfter) {
      res.setHeader('Retry-After', lastRetryAfter)
    }
    return writeJson(res, 429, {
      error: {
        message: 'All configured accounts in pool exceeded rate limits or quota',
        type: 'rate_limit_exceeded',
        code: 'rate_limit_exceeded',
        details: lastError?.message || null,
      },
    })
  }

  const status = typeof lastError?.status === 'number' && lastError.status >= 500 && lastError.status <= 599
    ? lastError.status
    : 502
  const code = lastError?.code || 'upstream_unavailable'
  return writeJson(res, status, {
    error: {
      message: `Bad Gateway: upstream network error or unavailable: ${lastError?.message || 'unknown error'}`,
      type: 'bad_gateway',
      code,
      details: lastError?.message || null,
    },
  })
}

/**
 * Safely extract standard and reasoning token counts from usage object.
 */
export function extractUsageMetrics(usage) {
  if (!usage || typeof usage !== 'object') {
    return { promptTokens: 0, completionTokens: 0, reasoningTokens: 0, totalTokens: 0 }
  }
  const promptTokens = Number(usage.prompt_tokens) || 0
  const completionTokens = Number(usage.completion_tokens) || 0
  const reasoningTokens = Number(
    usage.completion_tokens_details?.reasoning_tokens ||
    usage.reasoning_tokens ||
    usage.prompt_tokens_details?.reasoning_tokens ||
    0
  )
  const totalTokens = Number(usage.total_tokens) || (promptTokens + completionTokens)
  return { promptTokens, completionTokens, reasoningTokens, totalTokens }
}