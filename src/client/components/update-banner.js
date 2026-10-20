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
      { className: 'cb-update-banner' },
      React.createElement(
        'div',
        { className: 'cb-update-info' },
        updateState.currentVersion
          ? React.createElement('span', { className: 'cb-update-version' }, `v${updateState.currentVersion}`)
          : null,
        isChecking
          ? React.createElement('span', { className: 'cb-muted' }, t('update.checking'))
          : isAvailable
            ? React.createElement(
                'span',
                { className: 'cb-badge cb-badge-warn' },
                t('update.available', { latestVersion: updateState.latestVersion, currentVersion: updateState.currentVersion })
              )
            : isCurrent
              ? React.createElement('span', { className: 'cb-badge cb-badge-ok' }, t('update.up_to_date'))
              : isError
                ? React.createElement('span', { className: 'cb-badge cb-badge-bad' }, t('update.check_failed'))
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
              },
              t('update.retry')
            )
          : null
    ),
    updateState.notice ? React.createElement('div', { className: 'cb-alert-ok' }, updateState.notice) : null,
    updateState.error ? React.createElement('div', { className: 'cb-alert-err' }, updateState.error) : null
  )
}
