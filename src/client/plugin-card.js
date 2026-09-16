function PluginCard(props) {
  const [open, setOpen] = React.useState(false)
  const t = props?.t || makeT(en, en)
  React.useEffect(() => {
    ensureCss()
  }, [])

  return React.createElement(
    'li',
    { className: 'cb-section-card', style: { listStyle: 'none', marginBottom: '12px' } },
    React.createElement(
      'button',
      {
        type: 'button',
        style: {
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          width: '100%',
          padding: 0,
          textAlign: 'left',
        },
        'aria-expanded': open,
        onClick: () => setOpen((v) => !v),
      },
      React.createElement(
        'div',
        { style: { flex: 1 } },
        React.createElement('div', { style: { fontWeight: 600, fontSize: '15px' } }, t('title')),
        React.createElement('div', { style: { fontSize: '13px', color: 'var(--dsw-alias-label-secondary)' } }, t('subtitle'))
      ),
      React.createElement('span', { className: 'cb-chevron' + (open ? ' cb-chevron-open' : '') },
        React.createElement(Chevron)
      )
    ),
    open
      ? React.createElement(
          'div',
          { style: { marginTop: '16px' } },
          React.createElement(
            ErrorBoundary,
            null,
            React.createElement(SettingsPage, { ...props, ctx: (props && props.ctx) || ctx })
          )
        )
      : null
  )
}
