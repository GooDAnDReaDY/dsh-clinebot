function formatResetTime(isoString) {
  if (!isoString) return ''
  try {
    const d = new Date(isoString)
    if (Number.isNaN(d.getTime())) return ''
    return d.toLocaleTimeString()
  } catch {
    return ''
  }
}

function ProgressBar({ label, percentUsed, remainingPercent, resetsAt, t }) {
  const pct = Math.max(0, Math.min(100, Math.round(percentUsed || 0)))
  const isWarn = pct >= 80 && pct < 95
  const isBad = pct >= 95
  const barClass = isBad ? 'cb-progress-bar-bad' : isWarn ? 'cb-progress-bar-warn' : 'cb-progress-bar-fill'
  const resetLabel = formatResetTime(resetsAt)

  return React.createElement(
    'div',
    {
      className: 'cb-progress-card cb-bar-container',
      style: {
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
        padding: '12px 14px',
        borderRadius: '8px',
        border: '1px solid var(--dsw-alias-border-l2)',
        background: 'var(--dsw-alias-bg-layer-2)',
      },
    },
    React.createElement(
      'div',
      {
        className: 'cb-progress-head cb-bar-head',
        style: {
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          gap: '16px',
          width: '100%',
        },
      },
      React.createElement('span', { className: 'cb-progress-label', style: { fontWeight: 500, whiteSpace: 'nowrap' } }, label),
      React.createElement(
        'span',
        {
          className: 'cb-progress-meta cb-bar-meta',
          style: {
            fontSize: '12px',
            color: 'var(--dsw-alias-label-secondary)',
            whiteSpace: 'nowrap',
            marginLeft: 'auto',
          },
        },
        t('quota.used', { pct }),
        resetLabel ? ` · ${t('quota.reset_at', { time: resetLabel })}` : ''
      )
    ),
    React.createElement(
      'div',
      {
        className: 'cb-progress-track cb-bar-track',
        style: {
          width: '100%',
          height: '8px',
          borderRadius: '999px',
          background: 'var(--dsw-alias-bg-layer-1)',
          overflow: 'hidden',
          border: '1px solid var(--dsw-alias-border-l2)',
        },
      },
      React.createElement('div', {
        className: barClass,
        style: { width: `${pct}%`, height: '100%', borderRadius: '999px' },
      })
    )
  )
}
