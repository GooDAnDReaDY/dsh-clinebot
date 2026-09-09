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
    const ROUTE_PREFIX = '/dsh-clinebot'

    const en = {
      title: 'ClineBot',
      subtitle: 'ClinePass subscription ($9.99/mo) with curated & custom models.',
      'settings.loading': 'Loading ClineBot settings…',
      'settings.retry': 'Retry',
      'settings.unavailable': 'ClineBot settings unavailable (host namespace is not ready).',
      'header.title': 'ClineBot (ClinePass) Provider',
      'header.sub': 'Connect models under ClinePass subscription ($9.99/mo). OpenAI API compatible, automated rolling limit tracking, and instant auto-registration in DSH.',
      'badge.online': 'Host online ({latency} ms)',
      'badge.offline': 'Host unreachable',
      'badge.key_ok': 'Key ✓ ({source})',
      'badge.key_missing': 'Key missing',
      'badge.registered': 'DSH Registered ({count} models)',
      'badge.not_registered': 'Not registered',
      'key.title': '🔑 Authorization & API Key',
      'key.desc': 'The key is saved directly to DSH Credentials storage (~/.dsh/.credentials.yaml) and never exposed in plaintext configuration files.',
      'key.placeholder_has': '••••••••••••••••••••••••',
      'key.placeholder_empty': 'Paste ClinePass key (cline_...)',
      'key.show': 'Show',
      'key.hide': 'Hide',
      'key.save': 'Save Key',
      'key.saving': 'Saving…',
      'key.login_fast': '🚀 Quick Web Login',
      'key.login_waiting': 'Waiting for authorization in browser…',
      'key.env_label': 'Credential environment name: ',
      'key.get_key': 'Get key in app.cline.bot console ↗',
      'key.saved_msg': 'Key saved to DSH Credentials. Validation: {status}',
      'key.empty_err': 'Please enter an API key before saving',
      'accounts.title': '👥 Multi-Account Failover Pool',
      'accounts.desc': 'Add extra accounts. When an account hits 429 rate limits, ClineBot switches to the next available account automatically.',
      'accounts.active_badge': 'Active',
      'accounts.pinned_badge': 'Pinned',
      'accounts.pin_btn': 'Pin Active',
      'accounts.add_btn': '+ Add Account',
      'accounts.label_placeholder': 'Account Label (e.g. Work)',
      'accounts.env_placeholder': 'CLINEBOT_API_KEY_2',
      'quota.title': '📊 ClinePass Quota & Rate Limits',
      'quota.desc': 'Official rolling window request limits from ClinePass',
      'quota.account': 'Account: {email} · Plan: {plan}',
      'quota.refresh': 'Refresh Quotas',
      'quota.refreshing': 'Refreshing…',
      'quota.refreshed_msg': 'Subscription quotas refreshed',
      'quota.window_5h': '⏱ 5-Hour Rolling Limit',
      'quota.window_weekly': '📅 Weekly Window',
      'quota.used': '{pct}% used',
      'quota.remaining': 'Remaining: {pct}%',
      'quota.reset_at': 'Reset: {time}',
      'models.title': '🎯 Model Picker in DSH ({enabled} of {total} active)',
      'models.desc': 'Catalog synchronizes directly from ClinePass subscription. New plan models are enabled automatically. Uncheck models to hide them from DSH chat picker.',
      'models.sync': '🔄 Check Plan Models',
      'models.syncing': 'Checking…',
      'models.synced_msg': 'Synchronized subscription models: {total} ({discovered} discovered from ClinePass)',
      'models.all': 'All',
      'models.vision': 'Vision Only',
      'models.coding': 'Coding Only',
      'models.recommended': 'Recommended',
      'models.th_active': 'On',
      'models.th_name': 'Model Name',
      'models.th_id': 'Model ID',
      'models.th_ctx': 'Context',
      'models.th_caps': 'Capabilities',
      'models.star': 'Star',
      'models.auto_new': 'New',
      'stats.title': '📈 Current DSH Session Telemetry',
      'stats.desc': 'Local monitoring of requests, network latency, and estimated token usage via ClinePass.',
      'stats.requests': 'Successful / Total Requests',
      'stats.tokens': 'Estimated Session Tokens',
      'stats.latency': 'Last Request Latency',
      'stats.last_req': 'Last Request Time',
      'diag.title': '⚡ Diagnostics & Auto-Registration',
      'diag.desc': 'ClineBot registers into DSH Models automatically when key is configured. You can run connection smoke test or force re-sync.',
      'diag.smoke_btn': 'Run Smoke Test (Ping)',
      'diag.smoke_testing': 'Testing…',
      'diag.smoke_ok': 'Smoke test passed! Latency: {latency} ms',
      'diag.resync_btn': 'Force Re-sync to DSH',
      'diag.resyncing': 'Syncing…',
      'diag.resynced_msg': 'Provider re-synced to DSH Models ({count} models)',
      'diag.unregister_btn': 'Unregister from DSH',
      'diag.unregistering': 'Removing…',
      'diag.unregistered_msg': 'Provider removed from DSH Models',
    }

    const ru = {
      title: 'ClineBot',
      subtitle: 'Подписка ClinePass ($9.99/мес) с каталогом проверенных моделей.',
      'settings.loading': 'Загрузка настроек ClineBot…',
      'settings.retry': 'Повторить попытку',
      'settings.unavailable': 'Настройки ClineBot недоступны (пространство хоста ещё не готово).',
      'header.title': 'Провайдер ClineBot (ClinePass)',
      'header.sub': 'Подключение моделей по подписке ClinePass ($9.99/мес). OpenAI API совместимый, автоматическое отслеживание лимитов и моментальная авторегистрация в DSH.',
      'badge.online': 'Сервер доступен ({latency} мс)',
      'badge.offline': 'Недоступен',
      'badge.key_ok': 'Ключ ✓ ({source})',
      'badge.key_missing': 'Ключ отсутствует',
      'badge.registered': 'Зарегистрирован в DSH ({count} мод.)',
      'badge.not_registered': 'Не зарегистрирован',
      'key.title': '🔑 Авторизация и API-ключ',
      'key.desc': 'Ключ сохраняется в системное хранилище DSH Credentials (~/.dsh/.credentials.yaml) и никогда не попадает в открытые файлы настроек.',
      'key.placeholder_has': '••••••••••••••••••••••••',
      'key.placeholder_empty': 'Вставьте ключ ClinePass (cline_...)',
      'key.show': 'Показать',
      'key.hide': 'Скрыть',
      'key.save': 'Сохранить ключ',
      'key.saving': 'Сохранение…',
      'key.login_fast': '🚀 Быстрый вход через браузер',
      'key.login_waiting': 'Ожидание авторизации в браузере…',
      'key.env_label': 'Переменная учётных данных: ',
      'key.get_key': 'Получить ключ в консоли app.cline.bot ↗',
      'key.saved_msg': 'Ключ сохранён в DSH Credentials. Валидация: {status}',
      'key.empty_err': 'Введите API-ключ перед сохранением',
      'accounts.title': '👥 Пул аккаунтов и авторотация (Failover)',
      'accounts.desc': 'Добавьте запасные аккаунты. При исчерпании лимитов (429) ClineBot автоматически переключит запрос на следующий доступный аккаунт.',
      'accounts.active_badge': 'Активен',
      'accounts.pinned_badge': 'Закреплен',
      'accounts.pin_btn': 'Сделать активным',
      'accounts.add_btn': '+ Добавить аккаунт',
      'accounts.label_placeholder': 'Название (например, Work)',
      'accounts.env_placeholder': 'CLINEBOT_API_KEY_2',
      'quota.title': '📊 Остаток лимитов подписки (ClinePass Quota)',
      'quota.desc': 'Официальные лимиты скользящих окон запросов ClinePass',
      'quota.account': 'Аккаунт: {email} · Тариф: {plan}',
      'quota.refresh': 'Обновить квоты',
      'quota.refreshing': 'Обновление…',
      'quota.refreshed_msg': 'Лимиты подписки обновлены',
      'quota.window_5h': '⏱ 5-часовое скользящее окно (Rolling Limit)',
      'quota.window_weekly': '📅 Недельное окно (Weekly Window)',
      'quota.used': '{pct}% использовано',
      'quota.remaining': 'Осталось: {pct}%',
      'quota.reset_at': 'Сброс: {time}',
      'models.title': '🎯 Модели в пикере DSH ({enabled} из {total} включено)',
      'models.desc': 'Список синхронизируется напрямую из подписки ClinePass. Новые модели появляются автоматически. Снимите галочку, чтобы скрыть ненужную модель из чата.',
      'models.sync': '🔄 Проверить модели плана',
      'models.syncing': 'Проверка…',
      'models.synced_msg': 'Синхронизировано моделей подписки: {total} ({discovered} получено напрямую из плана)',
      'models.all': 'Все',
      'models.vision': 'Только Vision',
      'models.coding': 'Только Кодинг',
      'models.recommended': 'Рекомендованные',
      'models.th_active': 'Вкл',
      'models.th_name': 'Название модели',
      'models.th_id': 'Model ID',
      'models.th_ctx': 'Контекст',
      'models.th_caps': 'Возможности',
      'models.star': 'Star',
      'models.auto_new': 'Новая',
      'stats.title': '📈 Статистика текущей сессии DSH',
      'stats.desc': 'Локальный мониторинг запросов, задержек сети и ориентировочного расхода токенов через ClinePass.',
      'stats.requests': 'Успешных запросов / Всего',
      'stats.tokens': 'Оценка токенов сессии',
      'stats.latency': 'Последняя задержка (Latency)',
      'stats.last_req': 'Время последнего запроса',
      'diag.title': '⚡ Диагностика и авторегистрация в DSH',
      'diag.desc': 'ClineBot автоматически регистрируется в DSH Models при наличии ключа. Вы можете запустить проверку связи или принудительно пересинхронизировать модели.',
      'diag.smoke_btn': 'Запустить Smoke Test (Ping)',
      'diag.smoke_testing': 'Тестирование…',
      'diag.smoke_ok': 'Smoke тест пройден! Задержка: {latency} мс',
      'diag.resync_btn': 'Принудительно обновить в DSH',
      'diag.resyncing': 'Обновление…',
      'diag.resynced_msg': 'Провайдер обновлен в DSH Models ({count} моделей)',
      'diag.unregister_btn': 'Удалить из DSH Models',
      'diag.unregistering': 'Удаление…',
      'diag.unregistered_msg': 'Провайдер удален из DSH Models',
    }

    function makeT(dict, fallback) {
      return function t(key, vars) {
        let val = (dict && dict[key]) || (fallback && fallback[key]) || key
        if (vars && typeof val === 'string') {
          for (const k of Object.keys(vars)) {
            val = val.replace(new RegExp('\\{' + k + '\\}', 'g'), String(vars[k]))
          }
        }
        return val
      }
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
    const Chevron = FallbackChevron

    function ensureCss() {
      if (typeof document === 'undefined') return
      if (document.getElementById('dsh-clinebot-full-css')) return
      const style = document.createElement('style')
      style.id = 'dsh-clinebot-full-css'
      style.dataset.dshPlugin = NS
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

.cb-btn{appearance:none;font:inherit;cursor:pointer;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;padding:7px 14px;font-size:13px;background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);font-weight:500;display:inline-flex;align-items:center;justify-content:center;gap:6px;transition:all .15s ease}
.cb-btn:hover:not(:disabled){background:var(--dsw-alias-bg-layer-4, var(--dsw-alias-bg-layer-2));border-color:var(--dsw-alias-label-dimmed, var(--dsw-alias-border-l2))}
.cb-btn-primary{background:var(--dsw-alias-label-primary);color:var(--dsw-alias-bg-layer-3);border-color:transparent}
.cb-btn-primary:hover:not(:disabled){background:var(--dsw-alias-label-primary) !important;color:var(--dsw-alias-bg-layer-3) !important;opacity:0.88;visibility:visible !important}
.cb-btn-danger{color:var(--dsw-alias-state-error-primary);border-color:rgba(239,68,68,0.3)}
.cb-btn-danger:hover:not(:disabled){background:rgba(239,68,68,0.12) !important;border-color:rgba(239,68,68,0.5)}
.cb-btn-disabled{opacity:0.5;cursor:not-allowed}

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
.cb-alert-err{padding:10px 14px;border-radius:8px;background:rgba(239,68,68,0.1);color:var(--dsw-alias-state-error-primary);font-size:13px}
.cb-banner-warning{padding:12px 16px;border-radius:8px;background:rgba(245,158,11,0.12);border:1px solid var(--dsw-alias-state-warning-primary);color:var(--dsw-alias-state-warning-primary);font-size:13px;display:flex;align-items:center;gap:10px;font-weight:500}
.cb-banner-exhausted{padding:12px 16px;border-radius:8px;background:rgba(239,68,68,0.12);border:1px solid var(--dsw-alias-state-error-primary);color:var(--dsw-alias-state-error-primary);font-size:13px;display:flex;align-items:center;gap:10px;font-weight:600}
.cb-stat-box{padding:12px 14px;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;background:var(--dsw-alias-bg-layer-2);display:flex;flex-direction:column;gap:4px}
.cb-stat-val{font-size:18px;font-weight:700;color:var(--dsw-alias-label-primary)}
.cb-stat-lbl{font-size:12px;color:var(--dsw-alias-label-secondary)}
.cb-preview{padding:12px;border-radius:8px;background:var(--dsw-alias-bg-layer-2);font-family:monospace;font-size:12px;white-space:pre-wrap;word-break:break-all;border:1px solid var(--dsw-alias-border-l2)}
`
      document.head.appendChild(style)
    }

    function createErrorBoundary() {
      if (!React || typeof React.Component !== 'function') {
        return function NoopBoundary(props) { return props?.children || null }
      }
      return class ErrorBoundary extends React.Component {
        constructor(props) {
          super(props)
          this.state = { hasError: false, error: null }
        }
        static getDerivedStateFromError(error) {
          return { hasError: true, error }
        }
        componentDidCatch(error, errorInfo) {
          console.error('[dsh-clinebot] React Error:', error, errorInfo)
        }
        render() {
          if (this.state.hasError) {
            return React.createElement(
              'div',
              {
                className: 'cb-alert cb-alert-err',
                style: { margin: '12px 0', padding: '14px', borderRadius: '8px' },
              },
              React.createElement('div', { style: { fontWeight: 600, marginBottom: '6px' } }, '⚠️ ClineBot UI Error:'),
              React.createElement('div', { style: { fontSize: '12px', wordBreak: 'break-all' } }, String(this.state.error?.message || this.state.error)),
              React.createElement(
                'button',
                {
                  type: 'button',
                  className: 'cb-btn',
                  style: { marginTop: '10px', fontSize: '12px', padding: '4px 10px' },
                  onClick: () => this.setState({ hasError: false, error: null }),
                },
                'Retry'
              )
            )
          }
          return this.props?.children || null
        }
      }
    }
    const ErrorBoundary = createErrorBoundary()

    const SNAPSHOT_READY = Object.freeze({ status: 'ready', value: {} })
    const SNAPSHOT_LOADING = Object.freeze({ status: 'loading', value: {} })

    function formatResetTime(isoString) {
      if (!isoString) return '—'
      try {
        const d = new Date(isoString)
        if (isNaN(d.getTime())) return '—'
        return d.toLocaleTimeString()
      } catch {
        return '—'
      }
    }

    function ProgressBar({ label, percentUsed, remainingPercent, resetsAt, t }) {
      const used = Math.max(0, Math.min(100, percentUsed || 0))
      let fillColor = 'var(--dsw-alias-state-success-primary)'
      if (used > 75) fillColor = 'var(--dsw-alias-state-warning-primary)'
      if (used > 90) fillColor = 'var(--dsw-alias-state-error-primary)'

      const resetStr = formatResetTime(resetsAt)

      return React.createElement(
        'div',
        { className: 'cb-bar-container' },
        React.createElement(
          'div',
          { className: 'cb-bar-head' },
          React.createElement('span', null, label),
          React.createElement('span', { style: { fontWeight: 600 } }, t('quota.used', { pct: used }))
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
          React.createElement('span', null, t('quota.remaining', { pct: remainingPercent ?? (100 - used) })),
          React.createElement('span', null, t('quota.reset_at', { time: resetStr }))
        )
      )
    }

    function SettingsPage(props) {
      const ctx = props?.ctx
      const t = props?.t || makeT(ru, en)

      const scope = React.useMemo(() => {
        if (!ctx?.settingsScope?.bind) return undefined
        try {
          return ctx.settingsScope.bind({ namespace: NS })
        } catch (_) {
          return undefined
        }
      }, [ctx])

      const subscribe = React.useMemo(() => {
        return (cb) => {
          if (!scope?.subscribe) return () => {}
          try {
            return scope.subscribe(cb) || (() => {})
          } catch (_) {
            return () => {}
          }
        }
      }, [scope])

      const getSnapshot = React.useCallback(() => {
        if (!scope?.getSnapshot) return SNAPSHOT_READY
        try {
          return scope.getSnapshot() || SNAPSHOT_READY
        } catch (_) {
          return SNAPSHOT_READY
        }
      }, [scope])

      const snapshot = React.useSyncExternalStore(
        subscribe,
        getSnapshot,
        React.useCallback(() => SNAPSHOT_LOADING, [])
      )
      const snapshotStatus = snapshot?.status || 'ready'

      const [status, setStatus] = React.useState(null)
      const [draft, setDraft] = React.useState(null)
      const [busy, setBusy] = React.useState('')
      const [err, setErr] = React.useState('')
      const [msg, setMsg] = React.useState('')
      const [smokeResult, setSmokeResult] = React.useState(null)

      // Key input state
      const [apiKeyInput, setApiKeyInput] = React.useState('')
      const [showKey, setShowKey] = React.useState(false)

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
          setErr(t('key.empty_err'))
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
          setMsg(t('key.saved_msg', { status: data.validated ? 'OK' : 'Error' }))
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
          setMsg(t('quota.refreshed_msg'))
        } catch (e) {
          setErr(String(e.message || e))
        } finally {
          setBusy('')
        }
      }

      // Sync official models from ClinePass plan
      async function handleSyncPlanModels() {
        setBusy('sync-models')
        setErr('')
        setMsg('')
        try {
          const res = await fetch(`${ROUTE_PREFIX}/models/sync`, { method: 'POST' })
          const data = await res.json().catch(() => ({}))
          if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
          setMsg(t('models.synced_msg', { total: data.totalModelsCount, discovered: data.discoveredCount }))
          await load()
        } catch (e) {
          setErr(String(e.message || e))
        } finally {
          setBusy('')
        }
      }

      // Register/Force Re-sync Provider in DSH
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
          setMsg(t('diag.resynced_msg', { count: draft.enabledModels?.length || 0 }))
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
          setMsg(t('diag.unregistered_msg'))
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
            body: JSON.stringify({ model: draft?.defaultModel }),
          })
          const data = await res.json().catch(() => ({}))
          if (!data.ok) throw new Error(data.error || `HTTP ${res.status}`)
          setSmokeResult(data)
          setMsg(t('diag.smoke_ok', { latency: data.latencyMs }))
        } catch (e) {
          setErr(String(e.message || e))
        } finally {
          setBusy('')
        }
      }

      // Fast Browser Login
      async function handleFastLogin() {
        setBusy('fast-login')
        setErr('')
        setMsg(t('key.login_waiting'))
        try {
          const res = await fetch(`${ROUTE_PREFIX}/auth/begin`, { method: 'POST' })
          const data = await res.json().catch(() => ({}))
          if (!data.ok) throw new Error(data.error || 'Failed to initiate login')
          if (data.authUrl) {
            window.open(data.authUrl, '_blank')
          }
        } catch (e) {
          setErr(String(e.message || e))
        } finally {
          setBusy('')
        }
      }

      // Pin active account
      async function handlePinAccount(accountEnv) {
        setBusy(`pin-${accountEnv}`)
        setErr('')
        try {
          const res = await fetch(`${ROUTE_PREFIX}/accounts/active`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ account: accountEnv }),
          })
          const data = await res.json().catch(() => ({}))
          if (!data.ok) throw new Error(data.error || 'Failed to switch account')
          await load()
        } catch (e) {
          setErr(String(e.message || e))
        } finally {
          setBusy('')
        }
      }

      // Toggle model exclusion (disabledModels logic)
      async function handleToggleModel(id) {
        if (!draft) return
        const currentDisabled = new Set(draft.disabledModels || [])
        if (currentDisabled.has(id)) {
          currentDisabled.delete(id) // Re-enable
        } else {
          currentDisabled.add(id) // Disable
        }
        const nextDisabled = Array.from(currentDisabled)

        // Compute next enabled models
        const allIds = (status?.availableModels || []).map((m) => m.id)
        const nextEnabled = allIds.filter((mId) => !currentDisabled.has(mId))

        setDraft({ ...draft, disabledModels: nextDisabled, enabledModels: nextEnabled })

        if (scope && snapshotStatus === 'ready') {
          try { await scope.set('disabledModels', nextDisabled) } catch (_) {}
        }
        try {
          await fetch(`${ROUTE_PREFIX}/models/toggle`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ disabledModels: nextDisabled }),
          })
        } catch {}
      }

      // Select all / filter models
      async function handleSetModelsFilter(type) {
        if (!status?.availableModels) return
        const all = status.availableModels
        let allowed = new Set()
        if (type === 'all') {
          allowed = new Set(all.map((m) => m.id))
        } else if (type === 'vision') {
          allowed = new Set(all.filter((m) => m.input?.includes('image') || m.input?.includes('vision')).map((m) => m.id))
        } else if (type === 'coding') {
          allowed = new Set(all.filter((m) => m.category === 'coding').map((m) => m.id))
        } else if (type === 'recommended') {
          allowed = new Set(all.filter((m) => m.recommended).map((m) => m.id))
        }

        const nextDisabled = all.map((m) => m.id).filter((id) => !allowed.has(id))
        const nextEnabled = Array.from(allowed)

        setDraft({ ...draft, disabledModels: nextDisabled, enabledModels: nextEnabled })
        if (scope && snapshotStatus === 'ready') {
          try { await scope.set('disabledModels', nextDisabled) } catch (_) {}
        }
        try {
          await fetch(`${ROUTE_PREFIX}/models/toggle`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ disabledModels: nextDisabled }),
          })
        } catch {}
      }

      if (snapshotStatus === 'unavailable') {
        return React.createElement(
          'div',
          { className: 'cb-page' },
          React.createElement('div', { className: 'cb-banner-warning' }, t('settings.unavailable'))
        )
      }

      if (!status || !draft || snapshotStatus === 'loading') {
        if (err) {
          return React.createElement(
            'div',
            { className: 'cb-page' },
            React.createElement('div', { className: 'cb-alert cb-alert-err' }, `${t('settings.loading')}: ${err}`),
            React.createElement(
              'button',
              {
                type: 'button',
                className: 'cb-btn',
                style: { marginTop: '12px', alignSelf: 'flex-start' },
                onClick: () => {
                  setErr('')
                  load().catch((e) => setErr(String(e.message || e)))
                },
              },
              t('settings.retry')
            )
          )
        }
        return React.createElement('div', { className: 'cb-page' }, t('settings.loading'))
      }

      const healthOk = !!status.health?.ok
      const keyPresent = !!status.key?.present
      const isRegistered = !!status.isRegistered
      const modelsList = status.availableModels || []
      const disabledSet = new Set(draft.disabledModels || [])
      const enabledCount = modelsList.filter((m) => !disabledSet.has(m.id)).length
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
            `🤖 ${t('header.title')}`,
            React.createElement(
              'span',
              { className: `cb-badge ${healthOk ? 'cb-badge-ok' : 'cb-badge-bad'}` },
              healthOk ? t('badge.online', { latency: status.health?.latencyMs }) : t('badge.offline')
            ),
            React.createElement(
              'span',
              { className: `cb-badge ${keyPresent ? 'cb-badge-ok' : 'cb-badge-warn'}` },
              keyPresent ? t('badge.key_ok', { source: status.key?.source }) : t('badge.key_missing')
            ),
            React.createElement(
              'span',
              { className: `cb-badge ${isRegistered ? 'cb-badge-ok' : 'cb-badge-warn'}` },
              isRegistered ? t('badge.registered', { count: enabledCount }) : t('badge.not_registered')
            )
          ),
          React.createElement(
            'div',
            { className: 'cb-page-sub' },
            t('header.sub')
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
            t('key.title')
          ),
          React.createElement(
            'div',
            { className: 'cb-section-desc' },
            t('key.desc')
          ),
          React.createElement(
            'div',
            { className: 'cb-input-group' },
            React.createElement('input', {
              className: 'cb-input',
              type: showKey ? 'text' : 'password',
              placeholder: keyPresent ? t('key.placeholder_has') : t('key.placeholder_empty'),
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
              showKey ? t('key.hide') : t('key.show')
            ),
            React.createElement(
              'button',
              {
                type: 'button',
                className: 'cb-btn cb-btn-primary',
                disabled: !!busy || !apiKeyInput.trim(),
                onClick: handleSaveKey,
              },
              busy === 'save-key' ? t('key.saving') : t('key.save')
            ),
            React.createElement(
              'button',
              {
                type: 'button',
                className: 'cb-btn',
                disabled: !!busy,
                onClick: handleFastLogin,
              },
              busy === 'fast-login' ? '…' : t('key.login_fast')
            )
          ),
          React.createElement(
            'div',
            { className: 'cb-row', style: { fontSize: '13px', color: 'var(--dsw-alias-label-secondary)' } },
            React.createElement('span', null, t('key.env_label')),
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
              t('key.get_key')
            )
          )
        ),

        // Accounts Pool Card
        status.accounts && status.accounts.length > 0
          ? React.createElement(
              'div',
              { className: 'cb-section-card' },
              React.createElement(
                'div',
                { className: 'cb-section-title' },
                t('accounts.title')
              ),
              React.createElement(
                'div',
                { className: 'cb-section-desc' },
                t('accounts.desc')
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
                    React.createElement('th', null, 'Account'),
                    React.createElement('th', null, 'Credential Ref'),
                    React.createElement('th', null, 'Status'),
                    React.createElement('th', { style: { textAlign: 'right' } }, 'Action')
                  )
                ),
                React.createElement(
                  'tbody',
                  null,
                  status.accounts.map((acc) => {
                    const isActive = status.activeAccount === acc.apiKeyEnv || (!status.activeAccount && acc.id === 'default')
                    return React.createElement(
                      'tr',
                      { key: acc.id },
                      React.createElement('td', null, React.createElement('strong', null, acc.label)),
                      React.createElement('td', null, React.createElement('code', null, acc.apiKeyEnv)),
                      React.createElement(
                        'td',
                        null,
                        acc.present
                          ? React.createElement('span', { className: 'cb-badge cb-badge-ok' }, `Configured (${acc.source})`)
                          : React.createElement('span', { className: 'cb-badge cb-badge-warn' }, 'Missing Key'),
                        isActive
                          ? React.createElement('span', { className: 'cb-badge cb-badge-ok', style: { marginLeft: '6px' } }, t('accounts.active_badge'))
                          : null
                      ),
                      React.createElement(
                        'td',
                        { style: { textAlign: 'right' } },
                        !isActive && acc.present
                          ? React.createElement(
                              'button',
                              {
                                type: 'button',
                                className: 'cb-btn',
                                style: { padding: '4px 8px', fontSize: '11px' },
                                disabled: !!busy,
                                onClick: () => handlePinAccount(acc.apiKeyEnv),
                              },
                              t('accounts.pin_btn')
                            )
                          : null
                      )
                    )
                  })
                )
              )
            )
          : null,

        // Quota Warning Banner
        status.quotaWarning
          ? React.createElement(
              'div',
              { className: status.quotaWarning.level === 'exhausted' ? 'cb-banner-exhausted' : 'cb-banner-warning' },
              React.createElement('span', { style: { fontSize: '16px' } }, status.quotaWarning.level === 'exhausted' ? '🚨' : '⚠️'),
              React.createElement(
                'div',
                { style: { flex: 1 } },
                React.createElement('div', null, status.quotaWarning.message),
                status.quotaWarning.resetsAt
                  ? React.createElement(
                      'div',
                      { style: { fontSize: '11px', opacity: 0.9, marginTop: '2px' } },
                      t('quota.reset_at', { time: new Date(status.quotaWarning.resetsAt).toLocaleTimeString() })
                    )
                  : null
              )
            )
          : null,

        // Card 2: Subscription Limits & Usage Dashboard
        keyPresent
          ? React.createElement(
              'div',
              { className: 'cb-section-card' },
              React.createElement(
                'div',
                { className: 'cb-section-title' },
                t('quota.title'),
                React.createElement(
                  'button',
                  {
                    type: 'button',
                    className: 'cb-btn',
                    disabled: !!busy,
                    onClick: handleRefreshQuota,
                  },
                  busy === 'refresh-quota' ? t('quota.refreshing') : t('quota.refresh')
                )
              ),
              React.createElement(
                'div',
                { className: 'cb-section-desc' },
                usage?.user?.email
                  ? t('quota.account', { email: usage.user.email, plan: usage.plan || 'ClinePass ($9.99/mo)' })
                  : t('quota.desc')
              ),
              React.createElement(
                'div',
                { className: 'cb-grid-2' },
                React.createElement(ProgressBar, {
                  label: t('quota.window_5h'),
                  percentUsed: usage?.windows?.fiveHour?.percentUsed || 0,
                  remainingPercent: usage?.windows?.fiveHour?.remainingPercent || 100,
                  resetsAt: usage?.windows?.fiveHour?.resetsAt,
                  t,
                }),
                React.createElement(ProgressBar, {
                  label: t('quota.window_weekly'),
                  percentUsed: usage?.windows?.weekly?.percentUsed || 0,
                  remainingPercent: usage?.windows?.weekly?.remainingPercent || 100,
                  resetsAt: usage?.windows?.weekly?.resetsAt,
                  t,
                })
              )
            )
          : null,

        // Card 3: Model Picker Management with Official Plan Sync & Auto-Enable
        React.createElement(
          'div',
          { className: 'cb-section-card' },
          React.createElement(
            'div',
            { className: 'cb-section-title' },
            t('models.title', { enabled: enabledCount, total: modelsList.length }),
            React.createElement(
              'div',
              { className: 'cb-row' },
              React.createElement(
                'button',
                {
                  type: 'button',
                  className: 'cb-btn',
                  disabled: !!busy || !keyPresent,
                  onClick: handleSyncPlanModels,
                },
                busy === 'sync-models' ? t('models.syncing') : t('models.sync')
              ),
              React.createElement(
                'button',
                { type: 'button', className: 'cb-btn', onClick: () => handleSetModelsFilter('all') },
                t('models.all')
              ),
              React.createElement(
                'button',
                { type: 'button', className: 'cb-btn', onClick: () => handleSetModelsFilter('vision') },
                t('models.vision')
              ),
              React.createElement(
                'button',
                { type: 'button', className: 'cb-btn', onClick: () => handleSetModelsFilter('coding') },
                t('models.coding')
              ),
              React.createElement(
                'button',
                { type: 'button', className: 'cb-btn', onClick: () => handleSetModelsFilter('recommended') },
                t('models.recommended')
              )
            )
          ),
          React.createElement(
            'div',
            { className: 'cb-section-desc' },
            t('models.desc')
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
                React.createElement('th', { style: { width: '40px' } }, t('models.th_active')),
                React.createElement('th', null, t('models.th_name')),
                React.createElement('th', null, t('models.th_id')),
                React.createElement('th', null, t('models.th_ctx')),
                React.createElement('th', null, t('models.th_caps'))
              )
            ),
            React.createElement(
              'tbody',
              null,
              modelsList.map((m) => {
                const isEnabled = !disabledSet.has(m.id)
                return React.createElement(
                  'tr',
                  { key: m.id },
                  React.createElement(
                    'td',
                    null,
                    React.createElement('input', {
                      type: 'checkbox',
                      checked: isEnabled,
                      onChange: () => handleToggleModel(m.id),
                    })
                  ),
                  React.createElement(
                    'td',
                    null,
                    React.createElement('strong', null, m.name),
                    m.recommended
                      ? React.createElement('span', { className: 'cb-badge cb-badge-ok', style: { marginLeft: '6px' } }, t('models.star'))
                      : null,
                    m.isCustom
                      ? React.createElement('span', { className: 'cb-badge', style: { marginLeft: '6px', opacity: 0.8 } }, t('models.auto_new'))
                      : null
                  ),
                  React.createElement('td', null, React.createElement('code', null, m.id)),
                  React.createElement('td', null, `${Math.round((m.contextLength || 200000) / 1000)}k`),
                  React.createElement(
                    'td',
                    null,
                    React.createElement('span', { className: 'cb-badge' }, m.category || 'general'),
                    m.input?.includes('image') || m.input?.includes('vision')
                      ? React.createElement('span', { className: 'cb-badge', style: { marginLeft: '4px' } }, 'Vision')
                      : null,
                    m.reasoningEfforts?.length || m.reasoning
                      ? React.createElement('span', { className: 'cb-badge', style: { marginLeft: '4px' } }, '🧠 Reasoning')
                      : null
                  )
                )
              })
            )
          )
        ),

        // Card 4: Session Metrics & Usage Tracking
        React.createElement(
          'div',
          { className: 'cb-section-card' },
          React.createElement(
            'div',
            { className: 'cb-section-title' },
            t('stats.title')
          ),
          React.createElement(
            'div',
            { className: 'cb-section-desc' },
            t('stats.desc')
          ),
          React.createElement(
            'div',
            { className: 'cb-grid-2' },
            React.createElement(
              'div',
              { className: 'cb-stat-box' },
              React.createElement('div', { className: 'cb-stat-val' }, `${status.sessionStats?.successfulRequests || 0} / ${status.sessionStats?.totalRequests || 0}`),
              React.createElement('div', { className: 'cb-stat-lbl' }, t('stats.requests'))
            ),
            React.createElement(
              'div',
              { className: 'cb-stat-box' },
              React.createElement('div', { className: 'cb-stat-val' }, `~${status.sessionStats?.totalTokensEst || 0}`),
              React.createElement('div', { className: 'cb-stat-lbl' }, t('stats.tokens'))
            ),
            React.createElement(
              'div',
              { className: 'cb-stat-box' },
              React.createElement('div', { className: 'cb-stat-val' }, status.sessionStats?.lastLatencyMs ? `${status.sessionStats.lastLatencyMs} ms` : '—'),
              React.createElement('div', { className: 'cb-stat-lbl' }, t('stats.latency'))
            ),
            React.createElement(
              'div',
              { className: 'cb-stat-box' },
              React.createElement('div', { className: 'cb-stat-val' }, status.sessionStats?.lastRequestAt ? new Date(status.sessionStats.lastRequestAt).toLocaleTimeString() : '—'),
              React.createElement('div', { className: 'cb-stat-lbl' }, t('stats.last_req'))
            )
          )
        ),

        // Card 5: Diagnostics & Sync with DSH
        React.createElement(
          'div',
          { className: 'cb-section-card' },
          React.createElement(
            'div',
            { className: 'cb-section-title' },
            t('diag.title')
          ),
          React.createElement(
            'div',
            { className: 'cb-section-desc' },
            t('diag.desc')
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
              busy === 'smoke' ? t('diag.smoke_testing') : t('diag.smoke_btn')
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
                  busy === 'unregister' ? t('diag.unregistering') : t('diag.unregister_btn')
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
              busy === 'register' ? t('diag.resyncing') : t('diag.resync_btn')
            )
          ),
          smokeResult
            ? React.createElement(
                'div',
                { className: 'cb-preview' },
                `✅ Latency: ${smokeResult.latencyMs} ms | Model: ${smokeResult.model}\nResponse: ${smokeResult.preview || '(empty)'}`
              )
            : null
        )
      )
    }

    // Accordion item for Plugins section
    function PluginCard(props) {
      const [open, setOpen] = React.useState(false)
      const t = props?.t || makeT(ru, en)
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
          React.createElement('span', { style: { transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .16s' } },
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

    function apply(ctx) {
      if (ctx.locale && ctx.locale.register) {
        try { ctx.locale.register(NS, { en, ru }) } catch (_) {}
      }
      const t = (ctx.locale && ctx.locale.bind) ? ctx.locale.bind(NS) : makeT(ru, en)

      let placed = false
      try {
        const res = ctx.slots.inject('settings.plugin.item', () => {
          placed = true
          return ctx.slots.register(
            {
              name: 'settings.plugin.item',
              key: NS,
              locale: NS,
              inject: () => ({ ctx }),
            },
            (props) => React.createElement(ErrorBoundary, null, React.createElement(PluginCard, { ...props, ctx: (props && props.ctx) || ctx }))
          )
        })
        if (res === null) placed = false
      } catch (_) {
        placed = false
      }

      // Fallback to settings.section if settings.plugin.item is not declared
      if (!placed) {
        try {
          ctx.slots.inject('settings.section', () => {
            return ctx.slots.register(
              {
                name: 'settings.section',
                id: '@goodandready/dsh-clinebot',
                order: 28,
                locale: NS,
                label: () => t('title'),
                inject: () => ({ ctx }),
              },
              (props) => React.createElement(ErrorBoundary, null, React.createElement(SettingsPage, { ...props, ctx: (props && props.ctx) || ctx }))
            )
          })
        } catch (_) {}
      }
    }

    module.exports = { apply, inject: ['slots', 'locale', 'settingsScope'] }
    return module.exports
  },
})
