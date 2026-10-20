/**
 * Shared settings layout primitives: a titled group, a foldable group, a
 * title/description/control row, and the floating staged-save bar.
 */
function SettingsGroup({ title, description, divided = false, action, children }) {
  return React.createElement(
    'section',
    { className: divided ? 'cb-settings-group cb-settings-group-divided' : 'cb-settings-group', 'aria-label': title },
    React.createElement(
      'div',
      { className: 'cb-settings-group-head' },
      React.createElement('h3', { className: 'cb-settings-group-title' }, title),
      action ? React.createElement('span', { className: 'cb-settings-group-action' }, action) : null
    ),
    description ? React.createElement('div', { className: 'cb-settings-group-desc' }, description) : null,
    React.createElement('div', { className: 'cb-settings-group-body' }, children)
  )
}

function CollapsibleGroup({ title, description, defaultOpen = false, divided = false, badge, children }) {
  const [open, setOpen] = React.useState(Boolean(defaultOpen))
  return React.createElement(
    'section',
    { className: divided ? 'cb-settings-group cb-settings-group-divided' : 'cb-settings-group', 'aria-label': title },
    React.createElement(
      'button',
      {
        type: 'button',
        className: 'cb-settings-group-head cb-settings-disclosure',
        'aria-expanded': open,
        onClick: () => setOpen((value) => !value),
      },
      React.createElement('span', { className: 'cb-settings-group-title' }, title),
      badge !== undefined && badge !== '' ? React.createElement('span', { className: 'cb-badge' }, badge) : null,
      React.createElement('span', { className: 'cb-settings-spacer' }),
      React.createElement('span', { className: open ? 'cb-settings-chevron cb-settings-chevron-open' : 'cb-settings-chevron', 'aria-hidden': 'true' }, '›')
    ),
    open && description ? React.createElement('div', { className: 'cb-settings-group-desc' }, description) : null,
    open ? React.createElement('div', { className: 'cb-settings-group-body' }, children) : null
  )
}

function SettingRow({ title, description, control, error, htmlFor }) {
  return React.createElement(
    'div',
    { className: 'cb-settings-row' },
    React.createElement(
      'div',
      { className: 'cb-settings-row-text' },
      htmlFor
        ? React.createElement('label', { className: 'cb-settings-row-title', htmlFor }, title)
        : React.createElement('span', { className: 'cb-settings-row-title' }, title),
      error
        ? React.createElement('div', { className: 'cb-settings-row-error' }, error)
        : (description ? React.createElement('div', { className: 'cb-settings-row-desc' }, description) : null)
    ),
    control ? React.createElement('div', { className: 'cb-settings-row-control' }, control) : null
  )
}

function SaveBar({ pendingCount, saving, saveState, saveError, invalid, validationError, onSave, onDiscard, t }) {
  const visible = pendingCount > 0 || saving || saveState === 'saved' || saveState === 'error'
  if (!visible) return null
  const message = saveError
    || validationError
    || (saving
      ? t('settings.saving')
      : (saveState === 'saved' ? t('settings.saved') : t('settings.unsaved', { count: pendingCount })))
  return React.createElement(
    'div',
    { className: 'cb-savebar', role: 'status' },
    React.createElement(
      'div',
      { className: 'cb-savebar-inner' },
      React.createElement('span', { className: 'cb-savebar-text' }, message),
      React.createElement('span', { className: 'cb-settings-spacer' }),
      React.createElement(
        'button',
        {
          type: 'button',
          className: 'cb-btn',
          disabled: saving || pendingCount === 0,
          onClick: onDiscard,
        },
        t('settings.discard')
      ),
      React.createElement(
        'button',
        {
          type: 'button',
          className: 'cb-btn cb-btn-primary',
          disabled: saving || pendingCount === 0 || invalid,
          onClick: onSave,
        },
        saving ? t('settings.saving') : t('settings.save')
      )
    )
  )
}
