function ensureSettingsForm(ctx) {
  const svc = readConfigForms(ctx)
  if (!svc || typeof svc.get !== 'function') return
  try {
    svc.get(NS)
  } catch (err) {
    console.warn('[dsh-clinebot] configForms.get failed:', err)
  }
}

function apply(ctx) {
  // The stylesheet has to be in the document before any of this plugin's slots
  // render. `sidebar.footer.action` and `main` mount on boot, so leaving the
  // injection to the settings page's mount effect renders those seats unstyled
  // until the user opens the plugin page.
  ensureCss()

  const addLocale = (locale, dictionary) => {
    try {
      return ctx.locale.register(NS, locale, dictionary)
    } catch (err) {
      console.warn(`[dsh-clinebot] Failed to register locale dictionary for ns "${NS}", locale "${locale}":`, err)
      return () => {}
    }
  }
  if (ctx.locale && ctx.locale.register) {
    if (typeof ctx.effect === 'function') {
      ctx.effect(() => {
        const undo = [addLocale('en', en), addLocale('zh', zh)]
        return () => { for (const off of undo) off() }
      }, 'dsh-clinebot: dictionaries')
    } else {
      addLocale('en', en)
      addLocale('zh', zh)
    }
  }

  if (typeof ctx.effect === 'function') {
    ctx.effect(
      () => { ensureSettingsForm(ctx) },
      'dsh-clinebot: open the settings form for this namespace',
    )
  }

  function registerSlotWhenReady(slotName, registerFn) {
    if (!ctx.slots) return
    if (typeof ctx.slots.inject === 'function') {
      try {
        ctx.slots.inject(slotName, () => {
          try {
            return registerFn()
          } catch (err) {
            console.warn('[dsh-clinebot] Error registering slot ' + slotName + ':', err)
          }
        })
        return
      } catch (err) {
        console.warn('[dsh-clinebot] Failed to inject slot ' + slotName + ':', err)
      }
    }
    if (typeof ctx.slots.register === 'function') {
      try {
        registerFn()
      } catch (err) {
        console.warn('[dsh-clinebot] Failed direct registration for ' + slotName + ':', err)
      }
    }
  }

  function selectLayoutPanel(id) {
    try {
      const layout = typeof ctx.get === 'function' ? ctx.get('layout') : ctx.layout
      if (!layout || typeof layout.selectPanel !== 'function') return false
      layout.selectPanel(id)
      return true
    } catch (err) {
      console.warn('[dsh-clinebot] layout.selectPanel failed:', err)
      return false
    }
  }

  const openPanel = () => selectLayoutPanel('clinebot-panel')
  const closePanel = () => {
    if (selectLayoutPanel(null)) return
    selectLayoutPanel('conversation')
  }

  // The plugin's configuration is a section of DSH Settings (`settings.section`),
  // a peer of General/Models/Plugins — not a row in the Plugins list and not a tab
  // inside the Plugins settings section. The shell owns the modal, the section nav
  // and the scrolling body, and hands a section `close` as its one affordance; the
  // section draws its own content. An unregistered id gets the shell's default
  // settings glyph in the nav.
  registerSlotWhenReady('settings.section', () =>
    ctx.slots.register(
      {
        name: 'settings.section',
        id: NS,
        order: 30,
        label: () => {
          try {
            const t = ctx.locale && typeof ctx.locale.bind === 'function' ? ctx.locale.bind(NS) : null
            const label = t ? t('nav') : ''
            return label && label !== 'nav' ? label : 'ClineBot'
          } catch (_) {
            return 'ClineBot'
          }
        },
        locale: NS,
        inject: () => ({ ctx }),
      },
      (props) => React.createElement(ErrorBoundary, { t: props && props.t }, React.createElement(SettingsPage, { ...props, ctx: (props && props.ctx) || ctx }))
    )
  )

  // Sidebar Quota Meter (sidebar.footer.action slot)
  registerSlotWhenReady('sidebar.footer.action', () =>
    ctx.slots.register(
      {
        name: 'sidebar.footer.action',
        id: 'clinebot-quota',
        order: 20,
        locale: NS,
        inject: () => ({ ctx, open: openPanel }),
      },
      (props) => React.createElement(ErrorBoundary, { t: props && props.t }, React.createElement(SidebarQuota, { ...props, ctx: (props && props.ctx) || ctx }))
    )
  )

  // The quota & usage dashboard opens in the layout's center column, matching
  // the Command Code / OpenCode provider surfaces. The sidebar card selects it
  // through `layout.selectPanel`; the panel's Close button selects the
  // conversation again. When no layout service is available the card falls back
  // to its local Modal.
  registerSlotWhenReady('main', () =>
    ctx.slots.register(
      {
        name: 'main',
        key: 'clinebot-panel',
        locale: NS,
        inject: () => ({ ctx, open: openPanel, close: closePanel }),
      },
      (props) => React.createElement(
        ErrorBoundary,
        { t: props && props.t },
        React.createElement(DashboardDialog, {
          ...props,
          panel: true,
          ctx: (props && props.ctx) || ctx,
          onClose: (props && props.close) || closePanel,
        })
      )
    )
  )

  // Models-page provider card. The seat is keyed by the provider's settings
  // namespace, which the native adapter registration declares as `dsh-clinebot`
  // (`settingsNs`). The component returns null for every other provider row, so
  // it cannot leak onto a sibling's card.
  registerSlotWhenReady('settings.models.provider-card', () =>
    ctx.slots.register(
      {
        name: 'settings.models.provider-card',
        key: NS,
        locale: NS,
        inject: () => ({ ctx }),
      },
      (props) => React.createElement(
        ErrorBoundary,
        { t: props && props.t },
        React.createElement(ProviderCard, { ...props, ctx: (props && props.ctx) || ctx })
      )
    )
  )

  // Composer Session Cost Dock (conversation.composer.dock slot)
  registerSlotWhenReady('conversation.composer.dock', () =>
    ctx.slots.register(
      {
        name: 'conversation.composer.dock',
        id: 'clinebot-cost',
        order: 10,
        locale: NS,
        inject: () => ({ ctx }),
      },
      (props) => React.createElement(ErrorBoundary, { t: props && props.t }, React.createElement(ComposerCostDock, { ...props, ctx: (props && props.ctx) || ctx }))
    )
  )
}

module.exports = { apply, inject: ['slots', 'locale', 'configForms'] }
