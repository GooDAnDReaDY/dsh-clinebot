function CustomModelsSub({ customModels = [], onConfigUpdate, busy, t }) {
  const [newId, setNewId] = React.useState('')
  const [newName, setNewName] = React.useState('')
  const [isExpanded, setIsExpanded] = React.useState(false)

  function handleAdd() {
    const trimmedId = newId.trim()
    const trimmedName = newName.trim() || trimmedId
    if (!trimmedId) return
    const nextList = [...customModels.filter((m) => m.id !== trimmedId), {
      id: trimmedId,
      name: trimmedName,
      contextLength: 128000,
      maxTokens: 8192,
      category: 'general',
      isCustom: true,
    }]
    if (typeof onConfigUpdate === 'function') {
      onConfigUpdate({ customModels: nextList })
    }
    setNewId('')
    setNewName('')
  }

  function handleDelete(id) {
    const nextList = customModels.filter((m) => m.id !== id)
    if (typeof onConfigUpdate === 'function') {
      onConfigUpdate({ customModels: nextList })
    }
  }

  return React.createElement(
    'div',
    {
      style: {
        marginTop: '16px',
        paddingTop: '14px',
        borderTop: '1px solid var(--dsw-alias-border-l2)',
      },
    },
    React.createElement(
      'div',
      {
        style: {
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          cursor: 'pointer',
        },
        onClick: () => setIsExpanded(!isExpanded),
      },
      React.createElement(
        'span',
        { style: { fontWeight: 500, fontSize: '13px', color: 'var(--dsw-alias-label-primary)' } },
        `➕ ${t('models.custom_add_title')} (${customModels.length})`
      ),
      React.createElement(
        'span',
        { style: { fontSize: '12px', color: 'var(--dsw-alias-label-secondary)' } },
        isExpanded ? '▲' : '▼'
      )
    ),
    isExpanded
      ? React.createElement(
          'div',
          { style: { marginTop: '12px', display: 'flex', flexDirection: 'column', gap: '10px' } },
          React.createElement(
            'div',
            { style: { display: 'flex', gap: '8px', flexWrap: 'wrap' } },
            React.createElement('input', {
              type: 'text',
              className: 'cb-input',
              style: { flex: '1 1 180px' },
              placeholder: t('models.custom_id'),
              value: newId,
              disabled: !!busy,
              onChange: (e) => setNewId(e.target.value),
            }),
            React.createElement('input', {
              type: 'text',
              className: 'cb-input',
              style: { flex: '1 1 180px' },
              placeholder: t('models.custom_name'),
              value: newName,
              disabled: !!busy,
              onChange: (e) => setNewName(e.target.value),
            }),
            React.createElement(
              'button',
              {
                type: 'button',
                className: 'cb-btn cb-btn-primary',
                disabled: !newId.trim() || !!busy,
                onClick: handleAdd,
              },
              t('models.custom_btn_add')
            )
          ),
          customModels.length > 0
            ? React.createElement(
                'div',
                { style: { display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '6px' } },
                customModels.map((cm) =>
                  React.createElement(
                    'div',
                    {
                      key: cm.id,
                      style: {
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        padding: '6px 10px',
                        background: 'var(--dsw-alias-bg-layer-2)',
                        border: '1px solid var(--dsw-alias-border-l2)',
                        borderRadius: '6px',
                        fontSize: '12px',
                      },
                    },
                    React.createElement(
                      'div',
                      null,
                      React.createElement('span', { style: { fontWeight: 500 } }, cm.name || cm.id),
                      React.createElement('span', { style: { color: 'var(--dsw-alias-label-secondary)', marginLeft: '8px' } }, `(${cm.id})`)
                    ),
                    React.createElement(
                      'button',
                      {
                        type: 'button',
                        className: 'cb-btn',
                        style: { padding: '2px 8px', fontSize: '11px' },
                        disabled: !!busy,
                        onClick: () => handleDelete(cm.id),
                      },
                      t('models.custom_btn_del')
                    )
                  )
                )
              )
            : null
        )
      : null
  )
}
