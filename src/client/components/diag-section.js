function DiagSection({
  keyPresent,
  isRegistered,
  busy,
  smokeResult,
  handleSmoke,
  handleUnregister,
  handleRegister,
  proxyMode,
  onToggleProxy,
  t,
}) {
  return React.createElement(
    'div',
    { className: 'cb-section-card' },
    React.createElement('div', { className: 'cb-section-title' }, t('diag.title')),
    React.createElement('div', { className: 'cb-section-desc' }, t('diag.desc')),
    React.createElement(
      'div',
      {
        style: {
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '10px 14px',
          background: 'var(--dsw-alias-bg-layer-2)',
          borderRadius: '8px',
          border: '1px solid var(--dsw-alias-border-l2)',
        },
      },
      React.createElement(
        'div',
        { style: { display: 'flex', flexDirection: 'column', gap: '3px' } },
        React.createElement(
          'span',
          { style: { fontSize: '13px', fontWeight: 600, color: 'var(--dsw-alias-label-primary)' } },
          t('diag.proxy_title')
        ),
        React.createElement(
          'span',
          { style: { fontSize: '12px', color: 'var(--dsw-alias-label-secondary)' } },
          t('diag.proxy_desc')
        )
      ),
      React.createElement(
        'label',
        { style: { display: 'inline-flex', alignItems: 'center', gap: '8px', cursor: 'pointer', whiteSpace: 'nowrap' } },
        React.createElement('input', {
          type: 'checkbox',
          checked: !!proxyMode,
          disabled: !!busy,
          onChange: (e) => onToggleProxy && onToggleProxy(e.target.checked),
        }),
        React.createElement(
          'span',
          {
            style: {
              fontSize: '13px',
              fontWeight: 500,
              color: proxyMode ? 'var(--dsw-alias-state-success-primary)' : 'var(--dsw-alias-label-secondary)',
            },
          },
          proxyMode ? t('diag.proxy_enabled') : t('diag.proxy_disabled')
        )
      )
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
          onClick: handleSmoke,
        },
        busy === 'smoke' ? t('diag.smoke_testing') : t('diag.smoke_btn')
      ),
      isRegistered
        ? React.createElement(
            'button',
            {
              type: 'button',
              className: 'cb-btn cb-btn-danger',
              disabled: !!busy,
              onClick: handleUnregister,
            },
            busy === 'unregister' ? t('diag.unregistering') : t('diag.unregister_btn')
          )
        : null,
      React.createElement(
        'button',
        {
          type: 'button',
          className: 'cb-btn cb-btn-primary',
          style: { marginLeft: 'auto' },
          disabled: !!busy,
          onClick: handleRegister,
        },
        busy === 'register' ? t('diag.resyncing') : t('diag.resync_btn')
      )
    ),
    smokeResult
      ? React.createElement(
          'div',
          { className: 'cb-preview' },
          t('diag.smoke_result', {
            latency: smokeResult.latencyMs,
            model: smokeResult.model,
            preview: smokeResult.preview || t('diag.empty'),
          })
        )
      : null
  )
}
