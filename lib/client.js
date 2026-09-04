// Settings card: Plugins → Plugin settings (settings.plugin.item) & Settings section.
window.__ModuleLoader__.load({
  id: '@goodandready/dsh-clinebot',
  factory: (require) => {
    var module = { exports: {} }
    const React = require('react')
    const NS = 'dsh-clinebot'
    const TITLE = 'ClineBot (ClinePass)'
    const SUBTITLE = 'OpenAI-compatible routing via ClinePass subscription and curated open-weights models.'
    const ROUTE_PREFIX = '/api/plugins/dsh-clinebot'

    let ChevronIcon = null
    try {
      const primitives = require('@deepseek-ai/dsh-client-ui-primitives')
      ChevronIcon = primitives && primitives.IconChevronDownOutline14
    } catch {
      /* fallback used below */
    }

    function FallbackChevron() {
      return React.createElement(
        'svg',
        {
          width: 14,
          height: 14,
          viewBox: '0 0 14 14',
          fill: 'none',
          'aria-hidden': true,
        },
        React.createElement('path', {
          d: 'M3.5 5.25L7 8.75L10.5 5.25',
          stroke: 'currentColor',
          strokeWidth: 1.5,
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
        })
      )
    }
    const Chevron = ChevronIcon || FallbackChevron

    function ensureCss() {
      if (typeof document === 'undefined') return
      if (document.getElementById('dsh-clinebot-css')) return
      const style = document.createElement('style')
      style.id = 'dsh-clinebot-css'
      style.textContent = `
.cb-card{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-3);border-radius:12px;list-style:none;margin-bottom:12px}
.cb-head{appearance:none;width:100%;font:inherit;color:inherit;text-align:left;cursor:pointer;background:0 0;border:0;border-radius:12px;display:flex;align-items:center;gap:12px;padding:14px 16px}
.cb-title{color:var(--dsw-alias-label-primary);font-size:15px;font-weight:600;line-height:1.4}
.cb-sub{color:var(--dsw-alias-label-secondary);font-size:13px;line-height:1.4}
.cb-body{border-top:1px solid var(--dsw-alias-border-l2);margin:0 16px;padding-bottom:12px}
.cb-field{display:flex;flex-direction:column;gap:6px;padding:10px 0}
.cb-input{height:34px;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-3);color:var(--dsw-alias-label-primary);border-radius:8px;padding:0 12px;font-size:13px}
.cb-row{display:flex;flex-wrap:wrap;gap:8px;align-items:center;padding:8px 0}
.cb-btn{appearance:none;font:inherit;cursor:pointer;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;padding:5px 12px;font-size:13px;background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary)}
.cb-btn:hover:not(:disabled){background:var(--dsw-alias-bg-layer-1)}
.cb-save{appearance:none;font:inherit;cursor:pointer;border:1px solid transparent;border-radius:8px;padding:5px 14px;font-size:13px;background:var(--dsw-alias-label-primary);color:var(--dsw-alias-bg-layer-3);font-weight:500}
.cb-badge{font-size:12px;padding:2px 8px;border-radius:999px;border:1px solid var(--dsw-alias-border-l2);display:inline-flex;align-items:center;gap:4px}
.cb-badge-ok{border-color:var(--dsw-alias-state-success-primary);color:var(--dsw-alias-state-success-primary)}
.cb-badge-warn{border-color:var(--dsw-alias-state-warning-primary);color:var(--dsw-alias-state-warning-primary)}
.cb-badge-bad{border-color:var(--dsw-alias-state-error-primary);color:var(--dsw-alias-state-error-primary)}
.cb-ok{color:var(--dsw-alias-state-success-primary)}
.cb-bad{color:var(--dsw-alias-state-error-primary);font-size:13px;padding:6px 0}
.cb-chev{margin-left:auto;flex:none;color:var(--dsw-alias-label-tertiary);transition:transform .16s}
.cb-chev-open{transform:rotate(180deg)}
.cb-models-list{display:flex;flex-direction:column;gap:6px;max-height:220px;overflow-y:auto;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;padding:8px;margin-top:6px;background:var(--dsw-alias-bg-layer-2)}
.cb-model-item{display:flex;align-items:center;gap:8px;font-size:13px;padding:4px 6px;border-radius:6px}
.cb-model-item:hover{background:var(--dsw-alias-bg-layer-3)}
.cb-foot{border-top:1px solid var(--dsw-alias-border-l2);display:flex;justify-content:flex-end;gap:8px;padding:12px 0 4px}
.cb-preview{margin-top:6px;padding:8px 12px;border-radius:6px;background:var(--dsw-alias-bg-layer-2);font-family:monospace;font-size:12px;white-space:pre-wrap;word-break:break-all}
`
      document.head.appendChild(style)
    }

    function Section() {
      const [status, setStatus] = React.useState(null)
      const [draft, setDraft] = React.useState(null)
      const [busy, setBusy] = React.useState('')
      const [err, setErr] = React.useState('')
      const [msg, setMsg] = React.useState('')
      const [smokeResult, setSmokeResult] = React.useState(null)

      const load = React.useCallback(async () => {
        setErr('')
        const res = await fetch(`${ROUTE_PREFIX}/status`, { cache: 'no-store' })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
        setStatus(data)
        setDraft(data.config || {})
      }, [])

      React.useEffect(() => {
        load().catch((e) => setErr(String(e.message || e)))
      }, [load])

      async function registerProvider() {
        setBusy('register')
        setErr('')
        setMsg('')
        try {
          const res = await fetch(`${ROUTE_PREFIX}/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ models: draft.enabledModels }),
          })
          const data = await res.json().catch(() => ({}))
          if (!data.ok) throw new Error(data.error || `HTTP ${res.status}`)
          setMsg('Registered in DSH Models successfully.')
          await load()
        } catch (e) {
          setErr(String(e.message || e))
        } finally {
          setBusy('')
        }
      }

      async function unregisterProvider() {
        setBusy('unregister')
        setErr('')
        setMsg('')
        try {
          const res = await fetch(`${ROUTE_PREFIX}/unregister`, { method: 'POST' })
          const data = await res.json().catch(() => ({}))
          if (!data.ok) throw new Error(data.error || `HTTP ${res.status}`)
          setMsg('Removed from DSH Models.')
          await load()
        } catch (e) {
          setErr(String(e.message || e))
        } finally {
          setBusy('')
        }
      }

      async function runSmoke() {
        setBusy('smoke')
        setErr('')
        setMsg('')
        setSmokeResult(null)
        try {
          const res = await fetch(`${ROUTE_PREFIX}/smoke`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ model: draft.defaultModel }),
          })
          const data = await res.json().catch(() => ({}))
          if (!data.ok) throw new Error(data.error || `HTTP ${res.status}`)
          setSmokeResult(data)
          setMsg(`Smoke test OK (${data.latencyMs}ms) — Model: ${data.model}`)
        } catch (e) {
          setErr(String(e.message || e))
        } finally {
          setBusy('')
        }
      }

      function toggleModel(id) {
        if (!draft) return
        const current = new Set(draft.enabledModels || [])
        if (current.has(id)) {
          current.delete(id)
        } else {
          current.add(id)
        }
        setDraft({ ...draft, enabledModels: Array.from(current) })
      }

      if (!status || !draft) {
        return React.createElement('div', { className: 'cb-sub' }, err || 'Loading ClineBot status…')
      }

      const healthOk = !!status.health?.ok
      const keyPresent = !!status.key?.present
      const isRegistered = !!status.isRegistered
      const modelsList = status.availableModels || []
      const enabledSet = new Set(draft.enabledModels || [])

      return React.createElement(
        'div',
        null,
        React.createElement(
          'div',
          { className: 'cb-row' },
          React.createElement(
            'span',
            { className: `cb-badge ${healthOk ? 'cb-badge-ok' : 'cb-badge-bad'}` },
            healthOk ? `Host online (${status.health.latencyMs}ms)` : 'Host unreachable'
          ),
          React.createElement(
            'span',
            { className: `cb-badge ${keyPresent ? 'cb-badge-ok' : 'cb-badge-warn'}` },
            keyPresent ? `Key ✓ (${status.key.source})` : 'Key missing'
          ),
          React.createElement(
            'span',
            { className: `cb-badge ${isRegistered ? 'cb-badge-ok' : 'cb-badge-warn'}` },
            isRegistered ? 'DSH Registered' : 'Not Registered'
          ),
          React.createElement(
            'button',
            {
              type: 'button',
              className: 'cb-btn',
              disabled: !!busy,
              onClick: () => load().catch((e) => setErr(String(e.message || e))),
            },
            'Refresh'
          )
        ),
        React.createElement(
          'div',
          { className: 'cb-field' },
          React.createElement('label', { className: 'cb-sub' }, 'Base URL (OpenAI-compatible)'),
          React.createElement('input', {
            className: 'cb-input',
            value: draft.baseUrl || '',
            readOnly: true,
          }),
          React.createElement(
            'div',
            { className: 'cb-sub' },
            'Standard endpoint: https://api.cline.bot/api/v1'
          )
        ),
        React.createElement(
          'div',
          { className: 'cb-field' },
          React.createElement('label', { className: 'cb-sub' }, 'API Key Credential Name'),
          React.createElement('input', {
            className: 'cb-input',
            value: draft.apiKeyEnv || 'CLINEBOT_API_KEY',
            readOnly: true,
          }),
          React.createElement(
            'div',
            { className: 'cb-sub' },
            'Add your ClinePass key into DSH credentials (~/.dsh/.credentials.yaml) under the name CLINEBOT_API_KEY.'
          )
        ),
        React.createElement(
          'div',
          { className: 'cb-field' },
          React.createElement('label', { className: 'cb-sub' }, 'Default Model'),
          React.createElement(
            'select',
            {
              className: 'cb-input',
              value: draft.defaultModel || 'cline-pass/deepseek-v4-flash',
              onChange: (e) => setDraft({ ...draft, defaultModel: e.target.value }),
            },
            modelsList.map((m) =>
              React.createElement('option', { key: m.id, value: m.id }, `${m.name} (${m.id})`)
            )
          )
        ),
        React.createElement(
          'div',
          { className: 'cb-field' },
          React.createElement(
            'label',
            { className: 'cb-sub' },
            `ClinePass Models Catalog (${enabledSet.size}/${modelsList.length} enabled)`
          ),
          React.createElement(
            'div',
            { className: 'cb-models-list' },
            modelsList.map((m) =>
              React.createElement(
                'label',
                { key: m.id, className: 'cb-model-item' },
                React.createElement('input', {
                  type: 'checkbox',
                  checked: enabledSet.has(m.id),
                  onChange: () => toggleModel(m.id),
                }),
                React.createElement('span', { style: { fontWeight: 500 } }, m.name),
                React.createElement('span', { className: 'cb-sub' }, m.id),
                m.input?.includes('vision')
                  ? React.createElement('span', { className: 'cb-badge' }, 'vision')
                  : null
              )
            )
          )
        ),
        err ? React.createElement('div', { className: 'cb-bad' }, err) : null,
        msg ? React.createElement('div', { className: 'cb-ok cb-sub' }, msg) : null,
        smokeResult?.preview
          ? React.createElement(
              'div',
              { className: 'cb-preview' },
              `Response Preview: ${smokeResult.preview}`
            )
          : null,
        React.createElement(
          'div',
          { className: 'cb-foot' },
          React.createElement(
            'button',
            {
              type: 'button',
              className: 'cb-btn',
              disabled: !!busy || !keyPresent,
              onClick: runSmoke,
            },
            busy === 'smoke' ? 'Testing…' : 'Smoke Test'
          ),
          isRegistered
            ? React.createElement(
                'button',
                {
                  type: 'button',
                  className: 'cb-btn',
                  disabled: !!busy,
                  onClick: unregisterProvider,
                },
                busy === 'unregister' ? '…' : 'Unregister'
              )
            : null,
          React.createElement(
            'button',
            {
              type: 'button',
              className: 'cb-save',
              disabled: !!busy,
              onClick: registerProvider,
            },
            busy === 'register' ? 'Saving…' : 'Register / Sync in DSH'
          )
        )
      )
    }

    function PluginCard() {
      const [open, setOpen] = React.useState(false)
      React.useEffect(() => {
        ensureCss()
      }, [])

      return React.createElement(
        'li',
        { className: 'cb-card' },
        React.createElement(
          'button',
          {
            type: 'button',
            className: 'cb-head',
            'aria-expanded': open,
            onClick: () => setOpen((v) => !v),
          },
          React.createElement(
            'div',
            { style: { flex: 1 } },
            React.createElement('div', { className: 'cb-title' }, TITLE),
            React.createElement('div', { className: 'cb-sub' }, SUBTITLE)
          ),
          React.createElement(
            'span',
            { className: 'cb-chev' + (open ? ' cb-chev-open' : '') },
            React.createElement(Chevron)
          )
        ),
        open ? React.createElement('div', { className: 'cb-body' }, React.createElement(Section)) : null
      )
    }

    function apply(ctx) {
      let placed = false
      ctx.slots.inject('settings.plugin.item', () => {
        placed = true
        return ctx.slots.register(
          { name: 'settings.plugin.item', key: NS },
          PluginCard
        )
      })

      const timer = setTimeout(() => {
        if (placed) return
        ctx.slots.inject('settings.section', () =>
          ctx.slots.register(
            {
              name: 'settings.section',
              id: '@goodandready/dsh-clinebot',
              order: 35,
              label: () => TITLE,
            },
            Section
          )
        )
      }, 3000)

      ctx.effect(() => () => clearTimeout(timer), 'dsh-clinebot: fallback section')
    }

    module.exports = { apply, inject: ['slots'] }
    return module.exports
  },
})
