function refreshMirrorUntilVisible(ctx) {
  const visible = () => {
    try {
      const s = (ctx?.get && ctx.get('lanSettings')) || ctx?.settingsScope
      const view = s?.describe?.()?.getSnapshot?.()?.view
      return !!view && Array.isArray(view.namespaces) && view.namespaces.some((row) => row.ns === NS)
    } catch (_) {
      return false
    }
  }
  if (visible()) return () => {}
  let tries = 0
  const timer = setInterval(() => {
    if (visible() || tries >= 15) { clearInterval(timer); return }
    tries += 1
    try {
      const s = (ctx?.get && ctx.get('lanSettings')) || ctx?.settingsScope
      s?.describe?.()?.load?.()
    } catch (e) {
      console.debug?.('[dsh-clinebot] Polling settings mirror:', e)
    }
  }, 1000)
  return () => clearInterval(timer)
}

function apply(ctx) {
  const addLocale = (locale, dictionary) => {
    try {
      return ctx.locale.register(NS, locale, dictionary)
    } catch (_) {
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
      () => refreshMirrorUntilVisible(ctx),
      'dsh-clinebot: re-read the settings mirror until our namespace appears',
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

  // The seat the Plugins page actually renders as the plugin's own page with the
  // settings form: a card in the plugin list (`plugins.item`), exactly how
  // @goodandready-private/dsh-agentrouter does it. `view: 'summary'` is the card's
  // one-liner, `view: 'page'` is the body of that page.
  registerSlotWhenReady('plugins.item', () =>
    ctx.slots.register(
      {
        name: 'plugins.item',
        id: NS,
        order: 60,
        label: () => 'clinebot',
        locale: NS,
        inject: () => ({ ctx }),
      },
      (props) => React.createElement(ErrorBoundary, null, React.createElement(PluginCard, { ...props, ctx: (props && props.ctx) || ctx }))
    )
  )

  // Row seat first (the seat the current core renders), legacy seat after it.
  // The core keys the seat as `<bundle name>#<row id>`; `bundle.name` may be the
  // package name or the short bundle name depending on the manager's view, so both
  // spellings are registered — the unused one is inert.
  for (const key of [ROW_CONFIG_KEY, ROW_ID + '#' + ROW_ID]) {
    registerSlotWhenReady('plugins.row.config', () =>
      ctx.slots.register(
        {
          name: 'plugins.row.config',
          key,
          locale: NS,
          inject: () => ({ ctx }),
        },
        (props) => React.createElement(ErrorBoundary, null, React.createElement(PluginCard, { ...props, ctx: (props && props.ctx) || ctx }))
      )
    )
  }

  registerSlotWhenReady('settings.plugin.item', () =>
    ctx.slots.register(
      {
        name: 'settings.plugin.item',
        key: NS,
        locale: NS,
        inject: () => ({ ctx }),
      },
      (props) => React.createElement(ErrorBoundary, null, React.createElement(PluginCard, { ...props, ctx: (props && props.ctx) || ctx }))
    )
  )
}

module.exports = { apply, inject: ['slots', 'locale', 'settingsScope'] }
