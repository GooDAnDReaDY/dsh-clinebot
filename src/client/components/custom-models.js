function CustomModelsSub({ customModels = [], onConfigUpdate, busy, t }) {
  const [newId, setNewId] = React.useState('')
  const [newName, setNewName] = React.useState('')
  const [newCtx, setNewCtx] = React.useState('')
  const [newMax, setNewMax] = React.useState('')
  const [newImage, setNewImage] = React.useState(false)
  const [isExpanded, setIsExpanded] = React.useState(false)

  function handleAdd() {
    const trimmedId = newId.trim()
    const trimmedName = newName.trim() || trimmedId
    if (!trimmedId) return
    const parsedCtx = parseInt(newCtx, 10)
    const parsedMax = parseInt(newMax, 10)
    const nextList = [...customModels.filter((m) => m.id !== trimmedId), {
      id: trimmedId,
      name: trimmedName,
      contextLength: parsedCtx > 0 ? parsedCtx : 128000,
      maxTokens: parsedMax > 0 ? parsedMax : 8192,
      input: newImage ? ['text', 'image'] : ['text'],
      category: 'general',
      isCustom: true,
    }]
    if (typeof onConfigUpdate === 'function') {
      onConfigUpdate({ customModels: nextList })
    }
    setNewId('')
    setNewName('')
    setNewCtx('')
    setNewMax('')
    setNewImage(false)
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
      'button',
      {
        type: 'button',
        'aria-expanded': isExpanded,
        style: {
          display: 'flex',
          width: '100%',
          justifyContent: 'space-between',
          alignItems: 'center',
          cursor: 'pointer',
          background: 'none',
          border: 0,
          padding: 0,
          font: 'inherit',
          color: 'inherit',
          textAlign: 'left',
        },
        onClick: () => setIsExpanded(!isExpanded),
      },
      React.createElement(
        'span',
        { style: { fontWeight: 500, fontSize: '13px', color: 'var(--dsw-alias-label-primary)' } },
        React.createElement(CbIcon, { name: 'plus', size: 13 }),
        ` ${t('models.custom_add_title')} (${customModels.length})`
      ),
      React.createElement(
        'span',
        { style: { fontSize: '12px', color: 'var(--dsw-alias-label-secondary)' } },
        React.createElement(CbIcon, {
          name: 'chevron',
          size: 13,
          className: isExpanded ? 'cb-icon cb-icon-chevron-open' : 'cb-icon',
        })
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
              style: { flex: '2 1 140px' },
              placeholder: t('models.custom_id'),
              value: newId,
              disabled: !!busy,
              onChange: (e) => setNewId(e.target.value),
            }),
            React.createElement('input', {
              type: 'text',
              className: 'cb-input',
              style: { flex: '2 1 140px' },
              placeholder: t('models.custom_name'),
              value: newName,
              disabled: !!busy,
              onChange: (e) => setNewName(e.target.value),
            }),
            React.createElement('input', {
              type: 'number',
              className: 'cb-input',
              style: { flex: '1 1 90px' },
              placeholder: t('models.custom_ctx_label'),
              title: t('models.custom_ctx_label'),
              value: newCtx,
              disabled: !!busy,
              onChange: (e) => setNewCtx(e.target.value),
            }),
            React.createElement('input', {
              type: 'number',
              className: 'cb-input',
              style: { flex: '1 1 80px' },
              placeholder: t('models.custom_max_label'),
              title: t('models.custom_max_label'),
              value: newMax,
              disabled: !!busy,
              onChange: (e) => setNewMax(e.target.value),
            }),
            React.createElement(
              'label',
              { style: { display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px', color: 'var(--dsw-alias-label-secondary)' } },
              React.createElement('input', {
                type: 'checkbox',
                checked: newImage,
                disabled: !!busy,
                onChange: (e) => setNewImage(e.target.checked),
              }),
              t('models.adv_image')
            ),
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
                      React.createElement('span', { style: { color: 'var(--dsw-alias-label-secondary)', marginLeft: '8px' } }, `(${cm.id})`),
                      React.createElement('span', { style: { color: 'var(--dsw-alias-label-secondary)', marginLeft: '8px', fontSize: '11px' } }, `[${cm.contextLength || 128000} / ${cm.maxTokens || 8192}]`)
                    ),
                    React.createElement(
                      'div',
                      { style: { display: 'flex', alignItems: 'center', gap: '8px' } },
                      React.createElement(
                        'label',
                        { style: { display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: 'var(--dsw-alias-label-secondary)' } },
                        React.createElement('input', {
                          type: 'checkbox',
                          checked: Boolean(cm.input?.includes('image') || cm.input?.includes('vision')),
                          disabled: !!busy,
                          onChange: (e) => {
                            const nextList = customModels.map((entry) => entry.id === cm.id
                              ? { ...entry, input: e.target.checked ? ['text', 'image'] : ['text'] }
                              : entry)
                            if (typeof onConfigUpdate === 'function') onConfigUpdate({ customModels: nextList })
                          },
                        }),
                        t('models.adv_image')
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
              )
            : null
        )
      : null
  )
}
