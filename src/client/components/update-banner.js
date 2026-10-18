function UpdateBanner({ updateState, handleTriggerUpdate, handleCheckUpdate, t }) {
  const status = updateState.status || (
    updateState.checking
      ? 'checking'
      : (updateState.latestCheckFailed
          ? 'error'
          : (updateState.updateAvailable
              ? 'available'
              : (updateState.lastCheckedAt ? 'current' : 'idle')))
  )

  const isChecking = status === 'checking' || updateState.checking
  const isAvailable = status === 'available' || updateState.updateAvailable
  const isCurrent = status === 'current'
  const isError = status === 'error' || updateState.latestCheckFailed

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
        updateState.currentVersion
          ? React.createElement('span', { style: { color: 'var(--dsw-alias-label-secondary)', fontWeight: 500 } },
              `v${updateState.currentVersion}`
            )
          : null,
        isChecking
          ? React.createElement('span', { style: { color: 'var(--dsw-alias-label-tertiary)', fontSize: '12px' } },
              t('update.checking')
            )
          : isAvailable
            ? React.createElement('span', { className: 'cb-badge cb-badge-warn' },
                t('update.available', { latestVersion: updateState.latestVersion, currentVersion: updateState.currentVersion })
              )
            : isCurrent
              ? React.createElement('span', { className: 'cb-badge cb-badge-ok' },
                  '✓ ' + t('update.up_to_date')
                )
              : isError
                ? React.createElement('span', { className: 'cb-badge cb-badge-bad' },
                    t('update.check_failed')
                  )
                : null
      ),
      isAvailable
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
        : isError && handleCheckUpdate
          ? React.createElement(
              'button',
              {
                type: 'button',
                className: 'cb-btn',
                disabled: isChecking,
                onClick: handleCheckUpdate,
                style: { padding: '5px 12px', fontSize: '12px' }
              },
              t('update.retry')
            )
          : null
    ),
    updateState.notice ? React.createElement('div', { className: 'cb-alert-ok' }, '✓ ' + updateState.notice) : null,
    updateState.error ? React.createElement('div', { className: 'cb-alert-err' }, updateState.error) : null
  )
}
