/**
 * Provider card inside DSH Settings -> Models.
 *
 * The seat is keyed by the provider's settings namespace; this component
 * returns nothing for every other provider row, so it can never leak onto a
 * sibling's card. The key is written through the credentials route, never as a
 * settings value.
 */
function ProviderCard(props) {
  const t = props?.t || makeT(en, en)
  const row = props?.provider || {}
  const providerId = typeof row === 'string' ? row : (row.provider || props?.providerId || '')
  const settingsNs = row && typeof row === 'object' ? (row.settingsNs || '') : ''
  if (providerId !== 'clinebot' && settingsNs !== NS) return null

  const [status, setStatus] = React.useState(null)
  const [keyValue, setKeyValue] = React.useState('')
  const [showKey, setShowKey] = React.useState(false)
  const [busy, setBusy] = React.useState(false)
  const [message, setMessage] = React.useState('')
  const [error, setError] = React.useState('')

  const load = React.useCallback(async () => {
    try {
      const res = await fetchWithTimeout(`${ROUTE_PREFIX}/status`, { cache: 'no-store' })
      const data = await res.json().catch(() => ({}))
      if (data && data.ok) setStatus(data)
    } catch {
      /* the card still renders its key field without status */
    }
  }, [])

  React.useEffect(() => { load() }, [load])

  const configured = Boolean(status?.key?.present)
  const envName = status?.key?.envName || 'CLINEBOT_API_KEY'
  const routeActive = Boolean(row && typeof row === 'object' && row.active) || Boolean(status?.isRegistered)

  async function handleSave() {
    const value = String(keyValue || '').trim()
    if (!value || busy) return
    setBusy(true)
    setError('')
    setMessage('')
    try {
      const res = await fetchWithTimeout(`${ROUTE_PREFIX}/save-key`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey: value, apiKeyEnv: envName }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.ok) throw new Error(data.error || `HTTP ${res.status}`)
      setKeyValue('')
      setMessage(t('providerCard.saved'))
      await load()
    } catch (err) {
      setError(String(err?.message || err))
    } finally {
      setBusy(false)
    }
  }

  return React.createElement(
    'div',
    { className: 'cb-provider-card' },
    React.createElement(
      'div',
      { className: 'cb-provider-head' },
      React.createElement('span', { className: 'cb-provider-title' }, t('providerCard.title')),
      React.createElement(
        'span',
        { className: configured ? 'cb-badge cb-badge-ok' : 'cb-badge cb-badge-warn' },
        configured ? t('providerCard.keyPresent') : t('providerCard.keyMissing')
      ),
      routeActive
        ? React.createElement('span', { className: 'cb-badge cb-badge-ok' }, t('providerCard.routeActive'))
        : null
    ),
    React.createElement('div', { className: 'cb-provider-hint' }, t('providerCard.hint')),
    React.createElement(
      'div',
      { className: 'cb-input-group' },
      React.createElement('input', {
        className: 'cb-input',
        type: showKey ? 'text' : 'password',
        autoComplete: 'new-password',
        spellCheck: false,
        placeholder: configured ? t('providerCard.replace') : t('providerCard.placeholder'),
        value: keyValue,
        disabled: busy,
        onChange: (event) => setKeyValue(event.target.value),
        onKeyDown: (event) => {
          if (event.key === 'Enter') {
            event.preventDefault()
            handleSave()
          }
        },
      }),
      React.createElement(
        'button',
        {
          type: 'button',
          className: 'cb-btn',
          disabled: busy,
          onClick: () => setShowKey((value) => !value),
        },
        showKey ? t('providerCard.hide') : t('providerCard.show')
      ),
      React.createElement(
        'button',
        {
          type: 'button',
          className: 'cb-btn cb-btn-primary',
          disabled: busy || !String(keyValue || '').trim(),
          onClick: handleSave,
        },
        busy ? t('providerCard.saving') : t('providerCard.save')
      )
    ),
    message ? React.createElement('div', { className: 'cb-alert-ok' }, message) : null,
    error ? React.createElement('div', { className: 'cb-alert-bad' }, `${t('providerCard.failed')}: ${error}`) : null,
    React.createElement('div', { className: 'cb-provider-hint' }, t('providerCard.openSettings'))
  )
}
