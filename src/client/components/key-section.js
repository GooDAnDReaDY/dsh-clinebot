function KeySection({ keyPresent, apiKeyInput, setApiKeyInput, showKey, setShowKey, busy, draft, handleSaveKey, handleFastLogin, verifyStatus, t }) {
  return React.createElement(
    'section',
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
        onChange: (event) => setApiKeyInput(event.target.value),
      }),
      React.createElement(
        'button',
        { type: 'button', className: 'cb-btn', onClick: () => setShowKey((value) => !value) },
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
        { type: 'button', className: 'cb-btn', disabled: !!busy, onClick: handleFastLogin },
        t('key.login_fast')
      )
    ),
    verifyStatus && verifyStatus.state === 'verifying'
      ? React.createElement('div', { className: 'cb-hint' }, t('key.verifying'))
      : null,
    verifyStatus && verifyStatus.state === 'valid'
      ? React.createElement('div', { className: 'cb-alert-ok cb-key-status' }, t('key.verified', { email: verifyStatus.email, plan: verifyStatus.plan }))
      : null,
    verifyStatus && verifyStatus.state === 'invalid'
      ? React.createElement('div', { className: 'cb-alert-bad cb-key-status' }, t('key.invalid', { error: verifyStatus.error }))
      : null,
    React.createElement(
      'div',
      { className: 'cb-key-meta' },
      React.createElement('span', null, t('key.env_label')),
      React.createElement('code', { className: 'cb-mono' }, draft.apiKeyEnv || 'CLINEBOT_API_KEY'),
      React.createElement('span', { className: 'cb-muted' }, '·'),
      React.createElement(
        'a',
        {
          href: 'https://app.cline.bot/settings/api-keys',
          target: '_blank',
          rel: 'noreferrer',
          className: 'cb-link',
        },
        t('key.get_key')
      )
    )
  )
}
