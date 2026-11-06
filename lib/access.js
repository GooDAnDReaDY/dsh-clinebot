import { isTrustedSettingsRequest, getConnection, writeJson } from './http.js'

export { isTrustedSettingsRequest }

export function assertTrustedSettingsRequest(req, res, ctx = null) {
  const conn = getConnection(ctx) || req?.connectionService
  let hostAuthAccepted = false
  if (conn && typeof conn.requestRejection === 'function') {
    let rejection
    try {
      rejection = conn.requestRejection(req)
    } catch {
      rejection = 403
    }
    if (rejection !== undefined) {
      writeJson(res, rejection, {
        ok: false,
        error: rejection === 401 ? 'Authentication required' : 'Forbidden',
      })
      return false
    }
    hostAuthAccepted = true
  }

  if (!isTrustedSettingsRequest(req, ctx, { skipConnectionAuth: hostAuthAccepted })) {
    writeJson(res, 403, { ok: false, error: 'Forbidden' })
    return false
  }

  // A loopback-only caller is not enough for state changes unless the host
  // authentication service explicitly admitted the request. DSH Desktop
  // authenticates with its session cookie and strips Origin/Referer while
  // forwarding to the local host; requiring those headers breaks Desktop.
  const method = String(req?.method || 'GET').toUpperCase()
  if (!hostAuthAccepted && method !== 'GET' && method !== 'HEAD' && method !== 'OPTIONS') {
    const origin = req?.headers?.origin || req?.headers?.referer
    if (typeof origin !== 'string' || origin.length === 0) {
      writeJson(res, 403, { ok: false, error: 'Forbidden' })
      return false
    }
  }
  return true
}
