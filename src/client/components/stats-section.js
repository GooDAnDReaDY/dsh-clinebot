function StatsSection({ status, t }) {
  return React.createElement(
    'div',
    { className: 'cb-section-card' },
    React.createElement('div', { className: 'cb-section-title' }, t('stats.title')),
    React.createElement('div', { className: 'cb-section-desc' }, t('stats.desc')),
    React.createElement(
      'div',
      { className: 'cb-grid-2' },
      React.createElement(
        'div',
        { className: 'cb-stat-box' },
        React.createElement('div', { className: 'cb-stat-val' }, `${status.sessionStats?.successfulRequests || 0} / ${status.sessionStats?.totalRequests || 0}`),
        React.createElement('div', { className: 'cb-stat-lbl' }, t('stats.requests'))
      ),
      React.createElement(
        'div',
        { className: 'cb-stat-box' },
        React.createElement('div', { className: 'cb-stat-val' }, `~${status.sessionStats?.totalTokensEst || 0}`),
        React.createElement('div', { className: 'cb-stat-lbl' }, t('stats.tokens'))
      ),
      React.createElement(
        'div',
        { className: 'cb-stat-box' },
        React.createElement('div', { className: 'cb-stat-val' }, status.sessionStats?.lastLatencyMs ? `${status.sessionStats.lastLatencyMs} ms` : '—'),
        React.createElement('div', { className: 'cb-stat-lbl' }, t('stats.latency'))
      ),
      React.createElement(
        'div',
        { className: 'cb-stat-box' },
        React.createElement('div', { className: 'cb-stat-val' }, status.sessionStats?.lastRequestAt ? new Date(status.sessionStats.lastRequestAt).toLocaleTimeString() : '—'),
        React.createElement('div', { className: 'cb-stat-lbl' }, t('stats.last_req'))
      )
    )
  )
}
