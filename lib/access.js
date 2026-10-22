import { isTrustedSettingsRequest, getConnection, writeJson } from './http.js'

export { isTrustedSettingsRequest }

export function assertTrustedSettingsRequest(req, res, ctx = null) {
  const conn = getConnection(ctx) || req?.connectionService
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
  }

  if (!isTrustedSettingsRequest(req, ctx)) {
    writeJson(res, 403, { ok: false, error: 'Forbidden' })
    return false
  }

  // A loopback-only caller is not enough for state changes: dsh-lanmode can
  // proxy LAN/Tailscale clients into the host over loopback. Browsers attach
  // Origin/Referer; non-browser writes without one are rejected fail-closed.
  const method = String(req?.method || 'GET').toUpperCase()
  if (method !== 'GET' && method !== 'HEAD' && method !== 'OPTIONS') {
    const origin = req?.headers?.origin || req?.headers?.referer
    if (typeof origin !== 'string' || origin.length === 0) {
      writeJson(res, 403, { ok: false, error: 'Forbidden' })
      return false
    }
  }
  return true
}
