/**
 * Per-model price overrides. A blank field falls back to the built-in local
 * estimate; the values are USD per 1M tokens.
 */
function PriceSection({ modelsList = [], priceOverrides = {}, onConfigUpdate, t }) {
  const [expanded, setExpanded] = React.useState(false)
  const models = Array.isArray(modelsList) ? modelsList : []

  const update = (modelId, field, raw) => {
    const next = { ...(priceOverrides || {}) }
    const current = { ...(next[modelId] || {}) }
    const value = String(raw ?? '').trim()
    const numeric = Number(value)
    if (value === '' || !Number.isFinite(numeric) || numeric < 0) delete current[field]
    else current[field] = numeric
    if (Object.keys(current).length === 0) delete next[modelId]
    else next[modelId] = current
    onConfigUpdate({ priceOverrides: next })
  }

  return React.createElement(
    'div',
    { className: 'cb-price-section' },
    React.createElement(
      'div',
      { className: 'cb-price-head' },
      React.createElement(
        'div',
        { className: 'cb-price-copy' },
        React.createElement('div', { className: 'cb-section-title' }, t('prices.title')),
        React.createElement('div', { className: 'cb-section-desc' }, t('prices.desc'))
      ),
      React.createElement(
        'button',
        { type: 'button', className: 'cb-btn', onClick: () => setExpanded((value) => !value) },
        expanded ? t('prices.hide') : t('prices.show')
      )
    ),
    expanded
      ? React.createElement(
          'div',
          { className: 'cb-price-table' },
          React.createElement(
            'div',
            { className: 'cb-price-head-row' },
            React.createElement('span', null, t('prices.model')),
            React.createElement('span', null, t('prices.input')),
            React.createElement('span', null, t('prices.output')),
            React.createElement('span', null, t('prices.cache_read')),
            React.createElement('span', null, t('prices.cache_write'))
          ),
          models.length === 0
            ? React.createElement('div', { className: 'cb-hint' }, t('prices.empty'))
            : models.map((model) => {
                const override = priceOverrides?.[model.id] || {}
                return React.createElement(
                  'div',
                  { className: 'cb-price-row', key: model.id },
                  React.createElement('span', { className: 'cb-mono', title: model.id }, model.name || model.id),
                  ['input', 'output', 'cacheRead', 'cacheWrite'].map((field) => React.createElement('input', {
                    key: field,
                    className: 'cb-input cb-price-input',
                    type: 'number',
                    min: '0',
                    step: '0.001',
                    value: override[field] === undefined ? '' : String(override[field]),
                    placeholder: t('prices.auto'),
                    onChange: (event) => update(model.id, field, event.target.value),
                  }))
                )
              }),
          React.createElement('div', { className: 'cb-hint' }, t('prices.hint'))
        )
      : null
  )
}
