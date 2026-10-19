function AccountsSection({
  status,
  busy,
  handlePinAccount,
  handleAddAccount,
  handleDeleteAccount,
  accountMode,
  handleUpdateAccountMode,
  modelRoutes = {},
  onUpdateModelRoutes,
  t,
}) {
  if (!status.accounts || !status.accounts.length) return null

  const [showAdd, setShowAdd] = React.useState(false)
  const [newLabel, setNewLabel] = React.useState('')
  const [newEnv, setNewEnv] = React.useState('')
  const [newKey, setNewKey] = React.useState('')
  const [showKey, setShowKey] = React.useState(false)
  const [deleteSecret, setDeleteSecret] = React.useState(true)
  const [routeModel, setRouteModel] = React.useState('')
  const [routeAccount, setRouteAccount] = React.useState('')
  const [discoveredKeys, setDiscoveredKeys] = React.useState([])

  React.useEffect(() => {
    let active = true
    fetchWithTimeout(`${ROUTE_PREFIX}/keys/discovered`, { cache: 'no-store' })
      .then((r) => r.json())
      .then((data) => {
        if (active && data?.ok && Array.isArray(data.discovered)) {
          setDiscoveredKeys(data.discovered)
        }
      })
      .catch(() => {})
    return () => { active = false }
  }, [])

  async function handleImportDiscovered(item) {
    let max = 1
    for (const a of (status.accounts || [])) {
      const m = String(a.apiKeyEnv || '').match(/^CLINEBOT_API_KEY_(\d+)$/)
      if (m) {
        const n = parseInt(m[1], 10)
        if (n >= max) max = n + 1
      }
    }
    const targetEnv = `CLINEBOT_API_KEY_${max}`
    if (typeof handleAddAccount === 'function') {
      await handleAddAccount({
        label: item.source || targetEnv,
        apiKeyEnv: targetEnv,
        id: item.id,
      })
      setDiscoveredKeys((prev) => prev.filter((k) => k.id !== item.id))
    }
  }

  function handleOpenAdd() {
    let max = 1
    for (const a of (status.accounts || [])) {
      const m = String(a.apiKeyEnv || '').match(/^CLINEBOT_API_KEY_(\d+)$/)
      if (m) {
        const n = parseInt(m[1], 10)
        if (n >= max) max = n + 1
      }
    }
    setNewEnv(`CLINEBOT_API_KEY_${max}`)
    setShowAdd(true)
  }

  async function onSubmitAdd(e) {
    if (e && e.preventDefault) e.preventDefault()
    if (!newKey.trim()) return
    if (typeof handleAddAccount === 'function') {
      await handleAddAccount({
        label: newLabel.trim() || newEnv.trim(),
        apiKeyEnv: newEnv.trim(),
        apiKey: newKey.trim(),
      })
    }
    setNewLabel('')
    setNewEnv('')
    setNewKey('')
    setShowAdd(false)
  }

  async function onDeleteAccount(envName) {
    if (typeof window !== 'undefined' && typeof window.confirm === 'function') {
      if (!window.confirm(t('accounts.delete_confirm', { label: envName }))) return
    }
    if (typeof handleDeleteAccount === 'function') {
      await handleDeleteAccount(envName, deleteSecret)
    }
  }

  return React.createElement(
    'div',
    { className: 'cb-section-card' },
    React.createElement(
      'div',
      { className: 'cb-section-title', style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' } },
      React.createElement('span', null, t('accounts.title')),
      !showAdd
        ? React.createElement(
            'button',
            {
              type: 'button',
              className: 'cb-btn',
              style: { fontSize: '11px', padding: '4px 10px' },
              onClick: handleOpenAdd,
              disabled: !!busy,
            },
            t('accounts.add_btn')
          )
        : null
    ),
    React.createElement('div', { className: 'cb-section-desc' }, t('accounts.desc')),
    discoveredKeys.length > 0
      ? React.createElement(
          'div',
          { className: 'cb-alert-ok', style: { display: 'flex', flexDirection: 'column', gap: '6px', margin: '6px 0' } },
          React.createElement('div', { style: { fontWeight: 600 } }, `🔍 ${t('discovery.title')}`),
          discoveredKeys.map((item, idx) =>
            React.createElement(
              'div',
              { key: idx, style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' } },
              React.createElement('span', null, `${item.maskedKey} (${item.source})`),
              React.createElement(
                'button',
                {
                  type: 'button',
                  className: 'cb-btn',
                  style: { fontSize: '11px', padding: '2px 8px' },
                  disabled: !!busy,
                  onClick: () => handleImportDiscovered(item),
                },
                t('discovery.import_btn', { source: item.source })
              )
            )
          )
        )
      : null,
    React.createElement(
      'div',
      {
        style: {
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          margin: '8px 0 12px 0',
          fontSize: '12px',
          color: 'var(--dsw-alias-label-secondary)',
        },
      },
      React.createElement('span', { style: { fontWeight: 500 } }, t('accounts.mode_label') + ':'),
      React.createElement(
        'div',
        {
          style: {
            display: 'inline-flex',
            borderRadius: '6px',
            border: '1px solid var(--dsw-alias-border-l2, color-mix(in srgb, currentColor 12%, transparent))',
            overflow: 'hidden',
          },
        },
        React.createElement(
          'button',
          {
            type: 'button',
            className: 'cb-btn',
            style: {
              borderRadius: 0,
              fontSize: '11px',
              padding: '3px 9px',
              border: 'none',
              background: (accountMode || 'least_used') === 'least_used'
                ? 'var(--dsw-alias-interactive-bg-active, color-mix(in srgb, currentColor 14%, transparent))'
                : 'transparent',
              fontWeight: (accountMode || 'least_used') === 'least_used' ? 600 : 400,
            },
            onClick: () => typeof handleUpdateAccountMode === 'function' && handleUpdateAccountMode('least_used'),
            disabled: !!busy,
          },
          t('accounts.mode_least_used')
        ),
        React.createElement(
          'button',
          {
            type: 'button',
            className: 'cb-btn',
            style: {
              borderRadius: 0,
              fontSize: '11px',
              padding: '3px 9px',
              border: 'none',
              borderLeft: '1px solid var(--dsw-alias-border-l2, color-mix(in srgb, currentColor 12%, transparent))',
              background: accountMode === 'round_robin'
                ? 'var(--dsw-alias-interactive-bg-active, color-mix(in srgb, currentColor 14%, transparent))'
                : 'transparent',
              fontWeight: accountMode === 'round_robin' ? 600 : 400,
            },
            onClick: () => typeof handleUpdateAccountMode === 'function' && handleUpdateAccountMode('round_robin'),
            disabled: !!busy,
          },
          t('accounts.mode_round_robin')
        )
      )
    ),

    showAdd
      ? React.createElement(
          'form',
          {
            onSubmit: onSubmitAdd,
            style: {
              background: 'var(--dsw-alias-interactive-bg-hover, color-mix(in srgb, currentColor 4%, transparent))',
              border: '1px solid var(--dsw-alias-border-l2, color-mix(in srgb, currentColor 12%, transparent))',
              borderRadius: '8px',
              padding: '12px',
              marginBottom: '14px',
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
            },
          },
          React.createElement(
            'div',
            { style: { display: 'flex', gap: '8px', flexWrap: 'wrap' } },
            React.createElement('input', {
              type: 'text',
              className: 'cb-input',
              style: { flex: '1 1 180px' },
              placeholder: t('accounts.label_placeholder'),
              value: newLabel,
              onChange: (e) => setNewLabel(e.target.value),
            }),
            React.createElement('input', {
              type: 'text',
              className: 'cb-input',
              style: { flex: '1 1 180px' },
              placeholder: t('accounts.env_placeholder'),
              value: newEnv,
              onChange: (e) => setNewEnv(e.target.value),
            })
          ),
          React.createElement(
            'div',
            { style: { display: 'flex', gap: '8px', alignItems: 'center' } },
            React.createElement('input', {
              type: showKey ? 'text' : 'password',
              className: 'cb-input',
              style: { flex: '1' },
              placeholder: t('key.placeholder_empty'),
              value: newKey,
              onChange: (e) => setNewKey(e.target.value),
            }),
            React.createElement(
              'button',
              {
                type: 'button',
                className: 'cb-btn',
                style: { padding: '4px 8px', fontSize: '11px' },
                onClick: () => setShowKey(!showKey),
              },
              showKey ? t('key.hide') : t('key.show')
            )
          ),
          React.createElement(
            'div',
            { style: { display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '4px' } },
            React.createElement(
              'button',
              {
                type: 'button',
                className: 'cb-btn',
                style: { padding: '4px 10px', fontSize: '12px' },
                onClick: () => setShowAdd(false),
              },
              t('accounts.cancel_btn')
            ),
            React.createElement(
              'button',
              {
                type: 'submit',
                className: 'cb-btn cb-btn-primary',
                style: { padding: '4px 12px', fontSize: '12px' },
                disabled: !newKey.trim() || !!busy,
              },
              busy === 'add-account' ? t('key.saving') : t('accounts.save_btn')
            )
          )
        )
      : null,

    React.createElement(
      'table',
      { className: 'cb-table' },
      React.createElement(
        'thead',
        null,
        React.createElement(
          'tr',
          null,
          React.createElement('th', null, 'Account'),
          React.createElement('th', null, 'Credential Ref'),
          React.createElement('th', null, 'Status'),
          React.createElement('th', { style: { textAlign: 'right' } }, 'Action')
        )
      ),
      React.createElement(
        'tbody',
        null,
        status.accounts.map((acc) => {
          const envName = typeof acc.apiKeyEnv === 'string' ? acc.apiKeyEnv : ''
          const label = typeof acc.label === 'string' ? acc.label : ''
          const isActive = status.activeAccount === envName || (!status.activeAccount && acc.id === 'default')
          const isPrimary = acc.id === 'default' || envName === status.config?.apiKeyEnv
          return React.createElement(
            'tr',
            { key: acc.id || envName },
            React.createElement('td', null, React.createElement('strong', null, label)),
            React.createElement('td', null, React.createElement('code', null, envName)),
            React.createElement(
              'td',
              null,
              acc.present
                ? React.createElement('span', { className: 'cb-badge cb-badge-ok' }, `Configured (${acc.source})`)
                : React.createElement('span', { className: 'cb-badge cb-badge-warn' }, 'Missing Key'),
              isActive
                ? React.createElement('span', { className: 'cb-badge cb-badge-ok', style: { marginLeft: '6px' } }, t('accounts.active_badge'))
                : null,
              acc.isPinned && !isActive
                ? React.createElement('span', { className: 'cb-badge', style: { marginLeft: '6px', opacity: 0.85 } }, t('accounts.pinned_badge'))
                : null,
              typeof acc.percentUsed === 'number'
                ? React.createElement('span', { className: 'cb-badge', style: { marginLeft: '6px' } }, t('accounts.quota_used', { pct: acc.percentUsed }))
                : null
            ),
            React.createElement(
              'td',
              { style: { textAlign: 'right' } },
              !isActive && acc.present
                ? React.createElement(
                    'button',
                    {
                      type: 'button',
                      className: 'cb-btn',
                      style: { padding: '4px 8px', fontSize: '11px' },
                      disabled: !!busy,
                      onClick: () => handlePinAccount(envName),
                    },
                    t('accounts.pin_btn')
                  )
                : null,
              !isPrimary
                ? React.createElement(
                    'button',
                    {
                      type: 'button',
                      className: 'cb-btn cb-btn-danger',
                      style: { padding: '4px 8px', fontSize: '11px', marginLeft: '6px' },
                      disabled: !!busy,
                      onClick: () => onDeleteAccount(envName),
                    },
                    t('accounts.delete_btn')
                  )
                : null
            )
          )
        })
      )
    ),
    status.lastRotation
      ? React.createElement(
          'div',
          { className: 'cb-rotation-info', style: { marginTop: '10px', fontSize: '12px', opacity: 0.85 } },
          t('accounts.last_failover', {
            from: status.lastRotation.from,
            to: status.lastRotation.to,
            reason: status.lastRotation.reason,
          })
        )
      : null,
    React.createElement(
      'div',
      { style: { marginTop: '14px', paddingTop: '12px', borderTop: '1px solid var(--dsw-alias-border-l2)' } },
      React.createElement(
        'div',
        { style: { fontSize: '12px', fontWeight: 600, color: 'var(--dsw-alias-label-primary)', marginBottom: '4px' } },
        t('accounts.routes_title')
      ),
      React.createElement(
        'div',
        { style: { fontSize: '11px', color: 'var(--dsw-alias-label-secondary)', marginBottom: '8px' } },
        t('accounts.routes_desc')
      ),
      React.createElement(
        'div',
        { style: { display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' } },
        React.createElement('input', {
          type: 'text',
          className: 'cb-input',
          style: { flex: '2 1 140px', height: '26px', fontSize: '11px', padding: '0 6px' },
          placeholder: t('accounts.route_model_placeholder'),
          value: routeModel,
          onChange: (e) => setRouteModel(e.target.value),
        }),
        React.createElement(
          'select',
          {
            className: 'cb-select',
            style: { flex: '1 1 120px', height: '26px', fontSize: '11px', padding: '0 4px' },
            value: routeAccount,
            onChange: (e) => setRouteAccount(e.target.value),
          },
          React.createElement('option', { value: '' }, t('accounts.route_account_placeholder')),
          (status.accounts || []).map((acc) => {
            const keyName = acc.apiKeyEnv || acc.id
            return React.createElement('option', { key: keyName, value: keyName }, `${acc.label || keyName} (${keyName})`)
          })
        ),
        React.createElement(
          'button',
          {
            type: 'button',
            className: 'cb-btn cb-btn-primary',
            style: { padding: '3px 8px', fontSize: '11px' },
            disabled: !routeModel.trim() || !routeAccount.trim() || !!busy,
            onClick: () => {
              if (typeof onUpdateModelRoutes === 'function') {
                const next = { ...(modelRoutes || {}), [routeModel.trim()]: routeAccount.trim() }
                onUpdateModelRoutes(next)
                setRouteModel('')
                setRouteAccount('')
              }
            },
          },
          t('accounts.route_btn_add')
        )
      ),
      Object.keys(modelRoutes || {}).length > 0
        ? React.createElement(
            'div',
            { style: { display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '8px' } },
            Object.entries(modelRoutes || {}).map(([mId, accKey]) =>
              React.createElement(
                'div',
                {
                  key: mId,
                  style: {
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '3px 8px',
                    fontSize: '11px',
                    background: 'var(--dsw-alias-bg-layer-2)',
                    borderRadius: '4px',
                  },
                },
                React.createElement(
                  'span',
                  null,
                  React.createElement('code', null, mId),
                  ' ➔ ',
                  React.createElement('strong', null, accKey)
                ),
                React.createElement(
                  'button',
                  {
                    type: 'button',
                    className: 'cb-btn cb-btn-danger',
                    style: { padding: '1px 6px', fontSize: '10px' },
                    disabled: !!busy,
                    onClick: () => {
                      if (typeof onUpdateModelRoutes === 'function') {
                        const next = { ...(modelRoutes || {}) }
                        delete next[mId]
                        onUpdateModelRoutes(next)
                      }
                    },
                  },
                  '✕'
                )
              )
            )
          )
        : null
    )
  )
}
