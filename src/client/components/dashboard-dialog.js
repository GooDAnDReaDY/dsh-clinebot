/**
 * The quota & status window, opened from the sidebar meter.
 *
 * This used to be a `main`-slot panel: clicking the meter called
 * `layout.selectPanel('clinebot-dashboard')`, which swapped the conversation out
 * of the centre column for a full-bleed dashboard. A status read-out has no
 * business replacing the conversation, so it is a window now — the shell's own
 * `Modal`, which brings the backdrop, the close affordance, Escape and focus
 * handling with it.
 *
 * `open` is owned by the caller (the meter), and the data is fetched on open
 * rather than on mount, so a closed window costs nothing.
 */
function DashboardDialog(props) {
  const t = props?.t || makeT(en, en)
  const open = props?.open !== false
  const onClose = typeof props?.onClose === 'function' ? props.onClose : () => {}

  const [data, setData] = React.useState(null)
  const [status, setStatus] = React.useState(null)
  const [loading, setLoading] = React.useState(false)
  const [updatedAt, setUpdatedAt] = React.useState('')
  const [err, setErr] = React.useState('')

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
    if (open) loadData()
  }, [open, loadData])

  if (!open) return null

  const plan = data?.plan || status?.config?.defaultModel || 'ClinePass'
  const email = data?.user?.email || ''
  const activeAcc = status?.config?.activeAccount || 'Auto (Least-used)'
  const enabledCount = status?.config?.enabledModels?.length || 0
  const routingMode = status?.config?.accountMode === 'round_robin' ? t('accounts.mode_round_robin') : t('accounts.mode_least_used')

  const body = React.createElement(
    'div',
    { className: 'cb-dialog' },
    React.createElement(
      'div',
      { className: 'cb-dialogMeta' },
      updatedAt ? React.createElement('span', null, `${t('dashboard.updated_at')} ${updatedAt}`) : null,
      React.createElement('span', { style: { flex: 1 } }),
      React.createElement(
        'button',
        { type: 'button', className: 'cb-btn', disabled: loading, onClick: loadData },
        loading ? t('dashboard.refreshing') : t('dashboard.refresh')
      )
    ),

    err ? React.createElement('div', { className: 'cb-alert-bad' }, err) : null,

    // Account and plan
    React.createElement(
      'div',
      { className: 'cb-dialogCard' },
      React.createElement(
        'div',
        { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap' } },
        React.createElement(
          'div',
          { style: { display: 'flex', flexDirection: 'column', minWidth: 0 } },
          React.createElement('div', { className: 'cb-row-title' }, plan),
          email ? React.createElement('div', { className: 'cb-row-desc' }, email) : null
        ),
        React.createElement('span', { className: 'cb-badge cb-badge-ok' }, t('badge.registered', { count: enabledCount }))
      ),
      React.createElement(
        'div',
        { className: 'cb-grid-2', style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '10px' } },
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
          React.createElement('div', { className: 'cb-stat-val', style: { fontSize: '14px' } }, routingMode)
        )
      )
    ),

    // Quota windows
    React.createElement(
      'div',
      { className: 'cb-dialogCard' },
      React.createElement('div', { className: 'cb-section-title' }, t('quota.title')),
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

  if (Modal) {
    return React.createElement(Modal, {
      open: true,
      onClose,
      title: t('dashboard.title'),
      description: t('dashboard.subtitle'),
      closeLabel: t('dashboard.close'),
      children: body,
    })
  }

  // Older shells without the primitive still get a window, just a plainer one.
  return React.createElement(
    'div',
    { className: 'cb-dialogFallback', role: 'dialog', 'aria-label': t('dashboard.title'), onClick: onClose },
    React.createElement(
      'div',
      { className: 'cb-dialogFallbackPanel', onClick: (e) => e.stopPropagation() },
      React.createElement(
        'div',
        { className: 'cb-dialogMeta' },
        React.createElement('span', { className: 'cb-row-title' }, t('dashboard.title')),
        React.createElement('span', { style: { flex: 1 } }),
        React.createElement(
          'button',
          { type: 'button', className: 'cb-btn', 'aria-label': t('dashboard.close'), onClick: onClose },
          t('dashboard.close')
        )
      ),
      body
    )
  )
}
