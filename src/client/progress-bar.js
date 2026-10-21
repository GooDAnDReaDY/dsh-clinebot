function formatResetCountdown(isoString) {
  if (!isoString) return ''
  try {
    const d = new Date(isoString)
    const diff = d.getTime() - Date.now()
    if (Number.isNaN(diff)) return ''
    if (diff <= 0) return 'resetting'
    const totalHours = Math.floor(diff / (1000 * 60 * 60))
    const days = Math.floor(totalHours / 24)
    const hours = totalHours % 24
    if (days > 0) {
      return `${days}d ${hours}h`
    }
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))
    if (hours > 0) {
      return `${hours}h ${minutes}m`
    }
    return `${Math.max(1, minutes)}m`
  } catch {
    return ''
  }
}

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

function formatForecastDuration(ms) {
  const totalMinutes = Math.max(1, Math.round(Number(ms) / 60000))
  const days = Math.floor(totalMinutes / 1440)
  const hours = Math.floor((totalMinutes % 1440) / 60)
  const minutes = totalMinutes % 60
  if (days > 0) return `${days}d ${hours}h`
  if (hours > 0) return `${hours}h ${minutes}m`
  return `${minutes}m`
}

function quotaForecast(window, windowMs, t) {
  const used = Number(window?.percentUsed)
  const remaining = Number.isFinite(Number(window?.remainingPercent))
    ? Number(window.remainingPercent)
    : 100 - used
  const resetAt = new Date(window?.resetsAt).getTime()
  const span = Number(windowMs)
  if (!Number.isFinite(used) || !Number.isFinite(resetAt) || !Number.isFinite(span) || span <= 0) return ''
  const untilReset = resetAt - Date.now()
  if (untilReset <= 0) return ''
  if (remaining <= 0) return t('quota.forecast_exhausted')
  if (used <= 0) return t('quota.forecast_no_usage')
  const elapsed = Math.max(1, span - untilReset)
  const burnPerMs = used / elapsed
  if (!Number.isFinite(burnPerMs) || burnPerMs <= 0) return ''
  const etaMs = remaining / burnPerMs
  if (!Number.isFinite(etaMs) || etaMs <= 0) return ''
  if (etaMs >= untilReset) return t('quota.forecast_holds')
  return t('quota.forecast_left', { time: formatForecastDuration(etaMs) })
}

function ProgressBar({ label, percentUsed, remainingPercent, resetsAt, windowMs, t }) {
  const pct = Math.max(0, Math.min(100, Math.round(percentUsed || 0)))
  const isWarn = pct >= 80 && pct < 90
  const isBad = pct >= 90
  const barClass = isBad ? 'cb-progress-bar-bad' : isWarn ? 'cb-progress-bar-warn' : 'cb-progress-bar-fill'
  const resetCountdown = formatResetCountdown(resetsAt)
  const resetClock = formatResetTime(resetsAt)
  const forecast = windowMs ? quotaForecast({ percentUsed, remainingPercent, resetsAt }, windowMs, t) : ''

  return React.createElement(
    'div',
    { className: isBad ? 'cb-progress-card cb-progress-card-bad' : 'cb-progress-card' },
    React.createElement(
      'div',
      { className: 'cb-progress-head' },
      React.createElement(
        'span',
        { className: 'cb-progress-label' },
        label,
        isBad
          ? React.createElement(
              'span',
              { className: 'cb-progress-low' },
              React.createElement(CbIcon, { name: 'warning', size: 12 }),
              '<10%'
            )
          : null
      ),
      React.createElement(
        'span',
        { className: isBad ? 'cb-progress-meta cb-progress-meta-bad' : 'cb-progress-meta' },
        t('quota.used', { pct }),
        resetCountdown
          ? ` · ${resetCountdown === 'resetting' ? (t('quota.resetting') || '正在重置') : t('quota.countdown', { time: resetCountdown })}`
          : (resetClock ? ` · ${t('quota.reset_at', { time: resetClock })}` : '')
      )
    ),
    React.createElement(
      'div',
      { className: 'cb-progress-track' },
      React.createElement('div', { className: barClass, style: { width: `${pct}%` } })
    ),
    forecast ? React.createElement('div', { className: 'cb-progress-forecast' }, forecast) : null
  )
}
