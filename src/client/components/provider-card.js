/**
 * Provider card inside DSH Settings -> Models.
 *
 * The host owns the row chrome: provider name, status dot and the Edit action.
 * Accounts, the API key, models and quotas live on the full Settings -> ClineBot
 * page, so this slot intentionally renders nothing instead of duplicating that
 * form inside the Models page.
 */
function ProviderCard(props) {
  const row = props?.provider || {}
  const providerId = typeof row === 'string' ? row : (row.provider || props?.providerId || '')
  const settingsNs = row && typeof row === 'object' ? (row.settingsNs || '') : ''
  if (providerId !== 'clinebot' && settingsNs !== NS) return null
  return null
}
