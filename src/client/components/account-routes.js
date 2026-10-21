function AccountRoutes({ accounts = [], modelRoutes = {}, onUpdateModelRoutes, busy, t }) {
  const [routeModel, setRouteModel] = React.useState('')
  const [routeAccount, setRouteAccount] = React.useState('')
  return React.createElement(
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
}
