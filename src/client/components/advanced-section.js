/** Advanced connection, timeout and storage settings. */
function AdvancedField({ id, label, hint, value, type, onChange, error }) {
  return React.createElement(SettingRow, {
    title: label,
    description: hint,
    htmlFor: id,
    error,
    control: React.createElement('input', {
      id,
      className: 'cb-input cb-settings-input',
      type: type || 'text',
      value: value === undefined || value === null ? '' : String(value),
      'aria-invalid': error ? 'true' : undefined,
      onChange: (event) => onChange(event.target.value),
    }),
  })
}

function AdvancedSection({ draft, onStage, t }) {
  const current = draft || {}
  const errorFor = (key, minimum) => {
    const raw = current[key]
    if (raw === undefined || raw === null || raw === '') return undefined
    const value = Number(raw)
    return Number.isFinite(value) && value > minimum ? undefined : t('settings.save_invalid_number')
  }
  const numeric = (key, minimum) => (raw) => {
    if (raw === '') return
    const value = Number(raw)
    if (Number.isFinite(value) && value > minimum) onStage({ [key]: value })
  }
  return React.createElement(
    CollapsibleGroup,
    {
      title: t('settings.advanced'),
      description: t('settings.advanced_desc'),
      divided: true,
      defaultOpen: false,
    },
    React.createElement(AdvancedField, {
      id: 'cb-base-url',
      label: t('settings.base_url'),
      hint: t('settings.base_url_hint'),
      value: current.baseUrl,
      onChange: (value) => onStage({ baseUrl: value }),
    }),
    React.createElement(AdvancedField, {
      id: 'cb-timeout',
      label: t('settings.timeout'),
      hint: t('settings.timeout_hint'),
      value: current.timeoutMs,
      type: 'number',
      error: errorFor('timeoutMs', 0),
      onChange: numeric('timeoutMs', 0),
    }),
    React.createElement(AdvancedField, {
      id: 'cb-smoke-timeout',
      label: t('settings.smoke_timeout'),
      hint: t('settings.smoke_timeout_hint'),
      value: current.smokeTimeoutMs,
      type: 'number',
      error: errorFor('smokeTimeoutMs', 0),
      onChange: numeric('smokeTimeoutMs', 0),
    }),
    React.createElement(AdvancedField, {
      id: 'cb-stream-idle',
      label: t('settings.stream_idle'),
      hint: t('settings.stream_idle_hint'),
      value: current.streamIdleTimeoutMs,
      type: 'number',
      error: errorFor('streamIdleTimeoutMs', 0),
      onChange: numeric('streamIdleTimeoutMs', 0),
    }),
    React.createElement(AdvancedField, {
      id: 'cb-max-payload',
      label: t('settings.max_payload'),
      hint: t('settings.max_payload_hint'),
      value: current.maxPayloadMb,
      type: 'number',
      error: errorFor('maxPayloadMb', 0),
      onChange: numeric('maxPayloadMb', 0),
    }),
    React.createElement(AdvancedField, {
      id: 'cb-retention',
      label: t('settings.stats_retention'),
      hint: t('settings.stats_retention_hint'),
      value: current.statsRetentionDays,
      type: 'number',
      error: errorFor('statsRetentionDays', -1),
      onChange: numeric('statsRetentionDays', -1),
    }),
    React.createElement(AdvancedField, {
      id: 'cb-daily-budget',
      label: t('settings.daily_budget'),
      hint: t('settings.daily_budget_hint'),
      value: current.dailyBudgetUsd,
      type: 'number',
      error: errorFor('dailyBudgetUsd', -1),
      onChange: numeric('dailyBudgetUsd', -1),
    }),
    React.createElement(AdvancedField, {
      id: 'cb-monthly-budget',
      label: t('settings.monthly_budget'),
      hint: t('settings.monthly_budget_hint'),
      value: current.monthlyBudgetUsd,
      type: 'number',
      error: errorFor('monthlyBudgetUsd', -1),
      onChange: numeric('monthlyBudgetUsd', -1),
    }),
    React.createElement(AdvancedField, {
      id: 'cb-stats-path',
      label: t('settings.stats_path'),
      hint: t('settings.stats_path_hint'),
      value: current.statsPath,
      onChange: (value) => onStage({ statsPath: value }),
    }),
    React.createElement(AdvancedField, {
      id: 'cb-models-cache-path',
      label: t('settings.models_cache_path'),
      hint: t('settings.models_cache_path_hint'),
      value: current.modelsCachePath,
      onChange: (value) => onStage({ modelsCachePath: value }),
    })
  )
}
