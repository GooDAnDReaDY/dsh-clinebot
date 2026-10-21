function AccountHistory({ open, events = [], loading, accounts = [], t }) {
  if (!open) return null
  return React.createElement(
    'div',
    { className: 'cb-account-history' },
    React.createElement(
      'div',
      { className: 'cb-account-routes-head' },
      React.createElement(CbIcon, { name: 'route', size: 14 }),
      ` ${t('accounts.history_title')}`
    ),
    React.createElement('div', { className: 'cb-section-desc' }, t('accounts.history_hint')),
    loading
      ? React.createElement('div', { className: 'cb-hint' }, t('accounts.history_loading'))
      : events.length === 0
        ? React.createElement('div', { className: 'cb-hint' }, t('accounts.history_empty'))
        : React.createElement(
            'div',
            { className: 'cb-model-list' },
            events.map((event, index) => {
              const account = accounts.find((entry) => (entry.apiKeyEnv || entry.id) === event.accountId)
              const until = event.until
                ? ` · ${t('accounts.history_until', { time: new Date(event.until).toLocaleTimeString() })}`
                : ''
              return React.createElement(
                'div',
                { className: 'cb-model-row', key: `${event.at}-${index}` },
                React.createElement('span', { className: 'cb-mono' }, new Date(event.at).toLocaleString()),
                React.createElement(
                  'span',
                  { className: 'cb-muted' },
                  `${account?.label || event.accountId || '—'} · ${t(`accounts.event_${event.type}`)} · ${event.reason || '—'}${until}`
                )
              )
            })
          )
  )
}
