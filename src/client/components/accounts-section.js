function AccountsSection({ status, busy, handlePinAccount, handleAddAccount, handleDeleteAccount, t }) {
  if (!status.accounts || !status.accounts.length) return null

  const [showAdd, setShowAdd] = React.useState(false)
  const [newLabel, setNewLabel] = React.useState('')
  const [newEnv, setNewEnv] = React.useState('')
  const [newKey, setNewKey] = React.useState('')
  const [showKey, setShowKey] = React.useState(false)
  const [deleteSecret, setDeleteSecret] = React.useState(true)

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

    showAdd
      ? React.createElement(
          'form',
          {
            onSubmit: onSubmitAdd,
            style: {
              background: 'var(--dsw-alias-bg-hover, color-mix(in srgb, currentColor 4%, transparent))',
              border: '1px solid var(--dsw-alias-border, color-mix(in srgb, currentColor 12%, transparent))',
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
      : null
  )
}
