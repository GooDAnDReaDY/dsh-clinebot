function StatsSection({ status, onResetStats, busy, t }) {
  const [confirmReset, setConfirmReset] = React.useState(false)

  const s = status?.statsSummary || {}
  const totals = s.totals || {}
  const sess = status?.sessionStats || {}

  const requests = typeof totals.requests === 'number' ? totals.requests : (typeof s.requests === 'number' ? s.requests : 0)
  const totalTokens = typeof totals.totalTokens === 'number' ? totals.totalTokens : (typeof s.totalTokens === 'number' ? s.totalTokens : 0)
  const errors429 = typeof totals.rateLimited429 === 'number' ? totals.rateLimited429 : (typeof s.errors429 === 'number' ? s.errors429 : (typeof totals.failed === 'number' ? totals.failed : 0))
  const reasoning = Number(totals.reasoningTokens || sess.reasoningTokensEst || 0)

  const topModels = Object.entries(s.byModel || {})
    .sort((a, b) => {
      const bTokens = Number(b[1]?.totalTokens ?? b[1]?.tokens ?? 0)
      const aTokens = Number(a[1]?.totalTokens ?? a[1]?.tokens ?? 0)
      return bTokens - aTokens
    })
    .slice(0, 5)

  return React.createElement(
    'section',
    { className: 'cb-section-card' },
    React.createElement(
      'div',
      { className: 'cb-section-head' },
      React.createElement('div', { className: 'cb-section-title' }, t('stats.title')),
      React.createElement(
        'div',
        { className: 'cb-section-actions' },
        React.createElement(
          'a',
          {
            href: '/dsh-clinebot/stats/export?format=json',
            download: 'clinebot-stats.json',
            className: 'cb-btn cb-btn-link',
          },
          React.createElement(CbIcon, { name: 'download', size: 13 }),
          ` ${t('stats.export_json')}`
        ),
        React.createElement(
          'a',
          {
            href: '/dsh-clinebot/stats/export',
            download: 'clinebot-stats.csv',
            className: 'cb-btn cb-btn-link',
          },
          React.createElement(CbIcon, { name: 'download', size: 13 }),
          ` ${t('stats.export_csv')}`
        ),
        confirmReset
          ? React.createElement(
              React.Fragment,
              null,
              React.createElement(
                'button',
                {
                  type: 'button',
                  className: 'cb-btn cb-btn-warn',
                  disabled: !!busy,
                  onClick: () => {
                    setConfirmReset(false)
                    if (typeof onResetStats === 'function') onResetStats()
                  },
                },
                t('stats.confirm_reset')
              ),
              React.createElement(
                'button',
                { type: 'button', className: 'cb-btn', onClick: () => setConfirmReset(false) },
                t('stats.cancel_reset')
              )
            )
          : React.createElement(
              'button',
              {
                type: 'button',
                className: 'cb-btn',
                disabled: !!busy,
                onClick: () => setConfirmReset(true),
              },
              t('stats.reset_btn')
            )
      )
    ),
    React.createElement('div', { className: 'cb-section-desc' }, t('stats.desc')),
    React.createElement(
      'div',
      { className: 'cb-stats-grid' },
      React.createElement(
        'div',
        { className: 'cb-stat-box' },
        React.createElement('div', { className: 'cb-stat-val' }, `${requests} (${sess.successfulRequests || 0} sess)`),
        React.createElement('div', { className: 'cb-stat-lbl' }, t('stats.requests'))
      ),
      React.createElement(
        'div',
        { className: 'cb-stat-box' },
        React.createElement('div', { className: 'cb-stat-val' }, Number(totalTokens).toLocaleString()),
        React.createElement(
          'div',
          { className: 'cb-stat-lbl' },
          reasoning > 0
            ? `${t('stats.tokens')} (${reasoning.toLocaleString()} reasoning)`
            : t('stats.tokens')
        )
      ),
      React.createElement(
        'div',
        { className: 'cb-stat-box' },
        React.createElement('div', { className: 'cb-stat-val' }, `${errors429}`),
        React.createElement('div', { className: 'cb-stat-lbl' }, t('stats.errors429'))
      ),
      React.createElement(
        'div',
        { className: 'cb-stat-box' },
        React.createElement('div', { className: 'cb-stat-val' }, sess.lastLatencyMs ? `${sess.lastLatencyMs} ms` : '—'),
        React.createElement('div', { className: 'cb-stat-lbl' }, t('stats.latency'))
      )
    ),
    topModels.length > 0
      ? React.createElement(
          'div',
          { className: 'cb-model-list' },
          React.createElement('div', { className: 'cb-model-list-title' }, t('stats.top_models')),
          topModels.map(([modelId, data]) => React.createElement(
            'div',
            { className: 'cb-model-row', key: modelId },
            React.createElement('span', { className: 'cb-mono' }, modelId),
            React.createElement(
              'span',
              { className: 'cb-muted' },
              `${data.requests || 0} reqs · ${Number(data.totalTokens ?? data.tokens ?? 0).toLocaleString()} tok${data.reasoningTokens ? ` (${Number(data.reasoningTokens).toLocaleString()} reasoning)` : ''}`
            )
          ))
        )
      : null
  )
}
