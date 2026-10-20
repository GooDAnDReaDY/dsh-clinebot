/**
 * The account/quota cards shared by the center-column panel and the modal
 * fallback. Account tabs and the selected account's report are passed in by
 * DashboardDialog; this component only renders the selected snapshot.
 */
function QuotaPanelView({
  accountTabs,
  selectedUsage,
  accountName,
  accountEmail,
  accountPlan,
  accountBadges = [],
  activeAcc,
  routingMode,
  enabledCount,
  t,
}) {
  return React.createElement(
    React.Fragment,
    null,
    accountTabs,
    selectedUsage?.ok === false
      ? React.createElement('div', { className: 'cb-alert-bad' }, selectedUsage.error || t('analytics.no_data'))
      : null,
    React.createElement(
      'div',
      { className: 'cb-dialogCard' },
      React.createElement(
        'div',
        { className: 'cb-dialogRow' },
        React.createElement(
          'div',
          { className: 'cb-dialogIdentity' },
          React.createElement('div', { className: 'cb-row-title' }, accountName),
          React.createElement('div', { className: 'cb-row-desc' }, [accountEmail, accountPlan].filter(Boolean).join(' · '))
        ),
        React.createElement(
          'div',
          { className: 'cb-dialogBadges' },
          accountBadges.map((badge, index) => React.createElement('span', { className: badge.className, key: `account-badge-${index}` }, badge.label)),
          React.createElement('span', { className: 'cb-badge cb-badge-ok' }, t('badge.registered', { count: enabledCount }))
        )
      ),
      React.createElement(
        'div',
        { className: 'cb-dialogTiles' },
        React.createElement(
          'div',
          { className: 'cb-stat-box' },
          React.createElement('div', { className: 'cb-stat-lbl' }, t('dashboard.account_pool')),
          React.createElement('div', { className: 'cb-stat-val' }, activeAcc)
        ),
        React.createElement(
          'div',
          { className: 'cb-stat-box' },
          React.createElement('div', { className: 'cb-stat-lbl' }, t('accounts.mode_label')),
          React.createElement('div', { className: 'cb-stat-val' }, routingMode)
        )
      )
    ),
    React.createElement(
      'div',
      { className: 'cb-dialogCard' },
      React.createElement('div', { className: 'cb-section-title' }, t('quota.title')),
      React.createElement(
        'div',
        { className: 'cb-dialogWindows' },
        selectedUsage?.windows?.fiveHour
          ? React.createElement(ProgressBar, {
              label: t('quota.window_5h'),
              percentUsed: selectedUsage.windows.fiveHour.percentUsed || 0,
              remainingPercent: selectedUsage.windows.fiveHour.remainingPercent || 100,
              resetsAt: selectedUsage.windows.fiveHour.resetsAt,
              t,
            })
          : null,
        selectedUsage?.windows?.weekly
          ? React.createElement(ProgressBar, {
              label: t('quota.window_weekly'),
              percentUsed: selectedUsage.windows.weekly.percentUsed || 0,
              remainingPercent: selectedUsage.windows.weekly.remainingPercent || 100,
              resetsAt: selectedUsage.windows.weekly.resetsAt,
              t,
            })
          : null,
        selectedUsage?.windows?.monthly
          ? React.createElement(ProgressBar, {
              label: t('quota.window_monthly'),
              percentUsed: selectedUsage.windows.monthly.percentUsed || 0,
              remainingPercent: selectedUsage.windows.monthly.remainingPercent || 100,
              resetsAt: selectedUsage.windows.monthly.resetsAt,
              t,
            })
          : null,
        !selectedUsage?.windows || (!selectedUsage.windows.fiveHour && !selectedUsage.windows.weekly && !selectedUsage.windows.monthly)
          ? React.createElement('div', { className: 'cb-hint' }, t('quota.no_windows'))
          : null
      )
    )
  )
}
