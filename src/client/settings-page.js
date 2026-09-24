function SettingsPage(props) {
  const ctx = props?.ctx
  const t = props?.t || makeT(en, en)

  const scope = React.useMemo(() => {
    let s = null
    try {
      if (typeof ctx?.get === 'function') {
        s = ctx.get('lanSettings') || ctx.get('settingsScope')
      }
    } catch (_) {
      s = null
    }
    if (!s) {
      try {
        if (ctx && typeof ctx === 'object') {
          s = ctx.lanSettings || ctx.settingsScope || null
        }
      } catch (_) {
        s = null
      }
    }
    if (!s) return undefined
    try {
      if (typeof s.bind === 'function') return s.bind({ namespace: NS })
      if (typeof s.get === 'function') return s.get(NS)
    } catch (_) {
      return undefined
    }
    return undefined
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
    if (!scope?.getSnapshot) return { status: 'ready', view: null }
    try {
      return scope.getSnapshot() || { status: 'ready', view: null }
    } catch (_) {
      return { status: 'ready', view: null }
    }
  }, [scope])

  const snapshot = React.useSyncExternalStore(
    subscribe,
    getSnapshot,
    React.useCallback(() => SNAPSHOT_LOADING, [])
  )
  const snapshotStatus = snapshot?.status || 'loading'

  const [status, setStatus] = React.useState(null)
  const [draft, setDraft] = React.useState(null)
  const [busy, setBusy] = React.useState('')
  const [err, setErr] = React.useState('')
  const [msg, setMsg] = React.useState('')
  const [smokeResult, setSmokeResult] = React.useState(null)

  // Plugin in-app updater state
  const [updateState, setUpdateState] = React.useState({
    checking: false,
    updating: false,
    currentVersion: '',
    latestVersion: '',
    updateAvailable: false,
    canAutoUpdate: true,
    error: '',
    notice: '',
  })

  // Key input state
  const [apiKeyInput, setApiKeyInput] = React.useState('')
  const [showKey, setShowKey] = React.useState(false)

  // Accounts state
  const [newAccountLabel, setNewAccountLabel] = React.useState('')
  const [newAccountEnv, setNewAccountEnv] = React.useState('')
  const [showAddAccount, setShowAddAccount] = React.useState(false)

  // Filter & Search for Models
  const [modelsFilter, setModelsFilter] = React.useState('all')
  const [modelsSearch, setModelsSearch] = React.useState('')
  const [disabledModels, setDisabledModels] = React.useState([])
  const [advancedOpen, setAdvancedOpen] = React.useState(false)

  // Loopback fast login state
  const [fastLoginActive, setFastLoginActive] = React.useState(false)
  const [fastLoginNotice, setFastLoginNotice] = React.useState('')

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

  const checkUpdate = React.useCallback(async () => {
    setUpdateState((s) => ({ ...s, checking: true, error: '' }))
    try {
      const res = await fetch(`${ROUTE_PREFIX}/update`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json().catch(() => ({}))
      setUpdateState((s) => ({
        ...s,
        checking: false,
        currentVersion: data.currentVersion || s.currentVersion,
        latestVersion: data.latestVersion || '',
        updateAvailable: !!data.updateAvailable,
        canAutoUpdate: data.canAutoUpdate !== false,
      }))
    } catch (_) {
      setUpdateState((s) => ({ ...s, checking: false }))
    }
  }, [])

  React.useEffect(() => {
    checkUpdate()
  }, [checkUpdate])

  async function handleTriggerUpdate() {
    if (updateState.updating) return
    setUpdateState((s) => ({ ...s, updating: true, error: '', notice: '' }))
    try {
      const res = await fetch(`${ROUTE_PREFIX}/update`, {
        method: 'POST',
        headers: { 'x-dsh-plugin-update': '1' },
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || data.ok === false || data.error) {
        throw new Error(data.error || `HTTP ${res.status}`)
      }
      const newVer = data.updatedVersion || updateState.latestVersion || updateState.currentVersion
      setUpdateState((s) => ({
        ...s,
        updating: false,
        updateAvailable: false,
        currentVersion: newVer,
        notice: t('update.done', { version: newVer }),
      }))
      setTimeout(() => checkUpdate(), 2000)
    } catch (err) {
      setUpdateState((s) => ({
        ...s,
        updating: false,
        error: t('update.failed', { error: String(err.message || err) }),
      }))
    }
  }

  async function handleSaveKey() {
    const keyVal = String(apiKeyInput || '').trim()
    if (!keyVal) {
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
        body: JSON.stringify({ apiKey: keyVal, apiKeyEnv: draft?.apiKeyEnv }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.ok) throw new Error(data.error || `HTTP ${res.status}`)
      setApiKeyInput('')
      setMsg(t('key.saved_msg', { status: data.validated ? 'OK' : 'Notice (check console)' }))
      await load()
    } catch (e) {
      setErr(String(e.message || e))
    } finally {
      setBusy('')
    }
  }

  async function handleRefreshQuota() {
    setBusy('refresh-quota')
    setErr('')
    setMsg('')
    try {
      const res = await fetch(`${ROUTE_PREFIX}/usage`)
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.ok) throw new Error(data.error || `HTTP ${res.status}`)
      setStatus((prev) => (prev ? { ...prev, usage: data } : prev))
      setMsg(t('quota.refreshed_msg'))
    } catch (e) {
      setErr(String(e.message || e))
    } finally {
      setBusy('')
    }
  }

  async function handleSyncPlanModels() {
    setBusy('sync-models')
    setErr('')
    setMsg('')
    try {
      const res = await fetch(`${ROUTE_PREFIX}/models/sync`, { method: 'POST' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.ok) throw new Error(data.error || `HTTP ${res.status}`)
      setMsg(t('models.synced_msg', { total: data.totalModelsCount, discovered: data.discoveredCount }))
      await load()
    } catch (e) {
      setErr(String(e.message || e))
    } finally {
      setBusy('')
    }
  }

  async function handleRegister() {
    setBusy('register')
    setErr('')
    setMsg('')
    try {
      const res = await fetch(`${ROUTE_PREFIX}/register`, { method: 'POST' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.ok) throw new Error(data.error || `HTTP ${res.status}`)
      const count = status?.availableModels?.filter((m) => !(draft?.disabledModels || []).includes(m.id)).length || 0
      setMsg(t('diag.resynced_msg', { count }))
      await load()
    } catch (e) {
      setErr(String(e.message || e))
    } finally {
      setBusy('')
    }
  }

  async function handleUnregister() {
    setBusy('unregister')
    setErr('')
    setMsg('')
    try {
      const res = await fetch(`${ROUTE_PREFIX}/unregister`, { method: 'POST' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.ok) throw new Error(data.error || `HTTP ${res.status}`)
      setMsg(t('diag.unregistered_msg'))
      await load()
    } catch (e) {
      setErr(String(e.message || e))
    } finally {
      setBusy('')
    }
  }

  async function handleSmoke() {
    setBusy('smoke')
    setErr('')
    setSmokeResult(null)
    try {
      const res = await fetch(`${ROUTE_PREFIX}/smoke`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: draft?.defaultModel }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.ok) throw new Error(data.error || `HTTP ${res.status}`)
      setSmokeResult(data)
    } catch (e) {
      setErr(String(e.message || e))
    } finally {
      setBusy('')
    }
  }

  async function handleFastLogin() {
    setBusy('fast-login')
    setErr('')
    try {
      const res = await fetch(`${ROUTE_PREFIX}/auth/begin`, { method: 'POST' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.ok) throw new Error(data.error || `HTTP ${res.status}`)
      if (data.authUrl) {
        window.open(data.authUrl, '_blank')
      }
    } catch (e) {
      setErr(String(e.message || e))
    } finally {
      setBusy('')
    }
  }

  async function handlePinAccount(accountEnv) {
    setBusy('pin-account')
    setErr('')
    try {
      const res = await fetch(`${ROUTE_PREFIX}/accounts/active`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ account: accountEnv }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.ok) throw new Error(data.error || `HTTP ${res.status}`)
      await load()
    } catch (e) {
      setErr(String(e.message || e))
    } finally {
      setBusy('')
    }
  }

  const debounceTimerRef = typeof React.useRef === 'function' ? React.useRef(null) : { current: null }
  function debounceSaveDisabledModels(nextDisabled) {
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current)
    debounceTimerRef.current = setTimeout(async () => {
      try {
        await fetch(`${ROUTE_PREFIX}/models/toggle`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ disabledModels: nextDisabled }),
        })
      } catch (err) {
        console.warn('[dsh-clinebot] Failed saving disabled models:', err)
      }
    }, 400)
  }

  function handleToggleModel(id) {
    const curr = draft?.disabledModels || []
    const isCurrentlyDisabled = curr.includes(id)
    const next = isCurrentlyDisabled ? curr.filter((x) => x !== id) : [...curr, id]
    const all = status?.availableModels || []
    const enabledIds = all.map((m) => m.id).filter((mId) => !next.includes(mId))
    setDraft({ ...draft, disabledModels: next, enabledModels: enabledIds })
    debounceSaveDisabledModels(next)
  }

  function handleSetModelsFilter(type) {
    const all = status?.availableModels || []
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
    debounceSaveDisabledModels(nextDisabled)
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
      React.createElement('div', { className: 'cb-page-sub' }, t('header.sub'))
    ),

    // In-app Update Bar
    React.createElement(UpdateBanner, { updateState, handleTriggerUpdate, t }),

    // Notifications
    err ? React.createElement('div', { className: 'cb-alert-bad' }, err) : null,
    msg ? React.createElement('div', { className: 'cb-alert-ok' }, msg) : null,

    // Card 1: API Key and Credentials
    React.createElement(KeySection, {
      keyPresent,
      apiKeyInput,
      setApiKeyInput,
      showKey,
      setShowKey,
      busy,
      draft,
      handleSaveKey,
      handleFastLogin,
      t,
    }),

    // Accounts Pool Card
    React.createElement(AccountsSection, { status, busy, handlePinAccount, t }),

    // Quota Warning & Dashboard Card
    React.createElement(QuotaSection, { keyPresent, status, usage, busy, handleRefreshQuota, t }),

    // Card 3: Model Picker Management
    React.createElement(ModelsSection, {
      modelsList,
      disabledSet,
      enabledCount,
      keyPresent,
      busy,
      handleSyncPlanModels,
      handleSetModelsFilter,
      handleToggleModel,
      t,
    }),

    // Card 4: Session Metrics & Usage Tracking
    React.createElement(StatsSection, { status, t }),

    // Card 5: Diagnostics & Sync with DSH
    React.createElement(DiagSection, {
      keyPresent,
      isRegistered,
      busy,
      smokeResult,
      handleSmoke,
      handleUnregister,
      handleRegister,
      t,
    })
  )
}
