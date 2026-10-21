function QuotaSection({ keyPresent, status, usage, busy, handleRefreshQuota, showSidebarQuota, onToggleSidebarQuota, t }) {
  const isLowQuota = Boolean(
    (usage?.windows?.weekly && typeof usage.windows.weekly.remainingPercent === 'number' && usage.windows.weekly.remainingPercent <= 10) ||
    (usage?.windows?.monthly && typeof usage.windows.monthly.remainingPercent === 'number' && usage.windows.monthly.remainingPercent <= 10) ||
    (usage?.windows?.fiveHour && typeof usage.windows.fiveHour.remainingPercent === 'number' && usage.windows.fiveHour.remainingPercent <= 10)
  )

  return React.createElement(
    React.Fragment,
    null,
    status.quotaWarning
      ? React.createElement(
          'div',
          { className: status.quotaWarning.level === 'exhausted' ? 'cb-banner-exhausted' : 'cb-banner-warning' },
          React.createElement(
            'span',
            { className: 'cb-banner-icon' },
            React.createElement(CbIcon, {
              name: status.quotaWarning.level === 'exhausted' ? 'error' : 'warning',
              size: 16,
            })
          ),
          React.createElement(
            'div',
            { className: 'cb-banner-body' },
            React.createElement(
              'div',
              null,
              (status.quotaWarning.code && t(status.quotaWarning.code, status.quotaWarning.params)) || status.quotaWarning.message
            ),
            status.quotaWarning.resetsAt
              ? React.createElement(
                  'div',
                  { className: 'cb-banner-sub' },
                  t('quota.reset_at', { time: new Date(status.quotaWarning.resetsAt).toLocaleTimeString() })
                )
              : null
          )
        )
      : (isLowQuota
          ? React.createElement(
              'div',
              { className: 'cb-banner-warning' },
              React.createElement(
                'span',
                { className: 'cb-banner-icon' },
                React.createElement(CbIcon, { name: 'warning', size: 16 })
              ),
              React.createElement('div', { className: 'cb-banner-body' }, t('quota.warning_low'))
            )
          : null),
    keyPresent
      ? React.createElement(
          'section',
          { className: 'cb-section-card' },
          React.createElement(
            'div',
            { className: 'cb-section-head' },
            React.createElement('div', { className: 'cb-section-title' }, t('quota.title')),
            React.createElement(
              'button',
              { type: 'button', className: 'cb-btn', disabled: !!busy, onClick: handleRefreshQuota },
              busy === 'refresh-quota' ? t('quota.refreshing') : t('quota.refresh')
            )
          ),
          React.createElement(
            'div',
            { className: 'cb-section-desc' },
            usage?.user?.email
              ? t('quota.account', { email: usage.user.email, plan: usage.plan || 'ClinePass' })
              : t('quota.desc')
          ),
          React.createElement(
            'div',
            { className: 'cb-quota-grid' },
            usage?.windows?.fiveHour
              ? React.createElement(ProgressBar, {
                  label: t('quota.window_5h'),
                  percentUsed: usage.windows.fiveHour.percentUsed || 0,
                  remainingPercent: usage.windows.fiveHour.remainingPercent || 100,
                  resetsAt: usage.windows.fiveHour.resetsAt,
                  windowMs: 5 * 60 * 60 * 1000,
                  t,
                })
              : null,
            React.createElement(ProgressBar, {
              label: t('quota.window_weekly'),
              percentUsed: usage?.windows?.weekly?.percentUsed || 0,
              remainingPercent: usage?.windows?.weekly?.remainingPercent || 100,
              resetsAt: usage?.windows?.weekly?.resetsAt,
              windowMs: 7 * 24 * 60 * 60 * 1000,
              t,
            }),
            usage?.windows?.monthly
              ? React.createElement(ProgressBar, {
                  label: t('quota.window_monthly'),
                  percentUsed: usage.windows.monthly.percentUsed || 0,
                  remainingPercent: usage.windows.monthly.remainingPercent || 100,
                  resetsAt: usage.windows.monthly.resetsAt,
                  windowMs: 30 * 24 * 60 * 60 * 1000,
                  t,
                })
              : null
          ),
          React.createElement(SettingRow, {
            title: t('sidebar.show_quota'),
            description: t('sidebar.show_quota_hint'),
            control: React.createElement(BooleanControl, {
              checked: showSidebarQuota !== false,
              label: t('sidebar.show_quota'),
              onChange: (next) => onToggleSidebarQuota && onToggleSidebarQuota(next),
            }),
          })
        )
      : null
  )
}
