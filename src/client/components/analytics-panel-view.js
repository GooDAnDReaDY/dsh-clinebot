function AnalyticsPanelView({
  analytics,
  totals,
  secondaryTiles,
  analyticsLoading,
  analyticsDays,
  setAnalyticsDays,
  groupBy,
  setGroupBy,
  analyticsModel,
  setAnalyticsModel,
  analyticsAccount,
  setAnalyticsAccount,
  analyticsErrorsOnly,
  setAnalyticsErrorsOnly,
  analyticsFrom,
  setAnalyticsFrom,
  analyticsTo,
  setTo,
  status,
  heatmapModel,
  setHeatmapModel,
  selectedHeat,
  setSelectedHeat,
  t,
}) {
  const analyticsBody = React.createElement(
    'div',
    { className: 'cb-dialogCard' },
    React.createElement(
      'div',
      { className: 'cb-dialogRow' },
      React.createElement('div', { className: 'cb-section-title' }, t('analytics.title')),
      React.createElement(AnalyticsControls, {
        analyticsDays,
        setAnalyticsDays,
        groupBy,
        setGroupBy,
        model: analyticsModel,
        setModel: setAnalyticsModel,
        account: analyticsAccount,
        setAccount: setAnalyticsAccount,
        errorsOnly: analyticsErrorsOnly,
        setErrorsOnly: setAnalyticsErrorsOnly,
        from: analyticsFrom,
        setFrom: setAnalyticsFrom,
        to: analyticsTo,
        setTo,
        models: status?.availableModels || [],
        accounts: status?.accounts || [],
        t,
      })
    ),
    React.createElement(
      'div',
      { className: 'cb-row', style: { gap: '6px', marginBottom: '8px' } },
      React.createElement(
        'a',
        { href: '/dsh-clinebot/stats/export?format=json', download: 'clinebot-stats.json', className: 'cb-btn cb-btn-link' },
        t('stats.export_json')
      ),
      React.createElement(
        'a',
        { href: '/dsh-clinebot/stats/export', download: 'clinebot-stats.csv', className: 'cb-btn cb-btn-link' },
        t('stats.export_csv')
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
      selected: selectedHeat,
      onSelect: (cell) => setSelectedHeat((current) => (
        current && current.day === cell.day && current.hour === cell.hour ? null : cell
      )),
      t,
    }),
    selectedHeat
      ? React.createElement('div', { className: 'cb-hint' }, t('analytics.heatmap_selected', {
          day: selectedHeat.label,
          hour: String(selectedHeat.hour).padStart(2, '0'),
          count: selectedHeat.value,
        }))
      : null
  )

  return React.createElement(React.Fragment, null, analyticsBody, heatmapCard)
}
