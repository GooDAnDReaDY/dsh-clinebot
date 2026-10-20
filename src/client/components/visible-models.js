function formatModelLimits(num) {
  num = Number(num) || 0
  if (num >= 1000000) {
    const m = num / 1000000
    return `${m % 1 === 0 ? m : m.toFixed(1)}M`
  }
  if (num >= 1000) {
    const k = num / 1000
    return `${k % 1 === 0 ? k : k.toFixed(1)}K`
  }
  return String(num)
}

function VisibleModelsSub({
  modelsList = [],
  visibleModels = [],
  filterModelsByPlan = true,
  onConfigUpdate,
  busy,
  t,
}) {
  const [open, setOpen] = React.useState(false)
  const [search, setSearch] = React.useState('')

  const allModelIds = modelsList.map((m) => m.id)
  const allModelIdSet = new Set(allModelIds)
  const staleIds = Array.isArray(visibleModels) ? visibleModels.filter((id) => !allModelIdSet.has(id)) : []
  const isAllVisible = !Array.isArray(visibleModels) || visibleModels.length === 0
  const count = isAllVisible ? modelsList.length : visibleModels.length

  function handleToggleModel(modelId) {
    if (typeof onConfigUpdate !== 'function') return
    if (isAllVisible) {
      const next = allModelIds.filter((id) => id !== modelId)
      onConfigUpdate({ visibleModels: next })
    } else {
      let next
      if (visibleModels.includes(modelId)) {
        next = visibleModels.filter((id) => id !== modelId)
      } else {
        next = [...visibleModels, modelId]
      }
      onConfigUpdate({ visibleModels: next })
    }
  }

  function handleSelectOnlyPlan() {
    if (typeof onConfigUpdate !== 'function') return
    const planOnly = modelsList.filter((m) => m.inPlan).map((m) => m.id)
    onConfigUpdate({ visibleModels: planOnly.length > 0 ? planOnly : allModelIds })
  }

  function handleShowAll() {
    if (typeof onConfigUpdate !== 'function') return
    onConfigUpdate({ visibleModels: [] })
  }

  function handleCleanStale() {
    if (typeof onConfigUpdate !== 'function') return
    const cleaned = visibleModels.filter((id) => allModelIdSet.has(id))
    onConfigUpdate({ visibleModels: cleaned })
  }

  const filtered = modelsList.filter((m) => {
    if (!search.trim()) return true
    const q = search.trim().toLowerCase()
    return (
      (m.name && m.name.toLowerCase().includes(q)) ||
      (m.id && m.id.toLowerCase().includes(q)) ||
      (m.category && m.category.toLowerCase().includes(q))
    )
  })

  return React.createElement(
    'div',
    {
      style: {
        display: 'flex',
        flexDirection: 'column',
        gap: '10px',
        padding: '12px 14px',
        border: '1px solid var(--dsw-alias-border-l2)',
        borderRadius: '8px',
        background: 'var(--dsw-alias-bg-layer-2)',
        marginBottom: '14px',
      },
    },
    React.createElement(
      'div',
      { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' } },
      React.createElement(
        'div',
        { style: { display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 } },
        React.createElement(
          'span',
          { style: { fontSize: '14px', lineHeight: '20px', color: 'var(--dsw-alias-label-primary)' } },
          t('models.filter_by_plan')
        ),
        React.createElement(BooleanControl, {
          checked: !!filterModelsByPlan,
          disabled: !!busy,
          label: t('models.filter_by_plan'),
          onChange: (next) => onConfigUpdate && onConfigUpdate({ filterModelsByPlan: next }),
        })
      ),
      React.createElement(
        'div',
        { style: { display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' } },
        !isAllVisible
          ? React.createElement(
              'button',
              {
                type: 'button',
                className: 'cb-btn',
                style: { padding: '4px 8px', fontSize: '12px' },
                disabled: !!busy,
                onClick: handleShowAll,
              },
              t('models.show_all')
            )
          : null,
        React.createElement(
          'button',
          {
            type: 'button',
            className: 'cb-btn',
            style: { padding: '4px 8px', fontSize: '12px' },
            disabled: !!busy,
            onClick: handleSelectOnlyPlan,
          },
          t('models.plan_only')
        ),
        staleIds.length > 0
          ? React.createElement(
              'button',
              {
                type: 'button',
                className: 'cb-btn',
                style: { padding: '4px 8px', fontSize: '12px', color: 'var(--dsw-alias-state-warn-primary)' },
                disabled: !!busy,
                onClick: handleCleanStale,
              },
              t('models.clean_stale', { count: staleIds.length })
            )
          : null,
        React.createElement(
          'button',
          {
            type: 'button',
            className: 'cb-btn',
            style: { padding: '4px 10px', fontSize: '12px' },
            onClick: () => setOpen(!open),
          },
          React.createElement(CbIcon, {
            name: 'chevron',
            size: 12,
            className: open ? 'cb-icon cb-icon-chevron-open' : 'cb-icon',
          }),
          ` ${t('models.models_selected', { selected: count, total: modelsList.length })}`
        )
      )
    ),
    React.createElement(
      'div',
      { style: { fontSize: '12px', color: 'var(--dsw-alias-label-secondary)', marginTop: '-4px' } },
      t('models.filter_by_plan_hint')
    ),
    open
      ? React.createElement(
          'div',
          {
            style: {
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
              paddingTop: '8px',
              borderTop: '1px solid var(--dsw-alias-border-l2)',
            },
          },
          React.createElement('input', {
            type: 'text',
            className: 'cb-input',
            style: { height: '30px', fontSize: '12px' },
            placeholder: t('models.search_placeholder'),
            value: search,
            onChange: (e) => setSearch(e.target.value),
          }),
          React.createElement(
            'div',
            {
              style: {
                display: 'flex',
                flexDirection: 'column',
                gap: '4px',
                maxHeight: '240px',
                overflowY: 'auto',
                paddingRight: '4px',
              },
            },
            filtered.map((m) => {
              const isChecked = isAllVisible || visibleModels.includes(m.id)
              const ctxStr = `${formatModelLimits(m.contextLength)} / ${formatModelLimits(m.maxTokens)}`
              return React.createElement(
                'label',
                {
                  key: m.id,
                  style: {
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '5px 8px',
                    borderRadius: '6px',
                    background: isChecked ? 'var(--dsw-alias-bg-layer-3)' : 'transparent',
                    cursor: 'pointer',
                    fontSize: '12px',
                    opacity: m.inPlan ? 1 : 0.65,
                  },
                },
                React.createElement(
                  'div',
                  { style: { display: 'flex', alignItems: 'center', gap: '8px', flex: 1, minWidth: 0 } },
                  React.createElement('input', {
                    type: 'checkbox',
                    checked: isChecked,
                    onChange: () => handleToggleModel(m.id),
                  }),
                  React.createElement('span', { style: { fontWeight: '500', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' } }, m.name),
                  React.createElement('span', { style: { color: 'var(--dsw-alias-label-secondary)', fontSize: '11px' } }, `(${m.id})`)
                ),
                React.createElement(
                  'div',
                  { style: { display: 'flex', alignItems: 'center', gap: '6px' } },
                  React.createElement(
                    'span',
                    {
                      className: 'cb-badge',
                      style: { fontSize: '11px', padding: '2px 6px', fontWeight: '600' },
                      title: 'Context Window / Max Output Tokens',
                    },
                    ctxStr
                  ),
                  m.inPlan
                    ? React.createElement('span', { className: 'cb-badge cb-badge-ok', style: { fontSize: '10px', padding: '1px 6px' } }, t('models.in_plan'))
                    : React.createElement('span', { className: 'cb-badge', style: { fontSize: '10px', padding: '1px 6px', color: 'var(--dsw-alias-label-secondary)' } }, t('models.out_of_plan')),
                  !m.isContextOverridden
                    ? React.createElement('span', { className: 'cb-badge cb-badge-ok', style: { fontSize: '10px', padding: '1px 5px' } }, t('models.ctx_tag_original'))
                    : null
                )
              )
            })
          )
        )
      : null
  )
}
