import { isTrustedSettingsRequest, writeJson } from './http.js'

export { isTrustedSettingsRequest }

export function assertTrustedSettingsRequest(req, res) {
  if (!isTrustedSettingsRequest(req)) {
    writeJson(res, 403, { ok: false, error: 'Forbidden' })
    return false
  }
  return true
}
