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
    { className: 'cb-progress-card' },
    React.createElement(
      'div',
      { className: 'cb-progress-head' },
      React.createElement('span', { className: 'cb-progress-label' }, label),
      React.createElement(
        'span',
        { className: 'cb-progress-meta' },
        t('quota.used', { pct }),
        resetLabel ? ` · ${t('quota.reset_at', { time: resetLabel })}` : ''
      )
    ),
    React.createElement(
      'div',
      { className: 'cb-progress-track' },
      React.createElement('div', {
        className: barClass,
        style: { width: `${pct}%` },
      })
    )
  )
}
