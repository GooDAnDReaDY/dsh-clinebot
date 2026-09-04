// Dedicated Settings Page: Settings → ClineBot (settings.section)
// & Plugin Card (settings.plugin.item).
window.__ModuleLoader__.load({
  id: '@goodandready/dsh-clinebot',
  factory: (require) => {
    var module = { exports: {} }
    const React = require('react')
    const NS = 'dsh-clinebot'
    const TITLE = 'ClineBot'
    const SUBTITLE = 'ClinePass subscription ($9.99/mo) with curated & custom models.'
    const ROUTE_PREFIX = '/api/plugins/dsh-clinebot'

    let ChevronIcon = null
    try {
      const primitives = require('@deepseek-ai/dsh-client-ui-primitives')
      ChevronIcon = primitives && primitives.IconChevronDownOutline14
    } catch {
      /* fallback */
    }

    function FallbackChevron() {
      return React.createElement(
        'svg',
        { width: 14, height: 14, viewBox: '0 0 14 14', fill: 'none', 'aria-hidden': true },
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
      if (document.getElementById('dsh-clinebot-full-css')) return
      const style = document.createElement('style')
      style.id = 'dsh-clinebot-full-css'
      style.textContent = `
.cb-page{display:flex;flex-direction:column;gap:20px;padding:8px 0 32px;max-width:960px}
.cb-header{display:flex;flex-direction:column;gap:8px;padding-bottom:16px;border-bottom:1px solid var(--dsw-alias-border-l2)}
.cb-page-title{font-size:22px;font-weight:700;color:var(--dsw-alias-label-primary);display:flex;align-items:center;gap:10px}
.cb-page-sub{font-size:14px;color:var(--dsw-alias-label-secondary);line-height:1.5}

.cb-section-card{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-3);border-radius:12px;padding:18px 20px;display:flex;flex-direction:column;gap:14px}
.cb-section-title{font-size:16px;font-weight:600;color:var(--dsw-alias-label-primary);display:flex;align-items:center;justify-content:space-between}
.cb-section-desc{font-size:13px;color:var(--dsw-alias-label-secondary);margin-top:-6px;line-height:1.4}

.cb-row{display:flex;flex-wrap:wrap;gap:10px;align-items:center}
.cb-grid-2{display:grid;grid-template-columns:repeat(auto-fit, minmax(280px, 1fr));gap:14px}

.cb-badge{font-size:12px;padding:3px 10px;border-radius:999px;border:1px solid var(--dsw-alias-border-l2);display:inline-flex;align-items:center;gap:5px;font-weight:500}
.cb-badge-ok{border-color:var(--dsw-alias-state-success-primary);color:var(--dsw-alias-state-success-primary);background:rgba(16,185,129,0.08)}
.cb-badge-warn{border-color:var(--dsw-alias-state-warning-primary);color:var(--dsw-alias-state-warning-primary);background:rgba(245,158,11,0.08)}
.cb-badge-bad{border-color:var(--dsw-alias-state-error-primary);color:var(--dsw-alias-state-error-primary);background:rgba(239,68,68,0.08)}

.cb-input{height:36px;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);border-radius:8px;padding:0 12px;font-size:13px;width:100%;box-sizing:border-box}
.cb-input:focus{outline:none;border-color:var(--dsw-alias-state-brand-primary)}
.cb-input-group{display:flex;gap:8px;align-items:center}

.cb-btn{appearance:none;font:inherit;cursor:pointer;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;padding:7px 14px;font-size:13px;background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);font-weight:500;display:inline-flex;align-items:center;justify-content:center;gap:6px}
.cb-btn:hover:not(:disabled){background:var(--dsw-alias-bg-layer-1)}
.cb-btn-primary{background:var(--dsw-alias-label-primary);color:var(--dsw-alias-bg-layer-3);border-color:transparent}
.cb-btn-primary:hover:not(:disabled){opacity:0.9}
.cb-btn-danger{color:var(--dsw-alias-state-error-primary);border-color:rgba(239,68,68,0.3)}
.cb-btn-danger:hover:not(:disabled){background:rgba(239,68,68,0.1)}

.cb-bar-container{display:flex;flex-direction:column;gap:6px;padding:12px 14px;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;background:var(--dsw-alias-bg-layer-2)}
.cb-bar-head{display:flex;justify-content:space-between;font-size:13px;font-weight:500;color:var(--dsw-alias-label-primary)}
.cb-bar-track{width:100%;height:10px;border-radius:999px;background:var(--dsw-alias-bg-layer-1);overflow:hidden;border:1px solid var(--dsw-alias-border-l2)}
.cb-bar-fill{height:100%;border-radius:999px;transition:width .3s}
.cb-bar-meta{display:flex;justify-content:space-between;font-size:12px;color:var(--dsw-alias-label-secondary)}

.cb-table{width:100%;border-collapse:collapse;margin-top:8px}
.cb-table th{text-align:left;font-size:12px;color:var(--dsw-alias-label-secondary);padding:8px 10px;border-bottom:1px solid var(--dsw-alias-border-l2);font-weight:600}
.cb-table td{padding:10px;border-bottom:1px solid var(--dsw-alias-border-l2);font-size:13px;color:var(--dsw-alias-label-primary)}
.cb-table tr:hover{background:var(--dsw-alias-bg-layer-2)}

.cb-alert-ok{padding:10px 14px;border-radius:8px;background:rgba(16,185,129,0.1);color:var(--dsw-alias-state-success-primary);font-size:13px}
.cb-alert-bad{padding:10px 14px;border-radius:8px;background:rgba(239,68,68,0.1);color:var(--dsw-alias-state-error-primary);font-size:13px}
.cb-preview{padding:12px;border-radius:8px;background:var(--dsw-alias-bg-layer-2);font-family:monospace;font-size:12px;white-space:pre-wrap;word-break:break-all;border:1px solid var(--dsw-alias-border-l2)}
`
      document.head.appendChild(style)
    }

    function ProgressBar({ label, percentUsed, remainingPercent, resetsAt }) {
      const used = Math.max(0, Math.min(100, percentUsed || 0))
      let fillColor = 'var(--dsw-alias-state-success-primary)'
      if (used > 75) fillColor = 'var(--dsw-alias-state-warning-primary)'
      if (used > 90) fillColor = 'var(--dsw-alias-state-error-primary)'

      const resetStr = resetsAt ? new Date(resetsAt).toLocaleString() : '—'

      return React.createElement(
        'div',
        { className: 'cb-bar-container' },
        React.createElement(
          'div',
          { className: 'cb-bar-head' },
          React.createElement('span', null, label),
          React.createElement('span', { style: { fontWeight: 600 } }, `${used}% использовано`)
        ),
        React.createElement(
          'div',
          { className: 'cb-bar-track' },
          React.createElement('div', {
            className: 'cb-bar-fill',
            style: { width: `${used}%`, background: fillColor },
          })
        ),
        React.createElement(
          'div',
          { className: 'cb-bar-meta' },
          React.createElement('span', null, `Осталось: ${remainingPercent ?? (100 - used)}%`),
          React.createElement('span', null, `Сброс: ${resetStr}`)
        )
      )
    }

    function SettingsPage() {
      const [status, setStatus] = React.useState(null)
      const [draft, setDraft] = React.useState(null)
      const [busy, setBusy] = React.useState('')
      const [err, setErr] = React.useState('')
      const [msg, setMsg] = React.useState('')
      const [smokeResult, setSmokeResult] = React.useState(null)

      // Key input state
      const [apiKeyInput, setApiKeyInput] = React.useState('')
      const [showKey, setShowKey] = React.useState(false)

      // Custom model form state
      const [customId, setCustomId] = React.useState('')
      const [customName, setCustomName] = React.useState('')
      const [customContext, setCustomContext] = React.useState('200000')
      const [customVision, setCustomVision] = React.useState(false)
      const [customCategory, setCustomCategory] = React.useState('coding')

      React.useEffect(() => {
        ensureCss()
      }, [])

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

      // Save Key handler
      async function handleSaveKey() {
        if (!apiKeyInput.trim()) {
          setErr('Введите API-ключ перед сохранением')
          return
        }
        setBusy('save-key')
        setErr('')
        setMsg('')
        try {
          const res = await fetch(`${ROUTE_PREFIX}/save-key`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              apiKey: apiKeyInput.trim(),
              apiKeyEnv: draft?.apiKeyEnv || 'CLINEBOT_API_KEY',
            }),
          })
          const data = await res.json().catch(() => ({}))
          if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
          setMsg(`Ключ сохранён в DSH Credentials (~/.dsh/.credentials.yaml). Валидация: ${data.validated ? 'Успешно' : 'Ошибка'}`)
          setApiKeyInput('')
          await load()
        } catch (e) {
          setErr(String(e.message || e))
        } finally {
          setBusy('')
        }
      }

      // Refresh Quota handler
      async function handleRefreshQuota() {
        setBusy('refresh-quota')
        setErr('')
        setMsg('')
        try {
          const res = await fetch(`${ROUTE_PREFIX}/usage`)
          const data = await res.json().catch(() => ({}))
          if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
          setStatus((prev) => ({ ...prev, usage: data }))
          setMsg('Лимиты подписки обновлены')
        } catch (e) {
          setErr(String(e.message || e))
        } finally {
          setBusy('')
        }
      }

      // Register/Sync Provider in DSH
      async function handleRegister() {
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
          setMsg(`Провайдер успешно зарегистрирован в DSH Models (${draft.enabledModels?.length || 0} моделей)`)
          await load()
        } catch (e) {
          setErr(String(e.message || e))
        } finally {
          setBusy('')
        }
      }

      // Unregister
      async function handleUnregister() {
        setBusy('unregister')
        setErr('')
        setMsg('')
        try {
          const res = await fetch(`${ROUTE_PREFIX}/unregister`, { method: 'POST' })
          const data = await res.json().catch(() => ({}))
          if (!data.ok) throw new Error(data.error || `HTTP ${res.status}`)
          setMsg('Провайдер удален из DSH Models')
          await load()
        } catch (e) {
          setErr(String(e.message || e))
        } finally {
          setBusy('')
        }
      }

      // Smoke chat test
      async function handleSmoke() {
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
          setMsg(`Smoke тест пройден! Задержка: ${data.latencyMs} мс`)
        } catch (e) {
          setErr(String(e.message || e))
        } finally {
          setBusy('')
        }
      }

      // Toggle model inclusion
      async function handleToggleModel(id) {
        if (!draft) return
        const current = new Set(draft.enabledModels || [])
        if (current.has(id)) {
          current.delete(id)
        } else {
          current.add(id)
        }
        const nextList = Array.from(current)
        setDraft({ ...draft, enabledModels: nextList })

        try {
          await fetch(`${ROUTE_PREFIX}/models/toggle`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ enabledModels: nextList }),
          })
        } catch {}
      }

      // Select all / filter models
      async function handleSetModelsFilter(type) {
        if (!status?.availableModels) return
        let nextList = []
        if (type === 'all') {
          nextList = status.availableModels.map((m) => m.id)
        } else if (type === 'vision') {
          nextList = status.availableModels.filter((m) => m.input?.includes('vision')).map((m) => m.id)
        } else if (type === 'coding') {
          nextList = status.availableModels.filter((m) => m.category === 'coding').map((m) => m.id)
        } else if (type === 'recommended') {
          nextList = status.availableModels.filter((m) => m.recommended).map((m) => m.id)
        }

        setDraft({ ...draft, enabledModels: nextList })
        try {
          await fetch(`${ROUTE_PREFIX}/models/toggle`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ enabledModels: nextList }),
          })
        } catch {}
      }

      // Add custom model
      async function handleAddCustomModel() {
        if (!customId.trim()) {
          setErr('Введите Model ID')
          return
        }
        setBusy('add-model')
        setErr('')
        try {
          const res = await fetch(`${ROUTE_PREFIX}/models/custom`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              id: customId.trim(),
              name: customName.trim() || customId.trim(),
              contextLength: Number(customContext) || 200000,
              hasVision: customVision,
              category: customCategory,
            }),
          })
          const data = await res.json().catch(() => ({}))
          if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
          setMsg(`Модель ${data.model?.name} успешно добавлена в каталог`)
          setCustomId('')
          setCustomName('')
          await load()
        } catch (e) {
          setErr(String(e.message || e))
        } finally {
          setBusy('')
        }
      }

      // Remove custom model
      async function handleRemoveCustomModel(id) {
        setBusy(`remove-${id}`)
        setErr('')
        try {
          const res = await fetch(`${ROUTE_PREFIX}/models/custom`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id }),
          })
          const data = await res.json().catch(() => ({}))
          if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
          setMsg(`Модель ${id} удалена`)
          await load()
        } catch (e) {
          setErr(String(e.message || e))
        } finally {
          setBusy('')
        }
      }

      if (!status || !draft) {
        return React.createElement('div', { className: 'cb-page' }, 'Загрузка настроек ClineBot…')
      }

      const healthOk = !!status.health?.ok
      const keyPresent = !!status.key?.present
      const isRegistered = !!status.isRegistered
      const modelsList = status.availableModels || []
      const enabledSet = new Set(draft.enabledModels || [])
      const usage = status.usage

      return React.createElement(
        'div',
        { className: 'cb-page' },

        // Page Header
        React.createElement(
          'div',
          { className: 'cb-header' },
          React.createElement(
            'div',
            { className: 'cb-page-title' },
            '🤖 ClineBot (ClinePass) Provider',
            React.createElement(
              'span',
              { className: `cb-badge ${healthOk ? 'cb-badge-ok' : 'cb-badge-bad'}` },
              healthOk ? `Сервер доступен (${status.health?.latencyMs} мс)` : 'Недоступен'
            ),
            React.createElement(
              'span',
              { className: `cb-badge ${keyPresent ? 'cb-badge-ok' : 'cb-badge-warn'}` },
              keyPresent ? `Ключ ✓ (${status.key?.source})` : 'Ключ отсутствует'
            ),
            React.createElement(
              'span',
              { className: `cb-badge ${isRegistered ? 'cb-badge-ok' : 'cb-badge-warn'}` },
              isRegistered ? 'Зарегистрирован в DSH' : 'Не зарегистрирован'
            )
          ),
          React.createElement(
            'div',
            { className: 'cb-page-sub' },
            'Подключение моделей по подписке ClinePass ($9.99/мес). Провайдер совместим с OpenAI API, автоматически отслеживает скользящие лимиты и регистрирует проверенный каталог моделей в DSH.'
          )
        ),

        // Notifications
        err ? React.createElement('div', { className: 'cb-alert-bad' }, err) : null,
        msg ? React.createElement('div', { className: 'cb-alert-ok' }, msg) : null,

        // Card 1: API Key and Credentials
        React.createElement(
          'div',
          { className: 'cb-section-card' },
          React.createElement(
            'div',
            { className: 'cb-section-title' },
            '🔑 Авторизация и API-ключ'
          ),
          React.createElement(
            'div',
            { className: 'cb-section-desc' },
            'Ключ сохраняется в системное хранилище DSH Credentials (~/.dsh/.credentials.yaml) и никогда не попадает в открытые файлы настроек.'
          ),
          React.createElement(
            'div',
            { className: 'cb-input-group' },
            React.createElement('input', {
              className: 'cb-input',
              type: showKey ? 'text' : 'password',
              placeholder: keyPresent ? '••••••••••••••••••••••••' : 'Вставьте ключ ClinePass (cline_...)',
              value: apiKeyInput,
              onChange: (e) => setApiKeyInput(e.target.value),
            }),
            React.createElement(
              'button',
              {
                type: 'button',
                className: 'cb-btn',
                onClick: () => setShowKey((v) => !v),
              },
              showKey ? 'Скрыть' : 'Показать'
            ),
            React.createElement(
              'button',
              {
                type: 'button',
                className: 'cb-btn cb-btn-primary',
                disabled: !!busy || !apiKeyInput.trim(),
                onClick: handleSaveKey,
              },
              busy === 'save-key' ? 'Сохранение…' : 'Сохранить ключ'
            )
          ),
          React.createElement(
            'div',
            { className: 'cb-row', style: { fontSize: '13px', color: 'var(--dsw-alias-label-secondary)' } },
            React.createElement('span', null, `Переменная учётных данных: `),
            React.createElement('code', null, draft.apiKeyEnv || 'CLINEBOT_API_KEY'),
            React.createElement('span', null, ` · `),
            React.createElement(
              'a',
              {
                href: 'https://app.cline.bot',
                target: '_blank',
                rel: 'noreferrer',
                style: { color: 'var(--dsw-alias-state-brand-primary)' },
              },
              'Получить ключ в консоли app.cline.bot ↗'
            )
          )
        ),

        // Card 2: Subscription Limits & Usage Dashboard
        keyPresent
          ? React.createElement(
              'div',
              { className: 'cb-section-card' },
              React.createElement(
                'div',
                { className: 'cb-section-title' },
                '📊 Остаток лимитов подписки (ClinePass Quota)',
                React.createElement(
                  'button',
                  {
                    type: 'button',
                    className: 'cb-btn',
                    disabled: !!busy,
                    onClick: handleRefreshQuota,
                  },
                  busy === 'refresh-quota' ? 'Обновление…' : 'Обновить квоты'
                )
              ),
              React.createElement(
                'div',
                { className: 'cb-section-desc' },
                usage?.user?.email
                  ? `Аккаунт: ${usage.user.email} · Тариф: ${usage.plan || 'ClinePass ($9.99/mo)'}`
                  : 'Официальные лимиты скользящих окон запросов ClinePass'
              ),
              React.createElement(
                'div',
                { className: 'cb-grid-2' },
                React.createElement(ProgressBar, {
                  label: '⏱ 5-часовое скользящее окно (Rolling Limit)',
                  percentUsed: usage?.windows?.fiveHour?.percentUsed || 0,
                  remainingPercent: usage?.windows?.fiveHour?.remainingPercent || 100,
                  resetsAt: usage?.windows?.fiveHour?.resetsAt,
                }),
                React.createElement(ProgressBar, {
                  label: '📅 Недельное окно (Weekly Window)',
                  percentUsed: usage?.windows?.weekly?.percentUsed || 0,
                  remainingPercent: usage?.windows?.weekly?.remainingPercent || 100,
                  resetsAt: usage?.windows?.weekly?.resetsAt,
                })
              )
            )
          : null,

        // Card 3: Model Picker Management
        React.createElement(
          'div',
          { className: 'cb-section-card' },
          React.createElement(
            'div',
            { className: 'cb-section-title' },
            `🎯 Модели в пикере DSH (${enabledSet.size} из ${modelsList.length} включено)`,
            React.createElement(
              'div',
              { className: 'cb-row' },
              React.createElement(
                'button',
                { type: 'button', className: 'cb-btn', onClick: () => handleSetModelsFilter('all') },
                'Все'
              ),
              React.createElement(
                'button',
                { type: 'button', className: 'cb-btn', onClick: () => handleSetModelsFilter('vision') },
                'Только Vision'
              ),
              React.createElement(
                'button',
                { type: 'button', className: 'cb-btn', onClick: () => handleSetModelsFilter('coding') },
                'Только Кодинг'
              ),
              React.createElement(
                'button',
                { type: 'button', className: 'cb-btn', onClick: () => handleSetModelsFilter('recommended') },
                'Рекомендованные'
              )
            )
          ),
          React.createElement(
            'div',
            { className: 'cb-section-desc' },
            'Отметьте галочками модели, которые должны отображаться в выпадающем списке выбора моделей в чате DeepSeek Harness.'
          ),
          React.createElement(
            'table',
            { className: 'cb-table' },
            React.createElement(
              'thead',
              null,
              React.createElement(
                'tr',
                null,
                React.createElement('th', { style: { width: '40px' } }, 'Вкл'),
                React.createElement('th', null, 'Название модели'),
                React.createElement('th', null, 'Model ID'),
                React.createElement('th', null, 'Контекст'),
                React.createElement('th', null, 'Возможности')
              )
            ),
            React.createElement(
              'tbody',
              null,
              modelsList.map((m) =>
                React.createElement(
                  'tr',
                  { key: m.id },
                  React.createElement(
                    'td',
                    null,
                    React.createElement('input', {
                      type: 'checkbox',
                      checked: enabledSet.has(m.id),
                      onChange: () => handleToggleModel(m.id),
                    })
                  ),
                  React.createElement(
                    'td',
                    null,
                    React.createElement('strong', null, m.name),
                    m.recommended
                      ? React.createElement('span', { className: 'cb-badge cb-badge-ok', style: { marginLeft: '6px' } }, 'Star')
                      : null,
                    m.isCustom
                      ? React.createElement('span', { className: 'cb-badge cb-badge-warn', style: { marginLeft: '6px' } }, 'Custom')
                      : null
                  ),
                  React.createElement('td', null, React.createElement('code', null, m.id)),
                  React.createElement('td', null, `${Math.round((m.contextLength || 200000) / 1000)}k`),
                  React.createElement(
                    'td',
                    null,
                    React.createElement('span', { className: 'cb-badge' }, m.category || 'general'),
                    m.input?.includes('vision')
                      ? React.createElement('span', { className: 'cb-badge', style: { marginLeft: '4px' } }, 'Vision')
                      : null
                  )
                )
              )
            )
          )
        ),

        // Card 4: Add New Custom Model Form
        React.createElement(
          'div',
          { className: 'cb-section-card' },
          React.createElement(
            'div',
            { className: 'cb-section-title' },
            '➕ Добавить новую модель в подписку'
          ),
          React.createElement(
            'div',
            { className: 'cb-section-desc' },
            'Если в сервисе ClinePass появилась новая модель, добавьте её идентификатор сюда — она мгновенно станет доступна в DSH без обновления плагина.'
          ),
          React.createElement(
            'div',
            { className: 'cb-grid-2' },
            React.createElement(
              'div',
              null,
              React.createElement('label', { className: 'cb-section-desc' }, 'Model ID (напр. cline-pass/deepseek-v4-moe)'),
              React.createElement('input', {
                className: 'cb-input',
                placeholder: 'cline-pass/...',
                value: customId,
                onChange: (e) => setCustomId(e.target.value),
              })
            ),
            React.createElement(
              'div',
              null,
              React.createElement('label', { className: 'cb-section-desc' }, 'Отображаемое имя (Display Name)'),
              React.createElement('input', {
                className: 'cb-input',
                placeholder: 'Например: DeepSeek V4 MoE',
                value: customName,
                onChange: (e) => setCustomName(e.target.value),
              })
            ),
            React.createElement(
              'div',
              null,
              React.createElement('label', { className: 'cb-section-desc' }, 'Контекст (токенов)'),
              React.createElement('input', {
                className: 'cb-input',
                type: 'number',
                value: customContext,
                onChange: (e) => setCustomContext(e.target.value),
              })
            ),
            React.createElement(
              'div',
              null,
              React.createElement('label', { className: 'cb-section-desc' }, 'Категория'),
              React.createElement(
                'select',
                {
                  className: 'cb-input',
                  value: customCategory,
                  onChange: (e) => setCustomCategory(e.target.value),
                },
                React.createElement('option', { value: 'coding' }, 'Кодинг (Coding)'),
                React.createElement('option', { value: 'reasoning' }, 'Рассуждения (Reasoning)'),
                React.createElement('option', { value: 'multimodal' }, 'Мультимодальная'),
                React.createElement('option', { value: 'general' }, 'Общая (General)')
              )
            )
          ),
          React.createElement(
            'div',
            { className: 'cb-row', style: { marginTop: '4px' } },
            React.createElement(
              'label',
              { className: 'cb-row', style: { cursor: 'pointer', fontSize: '13px' } },
              React.createElement('input', {
                type: 'checkbox',
                checked: customVision,
                onChange: (e) => setCustomVision(e.target.checked),
              }),
              ' Модель поддерживает изображения (Vision)'
            ),
            React.createElement(
              'button',
              {
                type: 'button',
                className: 'cb-btn cb-btn-primary',
                style: { marginLeft: 'auto' },
                disabled: !!busy || !customId.trim(),
                onClick: handleAddCustomModel,
              },
              busy === 'add-model' ? 'Добавление…' : 'Добавить модель'
            )
          ),
          // Custom models list with remove button
          draft.customModels?.length > 0
            ? React.createElement(
                'div',
                { style: { marginTop: '10px' } },
                React.createElement('div', { className: 'cb-section-desc' }, 'Добавленные вами модели:'),
                React.createElement(
                  'div',
                  { className: 'cb-row', style: { marginTop: '6px' } },
                  draft.customModels.map((cm) =>
                    React.createElement(
                      'span',
                      { key: cm.id, className: 'cb-badge' },
                      `${cm.name} (${cm.id})`,
                      React.createElement(
                        'button',
                        {
                          type: 'button',
                          style: {
                            background: 'none',
                            border: 'none',
                            cursor: 'pointer',
                            color: 'var(--dsw-alias-state-error-primary)',
                            padding: 0,
                            marginLeft: '4px',
                          },
                          onClick: () => handleRemoveCustomModel(cm.id),
                        },
                        '×'
                      )
                    )
                  )
                )
              )
            : null
        ),

        // Card 5: Diagnostics & Sync with DSH
        React.createElement(
          'div',
          { className: 'cb-section-card' },
          React.createElement(
            'div',
            { className: 'cb-section-title' },
            '⚡ Диагностика и регистрация в DSH Models'
          ),
          React.createElement(
            'div',
            { className: 'cb-section-desc' },
            'Проверьте связь с эндпоинтом и синхронизируйте активный список моделей с ядром DeepSeek Harness.'
          ),
          React.createElement(
            'div',
            { className: 'cb-row' },
            React.createElement(
              'button',
              {
                type: 'button',
                className: 'cb-btn',
                disabled: !!busy || !keyPresent,
                onClick: handleSmoke,
              },
              busy === 'smoke' ? 'Тестирование…' : 'Запустить Smoke Test (Ping)'
            ),
            isRegistered
              ? React.createElement(
                  'button',
                  {
                    type: 'button',
                    className: 'cb-btn cb-btn-danger',
                    disabled: !!busy,
                    onClick: handleUnregister,
                  },
                  busy === 'unregister' ? 'Удаление…' : 'Удалить из DSH Models'
                )
              : null,
            React.createElement(
              'button',
              {
                type: 'button',
                className: 'cb-btn cb-btn-primary',
                style: { marginLeft: 'auto' },
                disabled: !!busy,
                onClick: handleRegister,
              },
              busy === 'register' ? 'Синхронизация…' : 'Синхронизировать с DSH Models'
            )
          ),
          smokeResult
            ? React.createElement(
                'div',
                { className: 'cb-preview' },
                `✅ Задержка ответа: ${smokeResult.latencyMs} мс | Модель: ${smokeResult.model}\nОтвет: ${smokeResult.preview || '(пустой ответ)'}`
              )
            : null
        )
      )
    }

    // Accordion item for Plugins section
    function PluginCard() {
      const [open, setOpen] = React.useState(false)
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
            React.createElement('div', { style: { fontWeight: 600, fontSize: '15px' } }, TITLE),
            React.createElement('div', { style: { fontSize: '13px', color: 'var(--dsw-alias-label-secondary)' } }, SUBTITLE)
          ),
          React.createElement('span', { style: { transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .16s' } },
            React.createElement(Chevron)
          )
        ),
        open ? React.createElement('div', { style: { marginTop: '16px' } }, React.createElement(SettingsPage)) : null
      )
    }

    function apply(ctx) {
      // 1. Register as dedicated Settings Section (Settings -> ClineBot)
      ctx.slots.inject('settings.section', () => {
        return ctx.slots.register(
          {
            name: 'settings.section',
            id: '@goodandready/dsh-clinebot',
            order: 28,
            label: () => TITLE,
          },
          SettingsPage
        )
      })

      // 2. Also register in settings.plugin.item (Settings -> Plugins)
      ctx.slots.inject('settings.plugin.item', () => {
        return ctx.slots.register(
          { name: 'settings.plugin.item', key: NS },
          PluginCard
        )
      })
    }

    module.exports = { apply, inject: ['slots'] }
    return module.exports
  },
})
