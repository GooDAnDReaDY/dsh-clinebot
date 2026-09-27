function StatsSection({ status, onResetStats, busy, t }) {
  const [confirmReset, setConfirmReset] = React.useState(false)

  const s = status?.statsSummary || {}
  const sess = status?.sessionStats || {}

  const topModels = Object.entries(s.byModel || {})
    .sort((a, b) => (b[1].tokens || 0) - (a[1].tokens || 0))
    .slice(0, 5)

  return React.createElement(
    'div',
    { className: 'cb-section-card' },
    React.createElement(
      'div',
      { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' } },
      React.createElement('div', { className: 'cb-section-title' }, t('stats.title')),
      React.createElement(
        'div',
        null,
        confirmReset
          ? React.createElement(
              React.Fragment,
              null,
              React.createElement(
                'button',
                {
                  type: 'button',
                  className: 'cb-btn cb-btn-warn',
                  style: { padding: '2px 8px', fontSize: '11px', marginRight: '6px' },
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
                {
                  type: 'button',
                  className: 'cb-btn',
                  style: { padding: '2px 8px', fontSize: '11px' },
                  onClick: () => setConfirmReset(false),
                },
                t('stats.cancel_reset')
              )
            )
          : React.createElement(
              'button',
              {
                type: 'button',
                className: 'cb-btn',
                style: { padding: '2px 8px', fontSize: '11px' },
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
      { className: 'cb-grid-2', style: { marginTop: '12px' } },
      React.createElement(
        'div',
        { className: 'cb-stat-box' },
        React.createElement('div', { className: 'cb-stat-val' }, `${s.requests || 0} (${sess.successfulRequests || 0} sess)`),
        React.createElement('div', { className: 'cb-stat-lbl' }, t('stats.requests'))
      ),
      React.createElement(
        'div',
        { className: 'cb-stat-box' },
        React.createElement('div', { className: 'cb-stat-val' }, `${Number(s.totalTokens || 0).toLocaleString()}`),
        React.createElement('div', { className: 'cb-stat-lbl' }, t('stats.tokens'))
      ),
      React.createElement(
        'div',
        { className: 'cb-stat-box' },
        React.createElement('div', { className: 'cb-stat-val' }, `${s.errors429 || 0}`),
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
          { style: { marginTop: '14px' } },
          React.createElement('div', { style: { fontSize: '12px', fontWeight: 500, marginBottom: '6px', color: 'var(--dsw-alias-label-secondary)' } }, t('stats.top_models')),
          React.createElement(
            'div',
            { style: { display: 'flex', flexDirection: 'column', gap: '4px' } },
            topModels.map(([modId, data]) =>
              React.createElement(
                'div',
                {
                  key: modId,
                  style: {
                    display: 'flex',
                    justifyContent: 'space-between',
                    fontSize: '11px',
                    padding: '4px 8px',
                    background: 'var(--dsw-alias-bg-layer-2)',
                    borderRadius: '4px',
                  },
                },
                React.createElement('span', { style: { fontFamily: 'monospace' } }, modId),
                React.createElement('span', null, `${data.requests || 0} reqs · ${Number(data.tokens || 0).toLocaleString()} tok`)
              )
            )
          )
        )
      : null
  )
}
