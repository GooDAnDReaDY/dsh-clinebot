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
    'section',
    { className: 'cb-section-card' },
    React.createElement('div', { className: 'cb-section-title' }, t('diag.title')),
    React.createElement('div', { className: 'cb-section-desc' }, t('diag.desc')),
    React.createElement(SettingRow, {
      title: t('diag.proxy_title'),
      description: t('diag.proxy_desc'),
      control: React.createElement(
        React.Fragment,
        null,
        React.createElement(
          'span',
          { className: proxyMode ? 'cb-state-ok' : 'cb-muted' },
          proxyMode ? t('diag.proxy_enabled') : t('diag.proxy_disabled')
        ),
        React.createElement(BooleanControl, {
          checked: !!proxyMode,
          disabled: !!busy,
          label: t('diag.proxy_title'),
          onChange: (next) => onToggleProxy && onToggleProxy(next),
        })
      ),
    }),
    React.createElement(
      'div',
      { className: 'cb-row cb-row-actions' },
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
      React.createElement('span', { className: 'cb-settings-spacer' }),
      React.createElement(
        'button',
        {
          type: 'button',
          className: 'cb-btn cb-btn-primary',
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
