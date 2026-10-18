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
          React.createElement('span', { style: { fontSize: '16px' } }, status.quotaWarning.level === 'exhausted' ? '🚨' : '⚠️'),
          React.createElement(
            'div',
            { style: { flex: 1 } },
            React.createElement('div', null, (status.quotaWarning.code && t(status.quotaWarning.code, status.quotaWarning.params)) || status.quotaWarning.message),
            status.quotaWarning.resetsAt
              ? React.createElement(
                  'div',
                  { style: { fontSize: '11px', opacity: 0.9, marginTop: '2px' } },
                  t('quota.reset_at', { time: new Date(status.quotaWarning.resetsAt).toLocaleTimeString() })
                )
              : null
          )
        )
      : (isLowQuota
          ? React.createElement(
              'div',
              { className: 'cb-banner-warning' },
              React.createElement('span', { style: { fontSize: '16px' } }, '⚠️'),
              React.createElement('div', { style: { flex: 1 } }, t('quota.warning_low'))
            )
          : null),
    keyPresent
      ? React.createElement(
          'div',
          { className: 'cb-section-card' },
          React.createElement(
            'div',
            { className: 'cb-section-title' },
            t('quota.title'),
            React.createElement(
              'button',
              {
                type: 'button',
                className: 'cb-btn',
                disabled: !!busy,
                onClick: handleRefreshQuota,
              },
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
            { className: 'cb-grid-2', style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '10px' } },
            usage?.windows?.fiveHour
              ? React.createElement(ProgressBar, {
                  label: t('quota.window_5h'),
                  percentUsed: usage.windows.fiveHour.percentUsed || 0,
                  remainingPercent: usage.windows.fiveHour.remainingPercent || 100,
                  resetsAt: usage.windows.fiveHour.resetsAt,
                  t,
                })
              : null,
            React.createElement(ProgressBar, {
              label: t('quota.window_weekly'),
              percentUsed: usage?.windows?.weekly?.percentUsed || 0,
              remainingPercent: usage?.windows?.weekly?.remainingPercent || 100,
              resetsAt: usage?.windows?.weekly?.resetsAt,
              t,
            }),
            usage?.windows?.monthly
              ? React.createElement(ProgressBar, {
                  label: t('quota.window_monthly'),
                  percentUsed: usage.windows.monthly.percentUsed || 0,
                  remainingPercent: usage.windows.monthly.remainingPercent || 100,
                  resetsAt: usage.windows.monthly.resetsAt,
                  t,
                })
              : null
          ),
          React.createElement(
            'div',
            { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '24px', marginTop: '4px', paddingTop: '16px', borderTop: '.5px solid var(--dsw-alias-border-l2)' } },
            React.createElement(
              'div',
              { style: { display: 'flex', flexDirection: 'column', minWidth: 0 } },
              React.createElement('span', { style: { fontSize: '14px', lineHeight: '20px', color: 'var(--dsw-alias-label-primary)' } }, t('sidebar.show_quota')),
              React.createElement('span', { style: { marginTop: '4px', fontSize: '12px', lineHeight: '18px', color: 'var(--dsw-alias-label-secondary)' } }, t('sidebar.show_quota_hint'))
            ),
            React.createElement(BooleanControl, {
              checked: showSidebarQuota !== false,
              label: t('sidebar.show_quota'),
              onChange: (next) => onToggleSidebarQuota && onToggleSidebarQuota(next),
            })
          )
        )
      : null
  )
}
