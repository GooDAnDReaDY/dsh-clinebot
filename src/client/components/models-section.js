function ModelsSection({ modelsList, disabledSet, enabledCount, keyPresent, busy, handleSyncPlanModels, handleSetModelsFilter, handleToggleModel, t }) {
  return React.createElement(
    'div',
    { className: 'cb-section-card' },
    React.createElement(
      'div',
      { className: 'cb-section-title' },
      t('models.title', { enabled: enabledCount, total: modelsList.length }),
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
        modelsList.map((m) => {
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
            React.createElement('td', null, `${Math.round((m.contextLength || 200000) / 1000)}k`),
            React.createElement(
              'td',
              null,
              React.createElement('span', { className: 'cb-badge' }, m.category || 'general'),
              m.input?.includes('image') || m.input?.includes('vision')
                ? React.createElement('span', { className: 'cb-badge', style: { marginLeft: '4px' } }, 'Vision')
                : null,
              (Array.isArray(m.reasoningEfforts) ? m.reasoningEfforts.length > 0 : (m.reasoningEfforts && typeof m.reasoningEfforts === 'object' ? Object.keys(m.reasoningEfforts).length > 0 : Boolean(m.reasoning)))
                ? React.createElement('span', { className: 'cb-badge cb-badge-ok', style: { marginLeft: '4px' }, title: t('models.reasoning_tooltip') }, '🧠 Reasoning')
                : null
            )
          )
        })
      )
    )
  )
}
