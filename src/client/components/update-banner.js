function UpdateBanner({ updateState, handleTriggerUpdate, t }) {
  return React.createElement(
    React.Fragment,
    null,
    React.createElement(
      'div',
      {
        className: 'cb-row',
        style: {
          padding: '10px 14px',
          borderRadius: '8px',
          border: '1px solid var(--dsw-alias-border-l2)',
          background: 'var(--dsw-alias-bg-layer-2)',
          justifyContent: 'space-between',
        }
      },
      React.createElement(
        'div',
        { style: { display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px' } },
        React.createElement('span', { style: { color: 'var(--dsw-alias-label-secondary)', fontWeight: 500 } },
          `v${updateState.currentVersion}`
        ),
        updateState.checking
          ? React.createElement('span', { style: { color: 'var(--dsw-alias-label-tertiary)', fontSize: '12px' } },
              t('update.checking')
            )
          : updateState.updateAvailable
            ? React.createElement('span', { className: 'cb-badge cb-badge-warn' },
                t('update.available', { latestVersion: updateState.latestVersion, currentVersion: updateState.currentVersion })
              )
            : React.createElement('span', { className: 'cb-badge cb-badge-ok' },
                '✓ ' + t('update.up_to_date')
              )
      ),
      updateState.updateAvailable
        ? React.createElement(
            'button',
            {
              type: 'button',
              className: 'cb-btn cb-btn-primary',
              disabled: updateState.updating,
              onClick: handleTriggerUpdate,
              style: { padding: '5px 12px', fontSize: '12px' }
            },
            updateState.updating ? t('update.updating') : t('update.btn')
          )
        : null
    ),
    updateState.notice ? React.createElement('div', { className: 'cb-alert-ok' }, '✓ ' + updateState.notice) : null,
    updateState.error ? React.createElement('div', { className: 'cb-alert-err' }, updateState.error) : null
  )
}
