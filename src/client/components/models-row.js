function ModelRow({
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
}) {
  const defaultCtx = m.defaultContextLength || m.clineContextLength || 200000
  const origCtx = m.originalContextLength || 200000
  const defaultMax = m.defaultMaxTokens || 8192
  const origMax = m.originalMaxTokens || defaultMax
  const origProv = m.originalProvider || 'Original'
  const isOverridden = Boolean(m.isContextOverridden)
  const isOriginal = isOverridden && (m.contextLength === origCtx && (m.maxTokens || defaultMax) === origMax)

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
      React.createElement(ModelProbeButton, { modelId: m.id, busy, t }),
      m.recommended
        ? React.createElement('span', { className: 'cb-badge cb-badge-ok', style: { marginLeft: '6px' } }, t('models.star'))
        : null,
      m.isCustom
        ? React.createElement('span', { className: 'cb-badge', style: { marginLeft: '6px', opacity: 0.8 } }, t('models.auto_new'))
        : null,
      m.free ? React.createElement('span', { className: 'cb-badge cb-badge-free', style: { marginLeft: '6px' } }, t('models.free')) : null
    ),
    React.createElement('td', null, React.createElement('code', null, m.id)),
    React.createElement(
      'td',
      null,
      editingModelId === m.id
        ? React.createElement(
            'div',
            {
              style: {
                display: 'flex',
                flexDirection: 'column',
                gap: '6px',
                background: 'var(--dsw-alias-interactive-bg-hover, color-mix(in srgb, currentColor 4%, transparent))',
                padding: '6px',
                borderRadius: '6px',
                border: '1px solid var(--dsw-alias-border-l2)',
              },
            },
            React.createElement(
              'div',
              { style: { display: 'flex', gap: '4px', flexWrap: 'wrap' } },
              React.createElement(
                'button',
                {
                  type: 'button',
                  className: `cb-btn ${!isOverridden ? 'cb-btn-active' : ''}`,
                  style: { padding: '2px 6px', fontSize: '11px' },
                  onClick: () => {
                    if (typeof handleUpdateModelContext === 'function') {
                      handleUpdateModelContext({ modelId: m.id, mode: 'reset' })
                    }
                    setEditingModelId(null)
                  },
                },
                t('models.ctx_default', { ctx: formatCtx(defaultCtx), max: formatCtx(defaultMax) })
              ),
              React.createElement(
                'button',
                {
                  type: 'button',
                  className: `cb-btn ${isOriginal ? 'cb-btn-active' : ''}`,
                  style: { padding: '2px 6px', fontSize: '11px' },
                  onClick: () => {
                    if (typeof handleUpdateModelContext === 'function') {
                      handleUpdateModelContext({ modelId: m.id, contextLength: origCtx, maxTokens: origMax })
                    }
                    setEditingModelId(null)
                  },
                },
                t('models.ctx_original', { ctx: formatCtx(origCtx), max: formatCtx(origMax), provider: origProv })
              )
            ),
            React.createElement(
              'div',
              { style: { display: 'flex', gap: '4px', alignItems: 'center', flexWrap: 'wrap' } },
              React.createElement('input', {
                type: 'number',
                className: 'cb-input',
                style: { height: '24px', fontSize: '11px', padding: '0 6px', width: '90px' },
                placeholder: t('models.ctx_window_label'),
                title: t('models.ctx_window_label'),
                value: customCtxVal,
                onChange: (e) => setCustomCtxVal(e.target.value),
              }),
              React.createElement('input', {
                type: 'number',
                className: 'cb-input',
                style: { height: '24px', fontSize: '11px', padding: '0 6px', width: '75px' },
                placeholder: t('models.ctx_max_tokens_label'),
                title: t('models.ctx_max_tokens_label'),
                value: customMaxVal,
                onChange: (e) => setCustomMaxVal(e.target.value),
              }),
              React.createElement(
                'button',
                {
                  type: 'button',
                  className: 'cb-btn cb-btn-primary',
                  style: { padding: '2px 6px', fontSize: '11px' },
                  onClick: () => {
                    const cVal = parseInt(customCtxVal, 10)
                    const mVal = parseInt(customMaxVal, 10)
                    if (typeof handleUpdateModelContext === 'function') {
                      const payload = { modelId: m.id }
                      if (cVal > 0) payload.contextLength = cVal
                      if (mVal > 0) payload.maxTokens = mVal
                      handleUpdateModelContext(payload)
                    }
                    setEditingModelId(null)
                  },
                },
                t('models.ctx_save')
              ),
              React.createElement(
                'button',
                {
                  type: 'button',
                  className: 'cb-btn',
                  title: t('models.ctx_apply_all_title'),
                  style: { padding: '2px 5px', fontSize: '11px' },
                  onClick: () => {
                    const cVal = parseInt(customCtxVal, 10)
                    const mVal = parseInt(customMaxVal, 10)
                    if (typeof handleUpdateModelContext === 'function') {
                      const payload = { mode: 'apply-all' }
                      if (cVal > 0) payload.contextLength = cVal
                      if (mVal > 0) payload.maxTokens = mVal
                      handleUpdateModelContext(payload)
                    }
                    setEditingModelId(null)
                  },
                },
                t('models.ctx_apply_all')
              ),
              React.createElement(
                'button',
                {
                  type: 'button',
                  className: 'cb-btn',
                  style: { padding: '2px 6px', fontSize: '11px' },
                  onClick: () => setEditingModelId(null),
                },
                t('models.ctx_cancel')
              )
            )
          )
        : React.createElement(
            'div',
            { style: { display: 'flex', alignItems: 'center', gap: '6px' } },
            React.createElement(
              'span',
              {
                style: { fontWeight: '600', cursor: 'pointer' },
                onClick: () => {
                  setCustomCtxVal(String(m.contextLength || defaultCtx))
                  setCustomMaxVal(String(m.maxTokens || defaultMax))
                  setEditingModelId(m.id)
                },
              },
              `${formatCtx(m.contextLength || defaultCtx)} / ${formatCtx(m.maxTokens || defaultMax)}`
            ),
            isOverridden
              ? React.createElement(
                  'span',
                  {
                    className: isOriginal ? 'cb-badge cb-badge-ok' : 'cb-badge cb-badge-warn',
                    style: { fontSize: '10px', padding: '1px 6px', cursor: 'pointer' },
                    onClick: () => {
                      setCustomCtxVal(String(m.contextLength || defaultCtx))
                      setCustomMaxVal(String(m.maxTokens || defaultMax))
                      setEditingModelId(m.id)
                    },
                  },
                  isOriginal ? t('models.ctx_tag_original') : t('models.ctx_tag_custom')
                )
              : null,
            React.createElement(
              'button',
              {
                type: 'button',
                className: 'cb-btn',
                style: { padding: '2px 6px', fontSize: '11px', lineHeight: '1', border: 'none', background: 'transparent' },
                title: t('models.ctx_edit'),
                onClick: () => {
                  setCustomCtxVal(String(m.contextLength || defaultCtx))
                  setCustomMaxVal(String(m.maxTokens || defaultMax))
                  setEditingModelId(m.id)
                },
              },
              React.createElement(CbIcon, { name: 'edit', size: 13 })
            )
          )
    ),
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
        const categoryLabel = category === 'general' ? t('models.caps_general') : (category === 'coding' ? t('models.caps_coding') : category)
        const hasVision = Boolean(m.input?.includes('image') || m.input?.includes('vision'))
        return React.createElement(
          React.Fragment,
          null,
          category ? React.createElement('span', { className: 'cb-badge' }, categoryLabel) : null,
          hasVision
            ? React.createElement('span', { className: 'cb-badge', style: { marginLeft: category ? '4px' : '0' } }, t('models.caps_vision'))
            : null,
          hasReasoning
            ? React.createElement(
                React.Fragment,
                null,
                React.createElement('span', { className: 'cb-badge cb-badge-ok', style: { marginLeft: (category || hasVision) ? '4px' : '0' }, title: t('models.reasoning_tooltip') }, t('models.reasoning_tag')),
                React.createElement(
                  'select',
                  {
                    className: 'cb-select',
                    style: { marginLeft: '4px', fontSize: '10px', padding: '1px 3px' },
                    value: (modelReasoningDefaults && modelReasoningDefaults[m.id]) || '',
                    disabled: !!busy,
                    onChange: (e) => {
                      if (typeof onUpdateReasoningEffort === 'function') {
                        onUpdateReasoningEffort(m.id, e.target.value)
                      }
                    },
                  },
                  React.createElement('option', { value: '' }, t('models.effort_auto')),
                  React.createElement('option', { value: 'low' }, t('models.effort_low')),
                  React.createElement('option', { value: 'medium' }, t('models.effort_medium')),
                  React.createElement('option', { value: 'high' }, t('models.effort_high')),
                  React.createElement('option', { value: 'max' }, t('models.effort_max'))
                )
              )
            : null
        )
      })()
    )
  )
}
