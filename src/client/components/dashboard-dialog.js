/**
 * Quota and analytics surfaces. The sidebar card opens this as the layout's
 * center-column panel (the Command Code / OpenCode shape); when the layout
 * service is unavailable the same content falls back to the shell's Modal.
 */
function DashboardDialog(props) {
  const t = props?.t || makeT(en, en)
  const panel = props?.panel === true
  const open = panel || props?.open !== false
  const onClose = typeof props?.onClose === 'function' ? props.onClose : () => {}

  const [data, setData] = React.useState(null)
  const [status, setStatus] = React.useState(null)
  const [analytics, setAnalytics] = React.useState(null)
  const [tab, setTab] = React.useState('quota')
  const [groupBy, setGroupBy] = React.useState('model')
  const [loading, setLoading] = React.useState(false)
  const [analyticsLoading, setAnalyticsLoading] = React.useState(false)
  const [updatedAt, setUpdatedAt] = React.useState('')
  const [err, setErr] = React.useState('')
  const [accountsUsage, setAccountsUsage] = React.useState(null)
  const [selectedAccount, setSelectedAccount] = React.useState('')
  const [analyticsDays, setAnalyticsDays] = React.useState(7)
  const [heatmapModel, setHeatmapModel] = React.useState('')

  const loadData = React.useCallback(async () => {
    setLoading(true)
    setErr('')
    try {
      const [uRes, sRes, aRes] = await Promise.all([
        fetchWithTimeout(`${ROUTE_PREFIX}/usage`, { cache: 'no-store' }),
        fetchWithTimeout(`${ROUTE_PREFIX}/status`, { cache: 'no-store' }),
        fetchWithTimeout(`${ROUTE_PREFIX}/accounts/usage`, { cache: 'no-store' }),
      ])
      const uJson = await uRes.json().catch(() => ({}))
      const sJson = await sRes.json().catch(() => ({}))
      const aJson = await aRes.json().catch(() => ({}))
      if (uJson?.ok) setData(uJson)
      if (sJson?.ok) setStatus(sJson)
      if (aJson?.ok) {
        setAccountsUsage(aJson)
        setSelectedAccount((current) => {
          const accounts = Array.isArray(aJson.accounts) ? aJson.accounts : []
          if (accounts.some((entry) => entry.apiKeyEnv === current)) return current
          return aJson.activeAccount || accounts[0]?.apiKeyEnv || ''
        })
      }
      setUpdatedAt(new Date().toLocaleTimeString())
    } catch (e) {
      setErr(String(e?.message || e))
    } finally {
      setLoading(false)
    }
  }, [])

  const loadAnalytics = React.useCallback(async (group = groupBy, days = analyticsDays, model = heatmapModel) => {
    setAnalyticsLoading(true)
    setErr('')
    try {
      const from = Date.now() - days * 86_400_000
      const query = [
        `groupBy=${encodeURIComponent(group)}`,
        'limit=20',
        `from=${from}`,
        `heatmapDays=${days}`,
        ...(model ? [`heatmapModel=${encodeURIComponent(model)}`] : []),
      ].join('&')
      const res = await fetchWithTimeout(`${ROUTE_PREFIX}/analytics?${query}`, { cache: 'no-store' })
      const json = await res.json().catch(() => ({}))
      if (!res.ok || !json.ok) throw new Error(json.error || `HTTP ${res.status}`)
      setAnalytics(json)
    } catch (e) {
      setErr(String(e?.message || e))
    } finally {
      setAnalyticsLoading(false)
    }
  }, [groupBy, analyticsDays, heatmapModel])

  React.useEffect(() => {
    if (open) loadData()
  }, [open, loadData])

  React.useEffect(() => {
    if (open && (panel || tab === 'analytics')) loadAnalytics(groupBy, analyticsDays, heatmapModel)
  }, [open, panel, tab, groupBy, analyticsDays, heatmapModel, loadAnalytics])

  React.useEffect(() => {
    if (!open) return undefined
    let timer = null
    const tick = () => {
      loadData()
      if (panel || tab === 'analytics') loadAnalytics(groupBy, analyticsDays, heatmapModel)
      timer = setTimeout(tick, 120000)
    }
    timer = setTimeout(tick, 120000)
    return () => { if (timer) clearTimeout(timer) }
  }, [open, panel, tab, groupBy, analyticsDays, heatmapModel, loadData, loadAnalytics])

  if (!open) return null

  function fmtTokens(value) {
    const n = Number(value) || 0
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`
    return String(n)
  }

  function fmtCost(value) {
    const n = Number(value) || 0
    if (n === 0) return '$0'
    if (n < 0.0001) return '< $0.0001'
    return `$${n.toFixed(4)}`
  }

  function fmtMs(value) {
    const n = Number(value) || 0
    return n > 0 ? `${Math.round(n)} ms` : '—'
  }

  const plan = data?.plan || status?.config?.defaultModel || 'ClinePass'
  const email = data?.user?.email || ''
  const activeAcc = status?.config?.activeAccount || t('dashboard.auto_account')
  const enabledCount = status?.config?.enabledModels?.length || 0
  const routingMode = status?.config?.accountMode === 'round_robin' ? t('accounts.mode_round_robin') : t('accounts.mode_least_used')
  const accountEntries = Array.isArray(accountsUsage?.accounts) ? accountsUsage.accounts : []
  const selectedEntry = accountEntries.find((entry) => entry.apiKeyEnv === selectedAccount)
    || accountEntries.find((entry) => entry.active)
    || accountEntries[0]
  const selectedUsage = selectedEntry?.usage || data
  const accountPlan = selectedUsage?.plan || plan
  const accountEmail = selectedUsage?.user?.email || email
  const accountName = selectedEntry?.label || selectedEntry?.apiKeyEnv || accountPlan
  const accountBadges = []
  if (selectedEntry) {
    accountBadges.push(selectedEntry.configured === false
      ? { className: 'cb-badge cb-badge-warn', label: t('accounts.missing_key') }
      : { className: 'cb-badge cb-badge-ok', label: t('accounts.configured') })
    if (selectedEntry.active) accountBadges.push({ className: 'cb-badge cb-badge-ok', label: t('accounts.active_badge') })
    if (selectedEntry.isPinned) accountBadges.push({ className: 'cb-badge', label: t('accounts.pinned_badge') })
  }
  const accountTabs = accountEntries.length > 1
    ? React.createElement(
        'div',
        { className: 'cb-account-tabs' },
        accountEntries.map((entry) => React.createElement(
          'button',
          {
            type: 'button',
            key: entry.apiKeyEnv || entry.id,
            className: entry.apiKeyEnv === selectedEntry?.apiKeyEnv ? 'cb-account-tab cb-account-tab-active' : 'cb-account-tab',
            onClick: () => setSelectedAccount(entry.apiKeyEnv),
          },
          entry.label || entry.apiKeyEnv || entry.id
        ))
      )
    : null

  const noticeItems = []
  if (status?.key && status.key.present === false) {
    noticeItems.push(React.createElement(
      'div',
      { className: 'cb-notice', key: 'no-key' },
      React.createElement('div', { className: 'cb-notice-title' }, t('analytics.no_key')),
      React.createElement('div', { className: 'cb-notice-hint' }, t('analytics.no_key_hint'))
    ))
  }
  if (status?.health && status.health.ok === false) {
    noticeItems.push(React.createElement(
      'div',
      { className: 'cb-notice cb-notice-error', key: 'health' },
      React.createElement('div', { className: 'cb-notice-title' }, t('analytics.health_error')),
      React.createElement('div', { className: 'cb-notice-hint' }, status.health.error || '')
    ))
  }
  if (status && status.isRegistered === false) {
    noticeItems.push(React.createElement(
      'div',
      { className: 'cb-notice', key: 'not-registered' },
      React.createElement('div', { className: 'cb-notice-title' }, t('analytics.not_registered')),
      React.createElement('div', { className: 'cb-notice-hint' }, t('analytics.not_registered_hint'))
    ))
  }
  const notices = noticeItems.length
    ? React.createElement(React.Fragment, null, ...noticeItems)
    : null
  const errorNotice = err
    ? React.createElement('div', { className: data ? 'cb-hint' : 'cb-alert-bad' }, data ? `${t('analytics.stale')} ${err}` : err)
    : null
  const totals = analytics?.totals
  const secondaryTiles = totals
    ? [
        [t('analytics.input'), fmtTokens(totals.promptTokens)],
        [t('analytics.output'), fmtTokens(totals.completionTokens)],
        [t('analytics.reasoning'), fmtTokens(totals.reasoningTokens)],
        [t('analytics.cache_read'), fmtTokens(totals.cacheReadTokens)],
        [t('analytics.cache_write'), fmtTokens(totals.cacheWriteTokens)],
        [t('analytics.avg_ttft'), fmtMs(totals.avgTtftMs)],
        [t('analytics.avg_latency'), fmtMs(totals.avgLatencyMs)],
        [t('analytics.errors'), String(Math.round(Number(totals.failed) || 0))],
      ]
    : []

  const tabs = React.createElement(
    'div',
    { className: 'cb-tabs' },
    React.createElement(
      'button',
      { type: 'button', className: tab === 'quota' ? 'cb-tab cb-tab-active' : 'cb-tab', onClick: () => setTab('quota') },
      t('dashboard.tab_quota')
    ),
    React.createElement(
      'button',
      { type: 'button', className: tab === 'analytics' ? 'cb-tab cb-tab-active' : 'cb-tab', onClick: () => setTab('analytics') },
      t('dashboard.tab_analytics')
    )
  )

  const quotaBody = React.createElement(QuotaPanelView, {
    accountTabs,
    selectedUsage,
    accountName,
    accountEmail,
    accountPlan,
    accountBadges,
    activeAcc,
    routingMode,
    enabledCount,
    t,
  })

  const analyticsBody = React.createElement(
    'div',
    { className: 'cb-dialogCard' },
    React.createElement(
      'div',
      { className: 'cb-dialogRow' },
      React.createElement('div', { className: 'cb-section-title' }, t('analytics.title')),
      React.createElement(
        'div',
        { className: 'cb-analytics-controls' },
        React.createElement(
          'select',
          {
            className: 'cb-heat-select',
            value: String(analyticsDays),
            title: t('analytics.range'),
            onChange: (event) => setAnalyticsDays(Number(event.target.value)),
          },
          React.createElement('option', { value: '7' }, t('analytics.range_7')),
          React.createElement('option', { value: '30' }, t('analytics.range_30')),
          React.createElement('option', { value: '90' }, t('analytics.range_90'))
        ),
        React.createElement(
          'div',
          { className: 'cb-seg' },
          ['model', 'day', 'session'].map((group) => React.createElement(
            'button',
            {
              key: group,
              type: 'button',
              className: groupBy === group ? 'cb-seg-item cb-seg-item-active' : 'cb-seg-item',
              onClick: () => setGroupBy(group),
            },
            t(`analytics.group_${group}`)
          ))
        )
      )
    ),
    analytics?.totals
      ? React.createElement(
          'div',
          { className: 'cb-dialogTiles' },
          React.createElement(
            'div',
            { className: 'cb-stat-box' },
            React.createElement('div', { className: 'cb-stat-val' }, String(analytics.totals.requests || 0)),
            React.createElement('div', { className: 'cb-stat-lbl' }, t('analytics.requests'))
          ),
          React.createElement(
            'div',
            { className: 'cb-stat-box' },
            React.createElement('div', { className: 'cb-stat-val' }, fmtTokens(analytics.totals.totalTokens)),
            React.createElement('div', { className: 'cb-stat-lbl' }, t('analytics.tokens'))
          ),
          React.createElement(
            'div',
            { className: 'cb-stat-box' },
            React.createElement('div', { className: 'cb-stat-val' }, `≈ ${fmtCost(analytics.totals.costUsd)}`),
            React.createElement('div', { className: 'cb-stat-lbl' }, t('analytics.cost'))
          ),
          React.createElement(
            'div',
            { className: 'cb-stat-box' },
            React.createElement('div', { className: 'cb-stat-val' }, `${Math.round(analytics.totals.successRate || 0)}%`),
            React.createElement('div', { className: 'cb-stat-lbl' }, t('analytics.success'))
          )
        )
      : null,
    secondaryTiles.length
      ? React.createElement(
          'div',
          { className: 'cb-dialogTiles' },
          secondaryTiles.map(([label, value]) => React.createElement(
            'div',
            { className: 'cb-stat-box', key: label },
            React.createElement('div', { className: 'cb-stat-val' }, value),
            React.createElement('div', { className: 'cb-stat-lbl' }, label)
          ))
        )
      : null,
    analyticsLoading
      ? React.createElement('div', { className: 'cb-hint' }, t('analytics.loading'))
      : analytics?.groups?.length
        ? React.createElement(
            'div',
            { className: 'cb-analytics-list' },
            React.createElement(
              'div',
              { className: 'cb-analytics-head' },
              React.createElement('span', null, analytics.groupBy || groupBy),
              React.createElement('span', null, t('analytics.requests')),
              React.createElement('span', null, t('analytics.tokens')),
              React.createElement('span', null, t('analytics.cost')),
              React.createElement('span', null, t('analytics.ttft'))
            ),
            analytics.groups.map((group) => React.createElement(
              'div',
              { className: 'cb-analytics-row', key: group.key },
              React.createElement('span', { className: 'cb-mono' }, group.label || group.key),
              React.createElement('span', null, String(group.requests || 0)),
              React.createElement('span', null, fmtTokens(group.totalTokens)),
              React.createElement('span', null, `≈ ${fmtCost(group.costUsd)}`),
              React.createElement('span', null, group.avgTtftMs ? `${Math.round(group.avgTtftMs)} ms` : '—')
            ))
          )
        : React.createElement('div', { className: 'cb-empty' }, t('analytics.no_data')),
    analytics?.unpriced > 0
      ? React.createElement('div', { className: 'cb-hint' }, t('analytics.unpriced', { count: analytics.unpriced }))
      : null
  )

  const heatmapCard = React.createElement(
    'div',
    { className: 'cb-dialogCard' },
    React.createElement('div', { className: 'cb-section-title' }, t('analytics.heatmap')),
    React.createElement('div', { className: 'cb-section-desc' }, t('analytics.heatmap_hint')),
    React.createElement(HeatmapView, {
      heatmap: analytics?.heatmap,
      model: heatmapModel,
      onModelChange: setHeatmapModel,
      t,
    })
  )

  const panelBody = React.createElement(
    'div',
    { className: 'cb-panel' },
    React.createElement(
      'div',
      { className: 'cb-panel-head' },
      React.createElement(
        'div',
        { className: 'cb-panel-identity' },
        React.createElement('div', { className: 'cb-panel-title' }, t('dashboard.title')),
        React.createElement('div', { className: 'cb-panel-sub' }, t('dashboard.subtitle'))
      ),
      React.createElement(
        'div',
        { className: 'cb-panel-actions' },
        updatedAt ? React.createElement('span', { className: 'cb-panel-updated' }, `${t('dashboard.updated_at')} ${updatedAt}`) : null,
        React.createElement(
          'button',
          {
            type: 'button',
            className: 'cb-btn',
            disabled: loading || analyticsLoading,
            onClick: () => { loadData(); loadAnalytics(groupBy) },
          },
          (loading || analyticsLoading) ? t('dashboard.refreshing') : t('dashboard.refresh')
        ),
        React.createElement(
          'button',
          {
            type: 'button',
            className: 'cb-panel-close',
            'aria-label': t('dashboard.close'),
            title: t('dashboard.close'),
            onClick: onClose,
          },
          '×'
        )
      )
    ),
    notices,
    errorNotice,
    quotaBody,
    analyticsBody,
    heatmapCard
  )

  const body = React.createElement(
    'div',
    { className: 'cb-dialog' },
    React.createElement(
      'div',
      { className: 'cb-dialogMeta' },
      updatedAt ? React.createElement('span', null, `${t('dashboard.updated_at')} ${updatedAt}`) : null,
      React.createElement('span', { className: 'cb-settings-spacer' }),
      React.createElement(
        'button',
        { type: 'button', className: 'cb-btn', disabled: loading || analyticsLoading, onClick: () => (tab === 'quota' ? loadData() : loadAnalytics(groupBy)) },
        (loading || analyticsLoading) ? t('dashboard.refreshing') : t('dashboard.refresh')
      )
    ),
    tabs,
    notices,
    errorNotice,
    tab === 'quota'
      ? quotaBody
      : React.createElement(React.Fragment, null, analyticsBody, heatmapCard)
  )

  if (panel) return panelBody

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

  return React.createElement(
    'div',
    { className: 'cb-dialogFallback', role: 'dialog', 'aria-label': t('dashboard.title'), onClick: onClose },
    React.createElement(
      'div',
      { className: 'cb-dialogFallbackPanel', onClick: (event) => event.stopPropagation() },
      React.createElement(
        'div',
        { className: 'cb-dialogMeta' },
        React.createElement('span', { className: 'cb-row-title' }, t('dashboard.title')),
        React.createElement('span', { className: 'cb-settings-spacer' }),
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
