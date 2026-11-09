function ModelsSection({
  modelsList,
  disabledSet,
  enabledCount,
  keyPresent,
  busy,
  handleSyncPlanModels,
  handleUpdateModelContext,
  handleSetModelsFilter,
  handleToggleModel,
  planSynced,
  planSyncedAt,
  defaultModelWarning,
  customModels,
  modelReasoningDefaults,
  visibleModels,
  filterModelsByPlan,
  onConfigUpdate,
  onApplyVisible,
  onUpdateReasoningEffort,
  t,
}) {
  const syncDateStr = planSyncedAt ? new Date(planSyncedAt).toLocaleDateString() : ''
  const [search, setSearch] = React.useState('')
  const [viewFilter, setViewFilter] = React.useState('all')
  const [editingModelId, setEditingModelId] = React.useState(null)
  const [customCtxVal, setCustomCtxVal] = React.useState('')
  const [customMaxVal, setCustomMaxVal] = React.useState('')
  function formatCtx(num) {
    num = Number(num) || 200000
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
  const filteredModels = modelsList.filter((m) => {
    if (viewFilter === 'vision') {
      const hasVision = Boolean(m.input?.includes('image') || m.input?.includes('vision'))
      if (!hasVision) return false
    } else if (viewFilter === 'coding') {
      if (m.category !== 'coding') return false
    } else if (viewFilter === 'recommended') {
      if (!m.recommended) return false
    } else if (viewFilter === 'free') {
      if (!m.free) return false
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
  const groupFor = (m) => (m.isCustom ? 'custom' : (m.inPlan ? 'plan' : 'other'))
  const orderedModels = [...filteredModels].sort((a, b) => {
    const order = { plan: 0, other: 1, custom: 2 }
    const byGroup = order[groupFor(a)] - order[groupFor(b)]
    return byGroup || Number(Boolean(b.free)) - Number(Boolean(a.free))
  })
  let lastGroup = ''
  return React.createElement('div', { className: 'cb-section-card' },
    defaultModelWarning ? React.createElement('div', { className: 'cb-alert-bad cb-inline-alert', style: { marginBottom: '12px' } }, React.createElement(CbIcon, { name: 'warning', size: 14 }), ` ${defaultModelWarning}`) : null,
    React.createElement(VisibleModelsSub, {
      modelsList, visibleModels, filterModelsByPlan, onConfigUpdate, onApplyVisible, busy, t,
    }),
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
        React.createElement(
          'button',
          {
            type: 'button',
            className: 'cb-btn',
            disabled: !!busy,
            title: t('models.apply_original_all'),
            onClick: () => typeof handleUpdateModelContext === 'function' && handleUpdateModelContext({ mode: 'all-original' }),
          },
          t('models.apply_original_all')
        ),
        React.createElement(
          'button',
          {
            type: 'button',
            className: 'cb-btn',
            disabled: !!busy,
            title: t('models.reset_contexts_all'),
            onClick: () => typeof handleUpdateModelContext === 'function' && handleUpdateModelContext({ mode: 'all-default' }),
          },
          t('models.reset_contexts_all')
        ),
        React.createElement('button', { type: 'button', className: 'cb-btn', onClick: () => handleSetModelsFilter('all') }, t('models.all')),
        React.createElement('button', { type: 'button', className: 'cb-btn', onClick: () => handleSetModelsFilter('vision') }, t('models.vision')),
        React.createElement('button', { type: 'button', className: 'cb-btn', onClick: () => handleSetModelsFilter('coding') }, t('models.coding')),
        React.createElement('button', { type: 'button', className: 'cb-btn', onClick: () => handleSetModelsFilter('recommended') }, t('models.recommended'))
      )
    ),
    React.createElement('div', { className: 'cb-section-desc' }, t('models.desc')),
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
        React.createElement('button', { type: 'button', className: `cb-btn ${viewFilter === 'all' ? 'cb-btn-active' : ''}`, style: { padding: '4px 8px', fontSize: '11px' }, onClick: () => setViewFilter('all') }, t('models.filter_all')),
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
        React.createElement('button', { type: 'button', className: `cb-btn ${viewFilter === 'free' ? 'cb-btn-active' : ''}`, style: { padding: '4px 8px', fontSize: '11px' }, onClick: () => setViewFilter('free') }, t('models.filter_free')),
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
        orderedModels.map((m) => {
          const groupKey = groupFor(m)
          const showGroup = groupKey !== lastGroup
          lastGroup = groupKey
          const isEnabled = !disabledSet.has(m.id)
          const defaultCtx = m.defaultContextLength || m.clineContextLength || 200000
          const origCtx = m.originalContextLength || 200000
          const defaultMax = m.defaultMaxTokens || 8192
          const origMax = m.originalMaxTokens || defaultMax
          const origProv = m.originalProvider || 'Original'
          const isOverridden = Boolean(m.isContextOverridden)
          const isOriginal = isOverridden && (m.contextLength === origCtx && (m.maxTokens || defaultMax) === origMax)
          const row = React.createElement(ModelRow, {
            m,
            isEnabled,
            handleToggleModel,
            busy,
            t,
            editingModelId,
            setEditingModelId,
            customCtxVal,
            setCustomCtxVal,
            customMaxVal,
            setCustomMaxVal,
            formatCtx,
            handleUpdateModelContext,
            modelReasoningDefaults,
            onUpdateReasoningEffort,
          })
          const groupCount = orderedModels.filter((entry) => groupFor(entry) === groupKey).length
          return React.createElement(React.Fragment, { key: `group-wrap-${m.id}` },
            showGroup
              ? React.createElement('tr', { className: 'cb-model-group' },
                  React.createElement('td', { colSpan: 5 }, `${t(`models.group_${groupKey}`)} · ${groupCount}`)
                )
              : null,
            row
          )
        })
      )
    ),
    typeof CustomModelsSub === 'function'
      ? React.createElement(CustomModelsSub, {
          customModels: customModels || [],
          onConfigUpdate: onConfigUpdate,
          busy: busy,
          t: t,
        })
      : null
  )
}