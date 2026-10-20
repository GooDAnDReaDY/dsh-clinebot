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

function IntegrationsSection({ draft, onStage, transport, t }) {
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
      checked: current.showSidebarQuota !== false,
      onChange: (value) => onStage({ showSidebarQuota: value }),
    }),
    React.createElement(IntegrationToggle, {
      id: 'cb-composer-cost',
      label: t('settings.composer_cost'),
      hint: t('settings.composer_cost_hint'),
      checked: current.showComposerCost !== false,
      onChange: (value) => onStage({ showComposerCost: value }),
    }),
    transport === 'pi-ai'
      ? React.createElement(IntegrationToggle, {
        id: 'cb-proxy-mode',
        label: t('settings.proxy_mode'),
        hint: t('settings.proxy_mode_hint'),
        checked: current.proxyMode !== false,
        onChange: (value) => onStage({ proxyMode: value }),
      })
      : null
  )
}
