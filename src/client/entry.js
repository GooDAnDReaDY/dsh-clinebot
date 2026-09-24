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

module.exports = { apply, inject: ['slots', 'locale', 'configForms'] }
