/**
 * Accounts pool: one calm row per account, with live quota, status dot and a
 * compact action menu. Account mutations commit immediately; the rest of the
 * settings page uses the staged save bar.
 */
function AccountsSection({
  status,
  busy,
  handlePinAccount,
  handleAddAccount,
  handleDeleteAccount,
  handleRenameAccount,
  handleClearKey,
  accountMode,
  handleUpdateAccountMode,
  modelRoutes = {},
  onUpdateModelRoutes,
  t,
}) {
  const [showAdd, setShowAdd] = React.useState(false)
  const [newLabel, setNewLabel] = React.useState('')
  const [newEnv, setNewEnv] = React.useState('')
  const [newKey, setNewKey] = React.useState('')
  const [showKey, setShowKey] = React.useState(false)
  const [discoveredKeys, setDiscoveredKeys] = React.useState([])
  const [usageByAccount, setUsageByAccount] = React.useState({})
  const [menuFor, setMenuFor] = React.useState('')
  const [renameFor, setRenameFor] = React.useState('')
  const [renameValue, setRenameValue] = React.useState('')
  const [confirmAction, setConfirmAction] = React.useState(null)
  const [routeModel, setRouteModel] = React.useState('')
  const [routeAccount, setRouteAccount] = React.useState('')

  React.useEffect(() => {
    let active = true
    fetchWithTimeout(`${ROUTE_PREFIX}/keys/discovered`, { cache: 'no-store' })
      .then((response) => response.json())
      .then((data) => {
        if (active && data?.ok && Array.isArray(data.discovered)) setDiscoveredKeys(data.discovered)
      })
      .catch(() => {})
    return () => { active = false }
  }, [])

  const accountSignature = (status?.accounts || []).map((account) => account.apiKeyEnv || account.id).join('|')
  React.useEffect(() => {
    let active = true
    fetchWithTimeout(`${ROUTE_PREFIX}/accounts/usage`, { cache: 'no-store' })
      .then((response) => response.json())
      .then((data) => {
        if (!active || !data?.ok || !Array.isArray(data.accounts)) return
        const next = {}
        for (const entry of data.accounts) next[entry.apiKeyEnv] = entry
        setUsageByAccount(next)
      })
      .catch(() => {})
    return () => { active = false }
  }, [accountSignature, status?.activeAccount, busy])

  function nextEnvName() {
    let max = 1
    for (const account of status.accounts || []) {
      const match = String(account.apiKeyEnv || '').match(/^CLINEBOT_API_KEY_(\d+)$/)
      if (match) max = Math.max(max, Number(match[1]) + 1)
    }
    return `CLINEBOT_API_KEY_${max}`
  }

  function openAdd() {
    setNewEnv(nextEnvName())
    setShowAdd(true)
  }

  async function submitAdd(event) {
    if (event?.preventDefault) event.preventDefault()
    if (!newKey.trim() || typeof handleAddAccount !== 'function') return
    await handleAddAccount({
      label: newLabel.trim() || newEnv.trim(),
      apiKeyEnv: newEnv.trim(),
      apiKey: newKey.trim(),
    })
    setNewLabel('')
    setNewEnv('')
    setNewKey('')
    setShowAdd(false)
  }

  async function importDiscovered(item) {
    if (typeof handleAddAccount !== 'function') return
    await handleAddAccount({
      label: item.source || nextEnvName(),
      apiKeyEnv: nextEnvName(),
      id: item.id,
    })
    setDiscoveredKeys((previous) => previous.filter((entry) => entry.id !== item.id))
  }

  function openRename(account) {
    setMenuFor('')
    setRenameFor(account.apiKeyEnv)
    setRenameValue(account.label || '')
  }

  async function submitRename(account) {
    if (typeof handleRenameAccount === 'function') {
      await handleRenameAccount(account.apiKeyEnv, renameValue.trim() || account.apiKeyEnv)
    }
    setRenameFor('')
    setRenameValue('')
  }

  async function runConfirm() {
    if (!confirmAction) return
    if (confirmAction.type === 'delete' && typeof handleDeleteAccount === 'function') {
      await handleDeleteAccount(confirmAction.env, true)
    }
    if (confirmAction.type === 'clear' && typeof handleClearKey === 'function') {
      await handleClearKey(confirmAction.env)
    }
    setConfirmAction(null)
  }

  function dotClass(account, live) {
    if (!account.present) return 'cb-status-dot cb-status-dot-warn'
    if (live?.error) return 'cb-status-dot cb-status-dot-bad'
    const percent = live?.usage?.windows?.fiveHour?.percentUsed
    if (typeof percent === 'number' && percent >= 95) return 'cb-status-dot cb-status-dot-bad'
    if (account.isPinned || status.activeAccount === account.apiKeyEnv) return 'cb-status-dot cb-status-dot-ok'
    return 'cb-status-dot cb-status-dot-idle'
  }

  const accounts = status.accounts || []

  return React.createElement(
    'section',
    { className: 'cb-section-card cb-accounts' },
    React.createElement(
      'div',
      { className: 'cb-section-head' },
      React.createElement('div', { className: 'cb-section-title' }, t('accounts.title')),
      !showAdd
        ? React.createElement(
            'button',
            { type: 'button', className: 'cb-btn cb-btn-primary', disabled: !!busy, onClick: openAdd },
            React.createElement(CbIcon, { name: 'plus', size: 13 }),
            ` ${t('accounts.add_btn')}`
          )
        : null
    ),
    React.createElement('div', { className: 'cb-section-desc' }, t('accounts.desc')),

    discoveredKeys.length > 0
      ? React.createElement(
          'div',
          { className: 'cb-discovered' },
          React.createElement(
            'div',
            { className: 'cb-discovered-head' },
            React.createElement(CbIcon, { name: 'key', size: 14 }),
            ` ${t('discovery.title')}`
          ),
          discoveredKeys.map((item) => React.createElement(
            'div',
            { className: 'cb-discovered-row', key: item.id },
            React.createElement('span', { className: 'cb-mono' }, item.maskedKey || item.source),
            React.createElement('span', { className: 'cb-muted' }, item.source || ''),
            React.createElement(
              'button',
              {
                type: 'button',
                className: 'cb-btn',
                disabled: !!busy,
                onClick: () => importDiscovered(item),
              },
              React.createElement(CbIcon, { name: 'download', size: 12 }),
              ` ${t('discovery.import_btn', { source: item.source || '' })}`
            )
          ))
        )
      : null,

    React.createElement(
      'div',
      { className: 'cb-account-mode' },
      React.createElement('span', { className: 'cb-muted' }, t('accounts.mode_label')),
      React.createElement(
        'div',
        { className: 'cb-seg' },
        React.createElement(
          'button',
          {
            type: 'button',
            className: (accountMode || 'least_used') === 'least_used' ? 'cb-seg-item cb-seg-item-active' : 'cb-seg-item',
            disabled: !!busy,
            onClick: () => handleUpdateAccountMode && handleUpdateAccountMode('least_used'),
          },
          t('accounts.mode_least_used')
        ),
        React.createElement(
          'button',
          {
            type: 'button',
            className: accountMode === 'round_robin' ? 'cb-seg-item cb-seg-item-active' : 'cb-seg-item',
            disabled: !!busy,
            onClick: () => handleUpdateAccountMode && handleUpdateAccountMode('round_robin'),
          },
          t('accounts.mode_round_robin')
        )
      )
    ),

    showAdd
      ? React.createElement(
          'form',
          { className: 'cb-account-add', onSubmit: submitAdd },
          React.createElement(
            'div',
            { className: 'cb-account-add-row' },
            React.createElement('input', {
              type: 'text',
              className: 'cb-input',
              placeholder: t('accounts.label_placeholder'),
              value: newLabel,
              onChange: (event) => setNewLabel(event.target.value),
            }),
            React.createElement('input', {
              type: 'text',
              className: 'cb-input',
              placeholder: t('accounts.env_placeholder'),
              value: newEnv,
              onChange: (event) => setNewEnv(event.target.value),
            })
          ),
          React.createElement(
            'div',
            { className: 'cb-account-add-row' },
            React.createElement('input', {
              type: showKey ? 'text' : 'password',
              className: 'cb-input',
              placeholder: t('key.placeholder_empty'),
              value: newKey,
              onChange: (event) => setNewKey(event.target.value),
            }),
            React.createElement(
              'button',
              { type: 'button', className: 'cb-btn', onClick: () => setShowKey((value) => !value) },
              showKey ? t('key.hide') : t('key.show')
            )
          ),
          React.createElement(
            'div',
            { className: 'cb-account-add-actions' },
            React.createElement(
              'button',
              { type: 'button', className: 'cb-btn', onClick: () => setShowAdd(false) },
              t('accounts.cancel_btn')
            ),
            React.createElement(
              'button',
              {
                type: 'submit',
                className: 'cb-btn cb-btn-primary',
                disabled: !newKey.trim() || !!busy,
              },
              busy === 'add-account' ? t('key.saving') : t('accounts.save_btn')
            )
          )
        )
      : null,

    accounts.length === 0
      ? React.createElement('div', { className: 'cb-empty' }, t('accounts.no_accounts'))
      : React.createElement(
          'div',
          { className: 'cb-account-list' },
          accounts.map((account) => {
            const envName = account.apiKeyEnv || account.id || ''
            const live = usageByAccount[envName]
            const isActive = status.activeAccount === envName || (!status.activeAccount && account.id === 'default')
            const isPrimary = account.id === 'default' || envName === status.config?.apiKeyEnv
            const five = live?.usage?.windows?.fiveHour
            const percent = typeof five?.percentUsed === 'number'
              ? five.percentUsed
              : (typeof account.percentUsed === 'number' ? account.percentUsed : null)
            const plan = live?.usage?.plan || ''
            const email = live?.usage?.user?.email || ''
            return React.createElement(
              'div',
              { className: 'cb-account-item', key: envName || account.id },
              React.createElement(
                'div',
                { className: 'cb-account-row' },
                React.createElement('span', { className: dotClass(account, live), 'aria-hidden': 'true' }),
                React.createElement(
                  'div',
                  { className: 'cb-account-main' },
                  React.createElement(
                    'div',
                    { className: 'cb-account-name' },
                    account.label || envName,
                    React.createElement('span', { className: 'cb-account-env cb-mono' }, envName)
                  ),
                  React.createElement(
                    'div',
                    { className: 'cb-account-meta' },
                    [plan, email].filter(Boolean).join(' · ') || t('accounts.source', { source: account.source || '—' })
                  )
                ),
                React.createElement(
                  'div',
                  { className: 'cb-account-badges' },
                  isActive ? React.createElement('span', { className: 'cb-badge cb-badge-ok' }, t('accounts.active_badge')) : null,
                  account.isPinned ? React.createElement('span', { className: 'cb-badge' }, t('accounts.pinned_badge')) : null,
                  account.present
                    ? React.createElement('span', { className: 'cb-badge' }, t('accounts.configured'))
                    : React.createElement('span', { className: 'cb-badge cb-badge-warn' }, t('accounts.missing_key'))
                ),
                React.createElement(
                  'div',
                  { className: 'cb-account-quota' },
                  percent === null
                    ? null
                    : React.createElement(
                        React.Fragment,
                        null,
                        React.createElement('span', { className: 'cb-muted' }, t('accounts.quota_5h', { pct: Math.round(percent) })),
                        React.createElement(
                          'span',
                          { className: 'cb-meter' },
                          React.createElement('span', {
                            className: percent >= 95 ? 'cb-meter-fill cb-meter-fill-warn' : 'cb-meter-fill',
                            style: { width: `${Math.max(0, Math.min(100, percent))}%` },
                          })
                        )
                      )
                ),
                React.createElement(
                  'button',
                  {
                    type: 'button',
                    className: 'cb-icon-btn',
                    'aria-label': t('accounts.actions'),
                    'aria-expanded': menuFor === envName,
                    disabled: !!busy,
                    onClick: () => setMenuFor((current) => (current === envName ? '' : envName)),
                  },
                  React.createElement(CbIcon, { name: 'kebab', size: 16 })
                )
              ),

              menuFor === envName
                ? React.createElement(
                    'div',
                    { className: 'cb-account-menu' },
                    isActive
                      ? React.createElement('button', { type: 'button', className: 'cb-menu-item', onClick: () => { setMenuFor(''); handlePinAccount('') } }, t('accounts.unpin'))
                      : account.present
                        ? React.createElement('button', { type: 'button', className: 'cb-menu-item', onClick: () => { setMenuFor(''); handlePinAccount(envName) } }, t('accounts.pin_btn'))
                        : null,
                    !isPrimary
                      ? React.createElement('button', { type: 'button', className: 'cb-menu-item', onClick: () => openRename(account) }, t('accounts.rename'))
                      : null,
                    account.present
                      ? React.createElement('button', { type: 'button', className: 'cb-menu-item', onClick: () => { setMenuFor(''); setConfirmAction({ type: 'clear', env: envName }) } }, t('accounts.clear_key'))
                      : null,
                    !isPrimary
                      ? React.createElement('button', { type: 'button', className: 'cb-menu-item cb-menu-item-danger', onClick: () => { setMenuFor(''); setConfirmAction({ type: 'delete', env: envName }) } }, t('accounts.delete_btn'))
                      : null
                  )
                : null,

              renameFor === envName
                ? React.createElement(
                    'div',
                    { className: 'cb-account-inline' },
                    React.createElement('input', {
                      type: 'text',
                      className: 'cb-input',
                      value: renameValue,
                      onChange: (event) => setRenameValue(event.target.value),
                      placeholder: t('accounts.rename_placeholder'),
                    }),
                    React.createElement('button', { type: 'button', className: 'cb-btn cb-btn-primary', disabled: !!busy, onClick: () => submitRename(account) }, t('accounts.rename_save')),
                    React.createElement('button', { type: 'button', className: 'cb-btn', onClick: () => setRenameFor('') }, t('accounts.cancel'))
                  )
                : null,

              confirmAction && confirmAction.env === envName
                ? React.createElement(
                    'div',
                    { className: 'cb-account-inline cb-account-danger' },
                    React.createElement(
                      'span',
                      { className: 'cb-account-danger-text' },
                      confirmAction.type === 'delete'
                        ? t('accounts.remove_confirm', { name: account.label || envName })
                        : t('accounts.clear_confirm', { name: account.label || envName })
                    ),
                    React.createElement('button', { type: 'button', className: 'cb-btn cb-btn-danger', disabled: !!busy, onClick: runConfirm }, t('accounts.confirm')),
                    React.createElement('button', { type: 'button', className: 'cb-btn', onClick: () => setConfirmAction(null) }, t('accounts.cancel'))
                  )
                : null
            )
          })
        ),

    React.createElement(
      'div',
      { className: 'cb-account-routes' },
      React.createElement(
        'div',
        { className: 'cb-account-routes-head' },
        React.createElement(CbIcon, { name: 'route', size: 14 }),
        ` ${t('accounts.routes_title')}`
      ),
      React.createElement('div', { className: 'cb-section-desc' }, t('accounts.routes_desc')),
      React.createElement(
        'div',
        { className: 'cb-account-route-add' },
        React.createElement('input', {
          type: 'text',
          className: 'cb-input',
          placeholder: t('accounts.route_model_placeholder'),
          value: routeModel,
          onChange: (event) => setRouteModel(event.target.value),
        }),
        React.createElement(
          'select',
          {
            className: 'cb-select',
            value: routeAccount,
            onChange: (event) => setRouteAccount(event.target.value),
          },
          React.createElement('option', { value: '' }, t('accounts.route_account_placeholder')),
          accounts.map((account) => {
            const key = account.apiKeyEnv || account.id
            return React.createElement('option', { key, value: key }, `${account.label || key} (${key})`)
          })
        ),
        React.createElement(
          'button',
          {
            type: 'button',
            className: 'cb-btn',
            disabled: !routeModel.trim() || !routeAccount.trim() || !!busy,
            onClick: () => {
              if (typeof onUpdateModelRoutes !== 'function') return
              onUpdateModelRoutes({ ...(modelRoutes || {}), [routeModel.trim()]: routeAccount.trim() })
              setRouteModel('')
              setRouteAccount('')
            },
          },
          t('accounts.route_btn_add')
        )
      ),
      Object.keys(modelRoutes || {}).length > 0
        ? React.createElement(
            'div',
            { className: 'cb-account-route-list' },
            Object.entries(modelRoutes || {}).map(([modelId, accountKey]) => React.createElement(
              'div',
              { className: 'cb-account-route-row', key: modelId },
              React.createElement('span', { className: 'cb-mono' }, modelId),
              React.createElement(CbIcon, { name: 'chevron', size: 12 }),
              React.createElement('strong', null, accountKey),
              React.createElement(
                'button',
                {
                  type: 'button',
                  className: 'cb-icon-btn',
                  'aria-label': t('accounts.route_remove'),
                  disabled: !!busy,
                  onClick: () => {
                    if (typeof onUpdateModelRoutes !== 'function') return
                    const next = { ...(modelRoutes || {}) }
                    delete next[modelId]
                    onUpdateModelRoutes(next)
                  },
                },
                React.createElement(CbIcon, { name: 'close', size: 13 })
              )
            ))
          )
        : null
    )
  )
}
