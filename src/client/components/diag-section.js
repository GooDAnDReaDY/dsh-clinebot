function DiagSection({ keyPresent, isRegistered, busy, smokeResult, handleSmoke, handleUnregister, handleRegister, t }) {
  return React.createElement(
    'div',
    { className: 'cb-section-card' },
    React.createElement('div', { className: 'cb-section-title' }, t('diag.title')),
    React.createElement('div', { className: 'cb-section-desc' }, t('diag.desc')),
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
          `✅ Latency: ${smokeResult.latencyMs} ms | Model: ${smokeResult.model}
Response: ${smokeResult.preview || '(empty)'}`
        )
      : null
  )
}
