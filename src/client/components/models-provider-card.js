function ModelsProviderCard(props) {
  const ctx = props?.ctx
  const t = props?.t || makeT(en, en)
  const [status, setStatus] = React.useState(null)
  const [apiKey, setApiKey] = React.useState('')
  const [showKey, setShowKey] = React.useState(false)
  const [saving, setSaving] = React.useState(false)
  const [msg, setMsg] = React.useState('')
  const [err, setErr] = React.useState('')

  const loadStatus = React.useCallback(async () => {
    try {
      const res = await fetchWithTimeout(`${ROUTE_PREFIX}/status`, { cache: 'no-store' })
      if (!res.ok) return
      const json = await res.json().catch(() => null)
      if (json && json.ok) setStatus(json)
    } catch {
      // quiet on network fail
    }
  }, [])

  React.useEffect(() => {
    loadStatus()
  }, [loadStatus])

  const keyConfigured = Boolean(status?.keyPresent || status?.config?.hasKey)
  const modelsCount = status?.config?.enabledModels?.length || status?.availableModels?.length || 0

  const handleSaveKey = async () => {
    const keyVal = String(apiKey || '').trim()
    if (!keyVal) {
      setErr(t('key.empty_err'))
      return
    }
    setSaving(true)
    setErr('')
    setMsg('')
    try {
      const res = await fetchWithTimeout(`${ROUTE_PREFIX}/save-key`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey: keyVal, apiKeyEnv: status?.config?.apiKeyEnv }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.ok) throw new Error(data.error || `HTTP ${res.status}`)
      setApiKey('')
      setMsg(t('card.key_saved'))
      await loadStatus()
    } catch (e) {
      setErr(String(e?.message || e))
    } finally {
      setSaving(false)
    }
  }

  const handleOpenSettings = () => {
    const layout = ctx?.get?.('layout')
    if (typeof layout?.selectPanel === 'function') {
      layout.selectPanel('clinebot-dashboard')
    } else if (typeof props?.openSettings === 'function') {
      props.openSettings()
    }
  }

  return React.createElement(
    'div',
    { className: 'cb-providerCard', 'data-clinebot-provider-card': 'true' },
    // Header
    React.createElement(
      'div',
      { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' } },
      React.createElement(
        'div',
        { style: { display: 'flex', alignItems: 'center', gap: '8px' } },
        React.createElement('span', { style: { fontSize: '14px', lineHeight: '20px', fontWeight: 500, color: 'var(--dsw-alias-label-primary)' } }, t('card.title'))
      ),
      React.createElement(
        'div',
        { style: { display: 'flex', alignItems: 'center', gap: '6px' } },
        React.createElement(
          'span',
          { className: keyConfigured ? 'cb-badge cb-badge-ok' : 'cb-badge cb-badge-warn' },
          keyConfigured ? t('card.status_connected') : t('card.status_no_key')
        ),
        modelsCount > 0
          ? React.createElement(
              'span',
              { className: 'cb-badge cb-badge-ok' },
              t('card.models_active', { count: modelsCount })
            )
          : null
      )
    ),

    // Quick Key Input Form
    React.createElement(
      'div',
      { style: { display: 'flex', flexDirection: 'column', gap: '8px' } },
      React.createElement(
        'div',
        { className: 'cb-input-group' },
        React.createElement('input', {
          type: showKey ? 'text' : 'password',
          className: 'cb-input',
          style: { flex: 1 },
          value: apiKey,
          placeholder: keyConfigured ? t('key.placeholder_has') : t('key.placeholder_empty'),
          onChange: (e) => setApiKey(e.target.value),
          onKeyDown: (e) => { if (e.key === 'Enter') handleSaveKey() },
        }),
        React.createElement(
          'button',
          {
            type: 'button',
            className: 'cb-btn',
            onClick: () => setShowKey(!showKey),
          },
          showKey ? t('key.hide') : t('key.show')
        ),
        React.createElement(
          'button',
          {
            type: 'button',
            className: 'cb-btn cb-btn-primary',
            disabled: saving || !apiKey.trim(),
            onClick: handleSaveKey,
          },
          saving ? t('key.saving') : t('card.save_key')
        )
      ),
      msg ? React.createElement('div', { className: 'cb-alert-ok' }, msg) : null,
      err ? React.createElement('div', { className: 'cb-alert-bad' }, err) : null
    ),

    // Footer with navigation to full settings
    React.createElement(
      'div',
      { style: { display: 'flex', justifyContent: 'flex-end', alignItems: 'center', borderTop: '1px solid var(--dsw-alias-border-l2)', paddingTop: '10px' } },
      React.createElement(
        'button',
        {
          type: 'button',
          className: 'cb-btn',
          onClick: handleOpenSettings,
        },
        t('card.open_settings')
      )
    )
  )
}
