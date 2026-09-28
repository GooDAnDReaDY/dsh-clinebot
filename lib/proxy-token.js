/**
 * Local Proxy Authentication Token (Issue #145)
 *
 * Secures transparent proxy endpoints (/dsh-clinebot/v1/*) from unauthorized
 * LAN clients or cross-site browser requests (CSRF).
 */

import crypto from 'node:crypto'

export const LOCAL_PROXY_KEY_ENV = 'CLINEBOT_LOCAL_PROXY_TOKEN'

let cachedToken = null

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
