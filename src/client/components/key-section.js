function KeySection({ keyPresent, apiKeyInput, setApiKeyInput, showKey, setShowKey, busy, draft, handleSaveKey, handleFastLogin, t }) {
  return React.createElement(
    'div',
    { className: 'cb-section-card' },
    React.createElement('div', { className: 'cb-section-title' }, t('key.title')),
    React.createElement('div', { className: 'cb-section-desc' }, t('key.desc')),
    React.createElement(
      'div',
      { className: 'cb-input-group' },
      React.createElement('input', {
        className: 'cb-input',
        type: showKey ? 'text' : 'password',
        placeholder: keyPresent ? t('key.placeholder_has') : t('key.placeholder_empty'),
        value: apiKeyInput,
        onChange: (e) => setApiKeyInput(e.target.value),
      }),
      React.createElement(
        'button',
        {
          type: 'button',
          className: 'cb-btn',
          onClick: () => setShowKey((v) => !v),
        },
        showKey ? t('key.hide') : t('key.show')
      ),
      React.createElement(
        'button',
        {
          type: 'button',
          className: 'cb-btn cb-btn-primary',
          disabled: !!busy || !String(apiKeyInput || '').trim(),
          onClick: handleSaveKey,
        },
        busy === 'save-key' ? t('key.saving') : t('key.save')
      ),
      React.createElement(
        'button',
        {
          type: 'button',
          className: 'cb-btn',
          disabled: !!busy,
          onClick: handleFastLogin,
        },
        busy === 'fast-login' ? '…' : t('key.login_fast')
      )
    ),
    React.createElement(
      'div',
      { className: 'cb-row', style: { fontSize: '13px', color: 'var(--dsw-alias-label-secondary)' } },
      React.createElement('span', null, t('key.env_label')),
      React.createElement('code', null, draft.apiKeyEnv || 'CLINEBOT_API_KEY'),
      React.createElement('span', null, ' · '),
      React.createElement(
        'a',
        {
          href: 'https://app.cline.bot',
          target: '_blank',
          rel: 'noreferrer',
          style: { color: 'var(--dsw-alias-state-brand-primary)' },
        },
        t('key.get_key')
      )
    )
  )
}
