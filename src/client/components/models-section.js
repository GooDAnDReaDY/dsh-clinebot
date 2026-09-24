function ModelsSection({
  modelsList,
  disabledSet,
  enabledCount,
  keyPresent,
  busy,
  handleSyncPlanModels,
  handleSetModelsFilter,
  handleToggleModel,
  planSynced,
  planSyncedAt,
  defaultModelWarning,
  t,
}) {
  const syncDateStr = planSyncedAt ? new Date(planSyncedAt).toLocaleDateString() : ''
  const [search, setSearch] = React.useState('')
  const [viewFilter, setViewFilter] = React.useState('all')

  const filteredModels = modelsList.filter((m) => {
    if (viewFilter === 'vision') {
      const hasVision = Boolean(m.input?.includes('image') || m.input?.includes('vision'))
      if (!hasVision) return false
    } else if (viewFilter === 'coding') {
      if (m.category !== 'coding') return false
    } else if (viewFilter === 'recommended') {
      if (!m.recommended) return false
    } else if (viewFilter === 'disabled') {
      if (!disabledSet.has(m.id)) return false
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      const name = String(m.name || '').toLowerCase()
      const id = String(m.id || '').toLowerCase()
      const desc = String(m.description || '').toLowerCase()
      if (!name.includes(q) && !id.includes(q) && !desc.includes(q)) return false
    }
    return true
  })

  return React.createElement(
    'div',
    { className: 'cb-section-card' },
    defaultModelWarning
      ? React.createElement('div', { className: 'cb-alert-bad', style: { marginBottom: '12px' } }, `⚠️ ${defaultModelWarning}`)
      : null,
    React.createElement(
      'div',
      { className: 'cb-section-title' },
      React.createElement(
        'span',
        null,
        t('models.title', { enabled: enabledCount, total: modelsList.length }),
        planSynced
          ? React.createElement('span', { className: 'cb-badge cb-badge-ok', style: { marginLeft: '8px', fontSize: '11px' } }, t('models.verified'))
          : React.createElement('span', { className: 'cb-badge cb-badge-warn', style: { marginLeft: '8px', fontSize: '11px' } }, t('models.unverified')),
        syncDateStr ? React.createElement('span', { style: { marginLeft: '8px', fontSize: '11px', color: 'var(--dsw-alias-label-secondary)' } }, t('models.synced_at', { date: syncDateStr })) : null
      ),
      React.createElement(
        'div',
        { className: 'cb-row' },
        React.createElement(
          'button',
          {
            type: 'button',
            className: 'cb-btn',
            disabled: !!busy || !keyPresent,
            onClick: handleSyncPlanModels,
          },
          busy === 'sync-models' ? t('models.syncing') : t('models.sync')
        ),
        React.createElement('button', { type: 'button', className: 'cb-btn', onClick: () => handleSetModelsFilter('all') }, t('models.all')),
        React.createElement('button', { type: 'button', className: 'cb-btn', onClick: () => handleSetModelsFilter('vision') }, t('models.vision')),
        React.createElement('button', { type: 'button', className: 'cb-btn', onClick: () => handleSetModelsFilter('coding') }, t('models.coding')),
        React.createElement('button', { type: 'button', className: 'cb-btn', onClick: () => handleSetModelsFilter('recommended') }, t('models.recommended'))
      )
    ),
    React.createElement('div', { className: 'cb-section-desc' }, t('models.desc')),

    // Search and display filter bar
    React.createElement(
      'div',
      {
        style: {
          display: 'flex',
          gap: '8px',
          alignItems: 'center',
          flexWrap: 'wrap',
          marginBottom: '12px',
        },
      },
      React.createElement('input', {
        type: 'text',
        className: 'cb-input',
        style: { flex: '1 1 200px' },
        placeholder: t('models.search_placeholder'),
        value: search,
        onChange: (e) => setSearch(e.target.value),
      }),
      React.createElement(
        'div',
        { className: 'cb-row', style: { gap: '4px' } },
        React.createElement(
          'button',
          {
            type: 'button',
            className: `cb-btn ${viewFilter === 'all' ? 'cb-btn-active' : ''}`,
            style: { padding: '4px 8px', fontSize: '11px' },
            onClick: () => setViewFilter('all'),
          },
          t('models.filter_all')
        ),
        React.createElement(
          'button',
          {
            type: 'button',
            className: `cb-btn ${viewFilter === 'vision' ? 'cb-btn-active' : ''}`,
            style: { padding: '4px 8px', fontSize: '11px' },
            onClick: () => setViewFilter('vision'),
          },
          t('models.filter_vision')
        ),
        React.createElement(
          'button',
          {
            type: 'button',
            className: `cb-btn ${viewFilter === 'coding' ? 'cb-btn-active' : ''}`,
            style: { padding: '4px 8px', fontSize: '11px' },
            onClick: () => setViewFilter('coding'),
          },
          t('models.filter_coding')
        ),
        React.createElement(
          'button',
          {
            type: 'button',
            className: `cb-btn ${viewFilter === 'recommended' ? 'cb-btn-active' : ''}`,
            style: { padding: '4px 8px', fontSize: '11px' },
            onClick: () => setViewFilter('recommended'),
          },
          t('models.filter_recommended')
        ),
        React.createElement(
          'button',
          {
            type: 'button',
            className: `cb-btn ${viewFilter === 'disabled' ? 'cb-btn-active' : ''}`,
            style: { padding: '4px 8px', fontSize: '11px' },
            onClick: () => setViewFilter('disabled'),
          },
          t('models.filter_disabled')
        )
      )
    ),

    React.createElement(
      'table',
      { className: 'cb-table' },
      React.createElement(
        'thead',
        null,
        React.createElement(
          'tr',
          null,
          React.createElement('th', { style: { width: '40px' } }, t('models.th_active')),
          React.createElement('th', null, t('models.th_name')),
          React.createElement('th', null, t('models.th_id')),
          React.createElement('th', null, t('models.th_ctx')),
          React.createElement('th', null, t('models.th_caps'))
        )
      ),
      React.createElement(
        'tbody',
        null,
        filteredModels.map((m) => {
          const isEnabled = !disabledSet.has(m.id)
          return React.createElement(
            'tr',
            { key: m.id },
            React.createElement(
              'td',
              null,
              React.createElement('input', {
                type: 'checkbox',
                checked: isEnabled,
                onChange: () => handleToggleModel(m.id),
              })
            ),
            React.createElement(
              'td',
              null,
              React.createElement('strong', null, m.name),
              m.recommended
                ? React.createElement('span', { className: 'cb-badge cb-badge-ok', style: { marginLeft: '6px' } }, t('models.star'))
                : null,
              m.isCustom
                ? React.createElement('span', { className: 'cb-badge', style: { marginLeft: '6px', opacity: 0.8 } }, t('models.auto_new'))
                : null
            ),
            React.createElement('td', null, React.createElement('code', null, m.id)),
            React.createElement('td', null, `${Math.round((m.contextLength || 128000) / 1000)}k`),
            React.createElement(
              'td',
              null,
              (() => {
                const hasReasoning = Boolean(
                  (Array.isArray(m.reasoningEfforts) && m.reasoningEfforts.length > 0) ||
                  (m.reasoningEfforts && typeof m.reasoningEfforts === 'object' && Object.keys(m.reasoningEfforts).length > 0) ||
                  m.reasoning ||
                  m.category === 'reasoning'
                )
                const category = m.category && m.category !== 'reasoning' ? m.category : (hasReasoning ? null : 'general')
                const hasVision = Boolean(m.input?.includes('image') || m.input?.includes('vision'))
                return React.createElement(
                  React.Fragment,
                  null,
                  category ? React.createElement('span', { className: 'cb-badge' }, category) : null,
                  hasVision
                    ? React.createElement('span', { className: 'cb-badge', style: { marginLeft: category ? '4px' : '0' } }, 'Vision')
                    : null,
                  hasReasoning
                    ? React.createElement('span', { className: 'cb-badge cb-badge-ok', style: { marginLeft: (category || hasVision) ? '4px' : '0' }, title: t('models.reasoning_tooltip') }, '🧠 Reasoning')
                    : null
                )
              })()
            )
          )
        })
      )
    )
  )
}
