function MiniRing({ percent, size = 18, warn = false }) {
  const r = 7
  const c = 2 * Math.PI * r
  const pct = Math.max(0, Math.min(100, Number(percent) || 0))
  const offset = c - (pct / 100) * c
  const strokeColor = warn ? 'var(--dsw-alias-state-error-primary)' : 'var(--dsw-alias-brand-primary)'

  return React.createElement(
    'svg',
    {
      className: 'cb-glyph',
      width: size,
      height: size,
      viewBox: '0 0 20 20',
      fill: 'none',
    },
    React.createElement('circle', {
      cx: 10,
      cy: 10,
      r,
      stroke: 'var(--dsw-alias-bg-layer-2)',
      strokeWidth: 2.5,
    }),
    React.createElement('circle', {
      cx: 10,
      cy: 10,
      r,
      stroke: strokeColor,
      strokeWidth: 2.5,
      strokeDasharray: c,
      strokeDashoffset: offset,
      strokeLinecap: 'round',
      transform: 'rotate(-90 10 10)',
      style: { transition: 'stroke-dashoffset 0.3s ease' },
    })
  )
}

function SidebarQuota({ ctx, wide, t: propT }) {
  const t = propT || makeT(en, en)
  const [data, setData] = React.useState(null)
  const [open, setOpen] = React.useState(false)

  // Check the configForms snapshot for the showSidebarQuota toggle
  const configSnapshot = useConfigFormsSnapshot(ctx)
  const show = configSnapshot?.value?.showSidebarQuota !== false

  const loadQuota = React.useCallback(async () => {
    try {
      const res = await fetchWithTimeout(`${ROUTE_PREFIX}/usage`, { cache: 'no-store' })
      if (!res.ok) return
      const json = await res.json().catch(() => null)
      if (json && json.ok) setData(json)
    } catch {
      // quiet on network fail
    }
  }, [])

  // Poll only while the meter is on screen — a hidden meter has nothing to refresh.
  React.useEffect(() => {
    if (!show) return undefined
    let timer = null
    const scheduleNext = () => {
      timer = setTimeout(async () => {
        await loadQuota()
        scheduleNext()
      }, 60000)
    }
    loadQuota()
    scheduleNext()
    return () => { if (timer) clearTimeout(timer) }
  }, [loadQuota, show])

  if (!show) return null

  const fiveHour = data?.windows?.fiveHour
  const weekly = data?.windows?.weekly
  const activeWindow = fiveHour || weekly
  const pct = Math.round(activeWindow?.percentUsed || 0)
  const isWarn = pct >= 85
  const planName = data?.plan || t('title')

  // The window is local to the meter: nothing is selected or navigated, so the
  // conversation stays where it is and closing simply drops the window.
  const handleOpen = () => setOpen(true)

  const tooltip = `${t('sidebar.quota_title')}: ${pct}% ${t('dashboard.used')} (${planName})`
  const dialog = React.createElement(DashboardDialog, { t, open, onClose: () => setOpen(false) })

  if (!wide) {
    return React.createElement(
      React.Fragment,
      null,
      React.createElement(
        'button',
        {
          type: 'button',
          className: 'cb-railButton',
          'aria-label': tooltip,
          'aria-expanded': open,
          title: tooltip,
          onClick: handleOpen,
        },
        React.createElement(MiniRing, { percent: pct, warn: isWarn, size: 20 })
      ),
      dialog
    )
  }

  return React.createElement(
    React.Fragment,
    null,
    React.createElement(
      'button',
      {
        type: 'button',
        className: 'cb-foot',
        'aria-label': tooltip,
        'aria-expanded': open,
        title: tooltip,
        onClick: handleOpen,
      },
      React.createElement(
        'div',
        { className: 'cb-footTop' },
        React.createElement(MiniRing, { percent: pct, warn: isWarn, size: 16 }),
        React.createElement('span', { className: 'cb-footName' }, planName),
        React.createElement('span', { className: 'cb-footPct', style: { marginLeft: 'auto', fontWeight: 600, color: isWarn ? 'var(--dsw-alias-state-error-primary)' : 'var(--dsw-alias-label-secondary)' } }, `${pct}%`)
      ),
      React.createElement(
        'div',
        { className: 'cb-footRow' },
        React.createElement(
          'div',
          { className: 'cb-footHead' },
          React.createElement('span', { className: 'cb-footLabel' }, t('dashboard.rolling_window')),
          React.createElement('span', { className: 'cb-footAmount' }, `${100 - pct}% ${t('dashboard.remaining')}`)
        ),
        React.createElement(
          'span',
          { className: 'cb-footBar' },
          React.createElement('span', {
            className: isWarn ? 'cb-footFill cb-footFillWarn' : 'cb-footFill',
            style: { width: `${Math.min(100, Math.max(2, pct))}%` },
          })
        )
      )
    ),
    dialog
  )
}
