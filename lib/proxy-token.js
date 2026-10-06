/**
 * Local Proxy Authentication Token (Issue #145)
 *
 * Secures transparent proxy endpoints (/dsh-clinebot/v1/*) from unauthorized
 * LAN clients or cross-site browser requests (CSRF).
 */

import crypto from 'node:crypto'
import { createRequire } from 'node:module'
import { writeJson } from './http.js'

export const LOCAL_PROXY_KEY_ENV = 'CLINEBOT_LOCAL_PROXY_TOKEN'

let cachedToken = null

const require = createRequire(import.meta.url)
let packageVersion = '0.5.19'
try {
  packageVersion = require('../package.json').version || '0.5.19'
} catch (err) {
  /* fallback to default version if manifest is unreadable */
}

export const USER_AGENT = `@goodandready/dsh-clinebot/${packageVersion}`

/**
 * Get or generate the local proxy bearer token.
 *
 * @returns {string}
 */
export function getLocalProxyToken() {
  if (cachedToken) return cachedToken
  if (process.env[LOCAL_PROXY_KEY_ENV]) {
    cachedToken = process.env[LOCAL_PROXY_KEY_ENV]
    return cachedToken
  }
  cachedToken = crypto.randomBytes(24).toString('hex')
  process.env[LOCAL_PROXY_KEY_ENV] = cachedToken
  return cachedToken
}

/**
 * Manually set local proxy token (for testing).
 *
 * @param {string|null} token
 */
export function setLocalProxyToken(token) {
  cachedToken = token
  if (token) {
    process.env[LOCAL_PROXY_KEY_ENV] = token
  } else {
    delete process.env[LOCAL_PROXY_KEY_ENV]
  }
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
