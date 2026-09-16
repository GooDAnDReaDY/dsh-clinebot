import { isTrustedSettingsRequest } from './http.js'

export { isTrustedSettingsRequest }

export function assertTrustedSettingsRequest(req, res) {
  if (!isTrustedSettingsRequest(req)) {
    return false
  }
  return true
}
