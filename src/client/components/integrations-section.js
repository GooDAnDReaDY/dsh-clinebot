/** Integrations & display settings: surfaces outside the chat request itself. */
function IntegrationToggle({ id, label, hint, checked, onChange }) {
  return React.createElement(SettingRow, {
    title: label,
    description: hint,
    htmlFor: id,
    control: React.createElement(BooleanControl, {
      checked: !!checked,
      label,
      onChange: (next) => onChange(next),
    }),
  })
}

/** Surfaces the user can hide wholesale (#344). Each entry is one persisted toggle. */
const SURFACE_TOGGLES = (t) => [
  { id: 'showQuotaPanel', label: t('settings.show_quota_panel'), hint: t('settings.show_quota_panel_hint') },
  { id: 'showUpdateBanner', label: t('settings.show_update_banner'), hint: t('settings.show_update_banner_hint') },
  { id: 'showAccountHistory', label: t('settings.show_account_history'), hint: t('settings.show_account_history_hint') },
  { id: 'showModelProbe', label: t('settings.show_model_probe'), hint: t('settings.show_model_probe_hint') },
  { id: 'showPriceSection', label: t('settings.show_price_section'), hint: t('settings.show_price_section_hint') },
  { id: 'showStatsSection', label: t('settings.show_stats_section'), hint: t('settings.show_stats_section_hint') },
  { id: 'showDiagnosticsSection', label: t('settings.show_diagnostics_section'), hint: t('settings.show_diagnostics_section_hint') },
]

function IntegrationsSection({ draft, onStage, t }) {
  const current = draft || {}
  return React.createElement(
    SettingsGroup,
    {
      title: t('settings.integrations'),
      description: t('settings.integrations_desc'),
      divided: true,
    },
    React.createElement(IntegrationToggle, {
      id: 'cb-web-search',
      label: t('settings.web_search'),
      hint: t('settings.web_search_hint'),
      checked: current.webSearch !== false,
      onChange: (value) => onStage({ webSearch: value }),
    }),
    React.createElement(IntegrationToggle, {
      id: 'cb-sidebar-quota',
      label: t('settings.sidebar_quota'),
      hint: t('settings.sidebar_quota_hint'),
      checked: Boolean(current.showSidebarQuota),
      onChange: (value) => onStage({ showSidebarQuota: value }),
    }),
    React.createElement(IntegrationToggle, {
      id: 'cb-composer-cost',
      label: t('settings.composer_cost'),
      hint: t('settings.composer_cost_hint'),
      checked: Boolean(current.showComposerCost),
      onChange: (value) => onStage({ showComposerCost: value }),
    }),
    ...SURFACE_TOGGLES(t).map(({ id, label, hint }) => React.createElement(IntegrationToggle, {
      key: id,
      id: `cb-${id}`,
      label,
      hint,
      checked: current[id] !== false,
      onChange: (value) => onStage({ [id]: value }),
    }))
  )
}
