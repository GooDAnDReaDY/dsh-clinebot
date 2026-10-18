function DashboardOverlay(props) {
  const ctx = props?.ctx
  const t = props?.t || makeT(en, en)
  const [data, setData] = React.useState(null)
  const [status, setStatus] = React.useState(null)
  const [loading, setLoading] = React.useState(false)
  const [updatedAt, setUpdatedAt] = React.useState('')
  const [err, setErr] = React.useState('')

  const handleClose = () => {
    if (typeof props?.close === 'function') {
      props.close()
    } else {
      ctx?.get?.('layout')?.selectPanel?.(null)
    }
  }

  const loadData = React.useCallback(async () => {
    setLoading(true)
    setErr('')
    try {
      const [uRes, sRes] = await Promise.all([
        fetchWithTimeout(`${ROUTE_PREFIX}/usage`, { cache: 'no-store' }),
        fetchWithTimeout(`${ROUTE_PREFIX}/status`, { cache: 'no-store' }),
      ])
      const uJson = await uRes.json().catch(() => ({}))
      const sJson = await sRes.json().catch(() => ({}))
      if (uJson?.ok) setData(uJson)
      if (sJson?.ok) setStatus(sJson)
      setUpdatedAt(new Date().toLocaleTimeString())
    } catch (e) {
      setErr(String(e?.message || e))
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => {
    loadData()
  }, [loadData])

  const plan = data?.plan || status?.config?.defaultModel || 'ClinePass'
  const email = data?.user?.email || ''
  const activeAcc = status?.config?.activeAccount || 'Auto (Least-used)'
  const enabledCount = status?.config?.enabledModels?.length || 0

  return React.createElement(
    'div',
    { className: 'cb-mainOverlay', role: 'region', 'aria-label': t('dashboard.title') },
    React.createElement(
      'div',
      { className: 'cb-mainInner' },
      // Header
      React.createElement(
        'header',
        { className: 'cb-mainHeader' },
        React.createElement(
          'div',
          { style: { display: 'flex', flexDirection: 'column', gap: '2px', minWidth: 0 } },
          React.createElement('h2', { className: 'cb-mainTitle' }, t('dashboard.title')),
          React.createElement('p', { className: 'cb-mainSub' }, t('dashboard.subtitle'))
        ),
        React.createElement('span', { style: { flex: 1 } }),
        updatedAt
          ? React.createElement(
              'span',
              { style: { fontSize: '12px', color: 'var(--dsw-alias-label-tertiary)', fontVariantNumeric: 'tabular-nums' } },
              `${t('dashboard.updated_at')} ${updatedAt}`
            )
          : null,
        React.createElement(
          'button',
          {
            type: 'button',
            className: 'cb-btn',
            disabled: loading,
            onClick: loadData,
          },
          loading ? t('dashboard.refreshing') : t('dashboard.refresh')
        ),
        React.createElement(
          'button',
          {
            type: 'button',
            className: 'cb-btn',
            style: { minWidth: '32px', padding: '0 8px', fontSize: '16px' },
            'aria-label': t('dashboard.close'),
            title: t('dashboard.close'),
            onClick: handleClose,
          },
          '✕'
        )
      ),

      err ? React.createElement('div', { className: 'cb-alert-bad' }, err) : null,

      // Card 1: Account & Plan Status
      React.createElement(
        'div',
        { className: 'cb-mainCard' },
        React.createElement(
          'div',
          { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' } },
          React.createElement(
            'div',
            { style: { display: 'flex', alignItems: 'center', gap: '10px' } },
            React.createElement('span', { style: { fontSize: '20px' } }, '💳'),
            React.createElement(
              'div',
              null,
              React.createElement('div', { style: { fontSize: '15px', fontWeight: 600, color: 'var(--dsw-alias-label-primary)' } }, plan),
              email ? React.createElement('div', { style: { fontSize: '12px', color: 'var(--dsw-alias-label-secondary)' } }, email) : null
            )
          ),
          React.createElement(
            'span',
            { className: 'cb-badge cb-badge-ok' },
            t('badge.registered', { count: enabledCount })
          )
        ),
        React.createElement(
          'div',
          { className: 'cb-grid-2', style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '10px', marginTop: '6px' } },
          React.createElement(
            'div',
            { className: 'cb-stat-box' },
            React.createElement('div', { className: 'cb-stat-lbl' }, t('dashboard.account_pool')),
            React.createElement('div', { className: 'cb-stat-val', style: { fontSize: '14px', wordBreak: 'break-all' } }, activeAcc)
          ),
          React.createElement(
            'div',
            { className: 'cb-stat-box' },
            React.createElement('div', { className: 'cb-stat-lbl' }, t('accounts.mode_label')),
            React.createElement('div', { className: 'cb-stat-val', style: { fontSize: '14px' } }, status?.config?.accountMode === 'round_robin' ? t('accounts.mode_round_robin') : t('accounts.mode_least_used'))
          )
        )
      ),

      // Card 2: Quota Windows
      React.createElement(
        'div',
        { className: 'cb-mainCard' },
        React.createElement(
          'div',
          { style: { fontSize: '15px', fontWeight: 600, color: 'var(--dsw-alias-label-primary)' } },
          t('quota.title')
        ),
        React.createElement(
          'div',
          { style: { display: 'flex', flexDirection: 'column', gap: '12px' } },
          data?.windows?.fiveHour
            ? React.createElement(ProgressBar, {
                label: t('quota.window_5h'),
                percentUsed: data.windows.fiveHour.percentUsed || 0,
                remainingPercent: data.windows.fiveHour.remainingPercent || 100,
                resetsAt: data.windows.fiveHour.resetsAt,
                t,
              })
            : null,
          React.createElement(ProgressBar, {
            label: t('quota.window_weekly'),
            percentUsed: data?.windows?.weekly?.percentUsed || 0,
            remainingPercent: data?.windows?.weekly?.remainingPercent || 100,
            resetsAt: data?.windows?.weekly?.resetsAt,
            t,
          }),
          data?.windows?.monthly
            ? React.createElement(ProgressBar, {
                label: t('quota.window_monthly'),
                percentUsed: data.windows.monthly.percentUsed || 0,
                remainingPercent: data.windows.monthly.remainingPercent || 100,
                resetsAt: data.windows.monthly.resetsAt,
                t,
              })
            : null
        )
      )
    )
  )
}
