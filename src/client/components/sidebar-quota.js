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

function SidebarQuota({ ctx, wide, t: propT, open: openPanel }) {
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

  const windowEntries = [
    { key: 'fiveHour', label: t('quota.window_5h'), value: data?.windows?.fiveHour },
    { key: 'weekly', label: t('quota.window_weekly'), value: data?.windows?.weekly },
    { key: 'monthly', label: t('quota.window_monthly'), value: data?.windows?.monthly },
  ]

  const windowPct = (window) => {
    const value = Number(window.value?.percentUsed)
    return Number.isFinite(value) ? Math.max(0, Math.min(100, Math.round(value))) : null
  }

  const measured = windowEntries
    .map((window) => ({ ...window, pct: windowPct(window) }))
    .filter((window) => window.pct !== null)

  const pct = measured.length ? Math.max(...measured.map((window) => window.pct)) : 0
  const isWarn = measured.some((window) => window.pct >= 85)
  const planName = String(data?.plan || t('title')).replace(/\s*\(\$[^)]*\)\s*$/, '')
  const accountLabel = data?.account ? ` · ${data.account}` : ''
  const tooltip = `${planName}${accountLabel} · ${windowEntries.map((window) => {
    const value = windowPct(window)
    return `${window.label} ${value === null ? '—' : `${value}% ${t('dashboard.used')}`}`
  }).join(' · ')}`

  // The window is local to the meter: nothing is selected or navigated, so the
  // conversation stays where it is and closing simply drops the window.
  const handleOpen = () => {
    if (typeof openPanel === 'function') {
      try {
        if (openPanel() !== false) return
      } catch {
        /* fall through to the local window */
      }
    }
    setOpen(true)
  }

  // Keep all three rows visible even when the endpoint omits a window for the
  // current plan; the missing row shows an explicit dash instead of silently
  // relabelling another window.
  const rows = windowEntries

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
        React.createElement('span', { className: isWarn ? 'cb-footPct cb-footPctWarn' : 'cb-footPct' }, `${pct}%`)
      ),
      rows.map((window) => {
        const value = windowPct(window)
        const hasData = value !== null
        const warn = hasData && value >= 85
        const reset = hasData && typeof formatResetCountdown === 'function'
          ? formatResetCountdown(window.value?.resetsAt)
          : ''
        const resetText = reset
          ? ` · ${reset === 'resetting' ? t('quota.resetting') : reset}`
          : ''
        return React.createElement(
          'div',
          { className: hasData ? 'cb-footRow' : 'cb-footRow cb-footRowMissing', key: window.key },
          React.createElement(
            'div',
            { className: 'cb-footHead' },
            React.createElement('span', { className: 'cb-footLabel' }, window.label),
            React.createElement(
              'span',
              { className: hasData ? 'cb-footAmount' : 'cb-footAmount cb-footAmountMissing' },
              hasData ? `${100 - value}% ${t('dashboard.remaining')}${resetText}` : '—'
            )
          ),
          React.createElement(
            'span',
            { className: 'cb-footBar' },
            React.createElement('span', {
              className: warn ? 'cb-footFill cb-footFillWarn' : 'cb-footFill',
              style: { width: hasData ? `${Math.min(100, Math.max(2, value))}%` : '0%' },
            })
          )
        )
      }),
      rows.some((window) => windowPct(window) !== null)
        ? null
        : React.createElement('span', { className: 'cb-footMessage' }, data?.error || t('quota.no_windows'))
    ),
    dialog
  )
}
