/**
 * Weekday × hour request heatmap, matching the reference providers: seven rows
 * (Mon–Sun), 24 columns, a peak-hour line and a compact by-hour strip. The
 * model selector re-fetches the same range for one model.
 */
function heatWeekdayLabels() {
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(2024, 0, 1 + index)
    return date.toLocaleDateString(undefined, { weekday: 'short' })
  })
}

function heatHourLabel(hour) {
  return hour % 3 === 0 ? String(hour).padStart(2, '0') : ''
}

function HeatmapView({ heatmap, model, onModelChange, onSelect, selected, t }) {
  if (!heatmap || !Array.isArray(heatmap.grid)) {
    return React.createElement('div', { className: 'cb-hint' }, t('analytics.heatmap_empty'))
  }

  const grid = heatmap.grid
  const hours = Array.isArray(heatmap.hours) ? heatmap.hours : Array(24).fill(0)
  const total = Number(heatmap.total) || 0
  const models = Array.isArray(heatmap.models) ? heatmap.models : []
  const max = Math.max(1, ...grid.flat())
  const maxHours = Math.max(1, ...hours)
  const peakHour = hours.reduce((best, value, hour) => (value > (hours[best] || 0) ? hour : best), 0)
  const peak = hours[peakHour] || 0
  const level = (value) => {
    const requests = Number(value) || 0
    if (requests <= 0) return 0
    return Math.min(4, Math.max(1, Math.ceil((requests / max) * 4)))
  }
  const weekdays = heatWeekdayLabels()

  return React.createElement(
    'div',
    { className: 'cb-heat-wrap' },
    React.createElement(
      'div',
      { className: 'cb-heat-toolbar' },
      React.createElement('span', { className: 'cb-badge' }, `${total} ${t('analytics.requests')}`),
      models.length > 1
        ? React.createElement(
            'select',
            {
              className: 'cb-heat-select',
              value: model || '',
              title: t('analytics.heatmap_model'),
              onChange: (event) => onModelChange && onModelChange(event.target.value),
            },
            React.createElement('option', { value: '' }, `${t('analytics.heatmap_all_models')} (${total})`),
            models.map((entry) => React.createElement(
              'option',
              { key: entry.model, value: entry.model },
              `${entry.model} (${entry.total})`
            ))
          )
        : null,
      peak > 0
        ? React.createElement('span', { className: 'cb-hint' }, `${t('analytics.heatmap_peak')}: ${String(peakHour).padStart(2, '0')}:00 · ${peak}`)
        : null
    ),
    React.createElement(
      'div',
      { className: 'cb-heat-scroll' },
      React.createElement(
        'div',
        { className: 'cb-heat' },
        React.createElement('span', { className: 'cb-heat-corner' }),
        hours.map((_, hour) => React.createElement(
          'span',
          { className: 'cb-heat-hour', key: `hour-${hour}` },
          heatHourLabel(hour)
        )),
        weekdays.map((label, day) => React.createElement(
          React.Fragment,
          { key: `day-${day}` },
          React.createElement('span', { className: 'cb-heat-day' }, label),
          (grid[day] || []).map((value, hour) => React.createElement('button', {
            key: `cell-${day}-${hour}`,
            type: 'button',
            className: `cb-heat-cell cb-heat-l${level(value)}${selected?.day === day && selected?.hour === hour ? ' cb-heat-selected' : ''}`,
            title: `${label} ${String(hour).padStart(2, '0')}:00 — ${value} ${t('analytics.requests')}`,
            'aria-label': `${label} ${String(hour).padStart(2, '0')}:00 — ${value}`,
            'aria-pressed': selected?.day === day && selected?.hour === hour,
            onClick: () => onSelect && onSelect({ day, hour, value, label }),
          }))
        ))
      ),
      React.createElement('p', { className: 'cb-hour-strip-head' }, t('analytics.heatmap_by_hour')),
      React.createElement(
        'div',
        { className: 'cb-hour-strip' },
        React.createElement('span'),
        hours.map((value, hour) => React.createElement(
          'span',
          { className: 'cb-hour-col', key: `strip-${hour}`, title: `${String(hour).padStart(2, '0')}:00 — ${value}` },
          React.createElement('span', {
            className: `cb-hour-bar cb-heat-l${level(value)}`,
            style: { height: `${Math.max(2, Math.round(28 * (Number(value) || 0) / maxHours))}px` },
          })
        ))
      ),
      React.createElement(
        'div',
        { className: 'cb-hour-labels' },
        React.createElement('span'),
        hours.map((_, hour) => React.createElement('span', { key: `label-${hour}` }, heatHourLabel(hour)))
      )
    ),
    React.createElement(
      'div',
      { className: 'cb-heat-legend' },
      React.createElement('span', null, t('analytics.heatmap_less')),
      [0, 1, 2, 3, 4].map((bucket) => React.createElement('span', {
        key: bucket,
        className: `cb-heat-swatch cb-heat-l${bucket}`,
      })),
      React.createElement('span', null, t('analytics.heatmap_more'))
    ),
    total === 0
      ? React.createElement('div', { className: 'cb-hint' }, t('analytics.heatmap_empty'))
      : null
  )
}
