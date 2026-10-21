function AnalyticsControls({
  analyticsDays,
  setAnalyticsDays,
  groupBy,
  setGroupBy,
  model,
  setModel,
  account,
  setAccount,
  errorsOnly,
  setErrorsOnly,
  from,
  setFrom,
  to,
  setTo,
  models = [],
  accounts = [],
  t,
}) {
  return React.createElement(
    'div',
    { className: 'cb-analytics-controls' },
    React.createElement(
      'select',
      {
        className: 'cb-heat-select',
        value: String(analyticsDays),
        title: t('analytics.range'),
        onChange: (event) => setAnalyticsDays(Number(event.target.value)),
      },
      React.createElement('option', { value: '1' }, t('analytics.range_24h')),
      React.createElement('option', { value: '7' }, t('analytics.range_7')),
      React.createElement('option', { value: '30' }, t('analytics.range_30')),
      React.createElement('option', { value: '90' }, t('analytics.range_90'))
    ),
    React.createElement('input', {
      type: 'datetime-local',
      className: 'cb-input cb-analytics-date',
      title: t('analytics.from'),
      'aria-label': t('analytics.from'),
      value: from,
      onChange: (event) => setFrom(event.target.value),
    }),
    React.createElement('input', {
      type: 'datetime-local',
      className: 'cb-input cb-analytics-date',
      title: t('analytics.to'),
      'aria-label': t('analytics.to'),
      value: to,
      onChange: (event) => setTo(event.target.value),
    }),
    React.createElement(
      'select',
      {
        className: 'cb-heat-select',
        value: model,
        title: t('analytics.model_filter'),
        onChange: (event) => setModel(event.target.value),
      },
      React.createElement('option', { value: '' }, t('analytics.all_models')),
      models.map((item) => React.createElement('option', { key: item.id, value: item.id }, item.name || item.id))
    ),
    React.createElement(
      'select',
      {
        className: 'cb-heat-select',
        value: account,
        title: t('analytics.account_filter'),
        onChange: (event) => setAccount(event.target.value),
      },
      React.createElement('option', { value: '' }, t('analytics.all_accounts')),
      accounts.map((item) => React.createElement(
        'option',
        { key: item.apiKeyEnv || item.id, value: item.apiKeyEnv || item.id },
        item.label || item.apiKeyEnv || item.id
      ))
    ),
    React.createElement(
      'button',
      {
        type: 'button',
        className: errorsOnly ? 'cb-btn cb-btn-primary' : 'cb-btn',
        onClick: () => setErrorsOnly((value) => !value),
      },
      t('analytics.errors_only')
    ),
    React.createElement(
      'div',
      { className: 'cb-seg' },
      ['model', 'day', 'account', 'session'].map((group) => React.createElement(
        'button',
        {
          key: group,
          type: 'button',
          className: groupBy === group ? 'cb-seg-item cb-seg-item-active' : 'cb-seg-item',
          onClick: () => setGroupBy(group),
        },
        t(`analytics.group_${group}`)
      ))
    )
  )
}
