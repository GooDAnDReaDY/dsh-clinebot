/** Advanced connection, timeout and storage settings. */
function AdvancedField({ id, label, hint, value, type, onChange }) {
  return React.createElement(SettingRow, {
    title: label,
    description: hint,
    htmlFor: id,
    control: React.createElement('input', {
      id,
      className: 'cb-input cb-settings-input',
      type: type || 'text',
      value: value === undefined || value === null ? '' : String(value),
      onChange: (event) => onChange(event.target.value),
    }),
  })
}

function AdvancedSection({ draft, onStage, t }) {
  const current = draft || {}
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
      onChange: numeric('timeoutMs', 0),
    }),
    React.createElement(AdvancedField, {
      id: 'cb-smoke-timeout',
      label: t('settings.smoke_timeout'),
      hint: t('settings.smoke_timeout_hint'),
      value: current.smokeTimeoutMs,
      type: 'number',
      onChange: numeric('smokeTimeoutMs', 0),
    }),
    React.createElement(AdvancedField, {
      id: 'cb-stream-idle',
      label: t('settings.stream_idle'),
      hint: t('settings.stream_idle_hint'),
      value: current.streamIdleTimeoutMs,
      type: 'number',
      onChange: numeric('streamIdleTimeoutMs', 0),
    }),
    React.createElement(AdvancedField, {
      id: 'cb-max-payload',
      label: t('settings.max_payload'),
      hint: t('settings.max_payload_hint'),
      value: current.maxPayloadMb,
      type: 'number',
      onChange: numeric('maxPayloadMb', 0),
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
