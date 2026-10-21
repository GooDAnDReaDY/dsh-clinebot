function DiagSection({ keyPresent, busy, smokeResult, handleSmoke, t }) {
  return React.createElement(
    'section',
    { className: 'cb-section-card' },
    React.createElement('div', { className: 'cb-section-title' }, t('diag.title')),
    React.createElement('div', { className: 'cb-section-desc' }, t('diag.desc')),
    React.createElement(
      'div',
      { className: 'cb-row cb-row-actions' },
      React.createElement(
        'button',
        {
          type: 'button',
          className: 'cb-btn cb-btn-primary',
          disabled: !!busy || !keyPresent,
          onClick: handleSmoke,
        },
        busy === 'smoke' ? t('diag.smoke_testing') : t('diag.smoke_btn')
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
