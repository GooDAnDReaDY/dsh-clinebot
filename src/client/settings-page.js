function SettingsPage(props) {
  const ctx = props?.ctx
  const t = props?.t || makeT(en, en)
  const snapshotStatus = useConfigFormsSnapshot(ctx)

  const [status, setStatus] = React.useState(null)
  const [draft, setDraft] = React.useState(null)
  const [busy, setBusy] = React.useState('')
  const [err, setErr] = React.useState('')
  const [msg, setMsg] = React.useState('')
  const [smokeResult, setSmokeResult] = React.useState(null)

  const [updateState, setUpdateState] = React.useState({
    status: 'idle', checking: false, updating: false, currentVersion: '', latestVersion: '',
    updateAvailable: false, canAutoUpdate: true, latestCheckFailed: false, lastCheckedAt: null,
    error: '', notice: '',
  })

  const [apiKeyInput, setApiKeyInput] = React.useState('')
  const [showKey, setShowKey] = React.useState(false)

  React.useEffect(() => { ensureCss() }, [])

  const load = React.useCallback(async () => {
    setErr('')
    const [res, statsRes] = await Promise.all([
      fetch(`${ROUTE_PREFIX}/status`, { cache: 'no-store' }),
      fetch(`${ROUTE_PREFIX}/stats`, { cache: 'no-store' }).catch(() => null),
    ])
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
    const rawStats = statsRes && statsRes.ok ? await statsRes.json().catch(() => null) : null
    const statsObj = (rawStats && typeof rawStats === 'object' && rawStats.stats) ? rawStats.stats : (rawStats || data.statsSummary || {})
    setStatus({ ...data, statsSummary: statsObj })
    setDraft(data.config || {})
  }, [])

  React.useEffect(() => {
    load().catch((e) => setErr(String(e.message || e)))
  }, [load])

  const checkUpdate = React.useCallback(async () => {
    setUpdateState((s) => ({ ...s, checking: true, status: 'checking', error: '' }))
    try {
      const res = await fetch(`${ROUTE_PREFIX}/update`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json().catch(() => ({}))
      if (data.latestCheckFailed) {
        setUpdateState((s) => ({
          ...s,
          checking: false,
          status: 'error',
          latestCheckFailed: true,
          currentVersion: data.currentVersion || s.currentVersion,
          error: t('update.check_failed'),
        }))
        return
      }
      const isAvailable = Boolean(data.updateAvailable)
      setUpdateState((s) => ({
        ...s,
        checking: false,
        status: isAvailable ? 'available' : 'current',
        currentVersion: data.currentVersion || s.currentVersion,
        latestVersion: data.latestVersion || '',
        updateAvailable: isAvailable,
        latestCheckFailed: false,
        lastCheckedAt: Date.now(),
        canAutoUpdate: data.canAutoUpdate !== false,
        error: '',
      }))
    } catch (err) {
      setUpdateState((s) => ({
        ...s,
        checking: false,
        status: 'error',
        latestCheckFailed: true,
        error: String(err?.message || err || t('update.check_failed')),
      }))
    }
  }, [t])

  React.useEffect(() => { checkUpdate() }, [checkUpdate])

  async function handleTriggerUpdate() {
    if (updateState.updating) return
    setUpdateState((s) => ({ ...s, updating: true, error: '', notice: '' }))
    try {
      const res = await fetch(`${ROUTE_PREFIX}/update`, {
        method: 'POST',
        headers: { 'x-dsh-plugin-update': '1' },
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || data.ok === false || data.error) throw new Error(data.error || `HTTP ${res.status}`)
      const newVer = data.updatedVersion || updateState.latestVersion || updateState.currentVersion
      setUpdateState((s) => ({
        ...s,
        updating: false,
        status: 'current',
        updateAvailable: false,
        currentVersion: newVer,
        lastCheckedAt: Date.now(),
        notice: t('update.done', { version: newVer }),
      }))
      setTimeout(() => checkUpdate(), 2000)
    } catch (err) {
      setUpdateState((s) => ({
        ...s,
        updating: false,
        status: s.updateAvailable ? 'available' : 'error',
        error: t('update.failed', { error: String(err?.message || err) }),
      }))
    }
  }

  async function performAction(busyKey, fn) {
    setBusy(busyKey)
    setErr('')
    setMsg('')
    try {
      await fn()
    } catch (e) {
      setErr(String(e.message || e))
    } finally {
      setBusy('')
    }
  }

  async function handleSaveKey() {
    const keyVal = String(apiKeyInput || '').trim()
    if (!keyVal) { setErr(t('key.empty_err')); return }
    await performAction('save-key', async () => {
      const res = await fetch(`${ROUTE_PREFIX}/save-key`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey: keyVal, apiKeyEnv: draft?.apiKeyEnv }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.ok) throw new Error(data.error || `HTTP ${res.status}`)
      setApiKeyInput('')
      setMsg(t('key.saved_msg', { status: data.validated ? 'OK' : 'Notice (check console)' }))
      await load()
    })
  }

  async function handleRefreshQuota() {
    await performAction('refresh-quota', async () => {
      const res = await fetch(`${ROUTE_PREFIX}/usage`)
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.ok) throw new Error(data.error || `HTTP ${res.status}`)
      setStatus((prev) => (prev ? { ...prev, usage: data } : prev))
      setMsg(t('quota.refreshed_msg'))
    })
  }

  async function handleUpdateModelContext(payload) {
    await performAction('update-context', async () => {
      const res = await fetch(`${ROUTE_PREFIX}/models/context`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.ok) throw new Error(data.error || `HTTP ${res.status}`)
      setMsg(t('models.context_updated_msg'))
      await load()
    })
  }

  async function handleSyncPlanModels() {
    await performAction('sync-models', async () => {
      const res = await fetch(`${ROUTE_PREFIX}/models/sync`, { method: 'POST' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.ok) throw new Error(data.error || `HTTP ${res.status}`)
      setMsg(t('models.synced_msg', { total: data.totalModelsCount, discovered: data.discoveredCount }))
      await load()
    })
  }

  async function handleRegister() {
    await performAction('register', async () => {
      const res = await fetch(`${ROUTE_PREFIX}/register`, { method: 'POST' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.ok) throw new Error(data.error || `HTTP ${res.status}`)
      const count = status?.availableModels?.filter((m) => !(draft?.disabledModels || []).includes(m.id)).length || 0
      setMsg(t('diag.resynced_msg', { count }))
      await load()
    })
  }

  async function handleUnregister() {
    await performAction('unregister', async () => {
      const res = await fetch(`${ROUTE_PREFIX}/unregister`, { method: 'POST' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.ok) throw new Error(data.error || `HTTP ${res.status}`)
      setMsg(t('diag.unregistered_msg'))
      await load()
    })
  }

  async function handleSmoke() {
    setSmokeResult(null)
    await performAction('smoke', async () => {
      const res = await fetch(`${ROUTE_PREFIX}/smoke`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: draft?.defaultModel }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.ok) throw new Error(data.error || `HTTP ${res.status}`)
      setSmokeResult(data)
    })
  }

  const [verifyStatus, setVerifyStatus] = React.useState({ state: 'idle', email: '', plan: '', error: '' })
  const verifyTimerRef = typeof React.useRef === 'function' ? React.useRef(null) : { current: null }

  React.useEffect(() => {
    const raw = String(apiKeyInput || '').trim()
    if (!raw || raw.length < 10) {
      setVerifyStatus({ state: 'idle', email: '', plan: '', error: '' })
      return
    }
    if (verifyTimerRef.current) clearTimeout(verifyTimerRef.current)
    verifyTimerRef.current = setTimeout(async () => {
      setVerifyStatus({ state: 'verifying', email: '', plan: '', error: '' })
      try {
        const res = await fetch(`${ROUTE_PREFIX}/key/verify`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ key: raw }),
        })
        const data = await res.json().catch(() => ({}))
        if (data.ok && data.valid) {
          setVerifyStatus({ state: 'valid', email: data.email, plan: data.plan, error: '' })
        } else {
          setVerifyStatus({ state: 'invalid', email: '', plan: '', error: data.error || 'Verification failed' })
        }
      } catch (err) {
        setVerifyStatus({ state: 'invalid', email: '', plan: '', error: String(err?.message || err) })
      }
    }, 500)
    return () => {
      if (verifyTimerRef.current) clearTimeout(verifyTimerRef.current)
    }
  }, [apiKeyInput])

  function handleFastLogin() {
    window.open('https://app.cline.bot/settings/api-keys', '_blank')
  }

  async function handlePinAccount(accountEnv) {
    await performAction('pin-account', async () => {
      const res = await fetch(`${ROUTE_PREFIX}/accounts/active`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ account: accountEnv }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.ok) throw new Error(data.error || `HTTP ${res.status}`)
      await load()
    })
  }

  async function handleAddAccount({ label, apiKeyEnv, apiKey }) {
    await performAction('add-account', async () => {
      const res = await fetch(`${ROUTE_PREFIX}/accounts`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label, apiKeyEnv, apiKey }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.ok) throw new Error(data.error || `HTTP ${res.status}`)
      setMsg(t('key.saved_msg', { status: data.validated ? 'OK' : (data.validationError || 'Notice') }))
      await load()
    })
  }

  async function handleDeleteAccount(accountEnv, deleteSecret = true) {
    await performAction('delete-account', async () => {
      const res = await fetch(`${ROUTE_PREFIX}/accounts/delete`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKeyEnv: accountEnv, deleteSecret }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.ok) throw new Error(data.error || `HTTP ${res.status}`)
      await load()
    })
  }

  async function handleConfigPatch(patch) {
    setDraft((d) => ({ ...(d || {}), ...(patch || {}) }))
    await performAction('patch-config', async () => {
      const res = await fetch(`${ROUTE_PREFIX}/config`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ config: patch }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || data.ok === false) throw new Error(data.error || `HTTP ${res.status}`)
      await load()
    })
  }

  async function handleResetStats() {
    await performAction('reset-stats', async () => {
      const res = await fetch(`${ROUTE_PREFIX}/stats/reset`, { method: 'POST' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.ok) throw new Error(data.error || `HTTP ${res.status}`)
      await load()
    })
  }

  const debounceTimerRef = typeof React.useRef === 'function' ? React.useRef(null) : { current: null }

  React.useEffect(() => {
    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current)
    }
  }, [])

  function debounceSaveDisabledModels(nextDisabled, previousDisabled) {
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current)
    debounceTimerRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`${ROUTE_PREFIX}/models/toggle`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ disabledModels: nextDisabled }),
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok || !data.ok) throw new Error(data.error || `HTTP ${res.status}`)
        await load()
      } catch (err) {
        console.warn('[dsh-clinebot] Failed saving disabled models:', err)
        setErr(String(err?.message || err))
        setDraft((prev) => {
          if (!prev) return prev
          const all = status?.availableModels || []
          const prevEnabled = all.map((m) => m.id).filter((mId) => !previousDisabled.includes(mId))
          return { ...prev, disabledModels: previousDisabled, enabledModels: prevEnabled }
        })
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
    debounceSaveDisabledModels(next, curr)
  }

  function handleSetModelsFilter(type) {
    const all = status?.availableModels || []
    let allowed = new Set()
    if (type === 'all') allowed = new Set(all.map((m) => m.id))
    else if (type === 'vision') allowed = new Set(all.filter((m) => m.input?.includes('image') || m.input?.includes('vision')).map((m) => m.id))
    else if (type === 'coding') allowed = new Set(all.filter((m) => m.category === 'coding').map((m) => m.id))
    else if (type === 'recommended') allowed = new Set(all.filter((m) => m.recommended).map((m) => m.id))

    const curr = draft?.disabledModels || []
    const nextDisabled = all.map((m) => m.id).filter((id) => !allowed.has(id))
    const nextEnabled = Array.from(allowed)
    setDraft({ ...draft, disabledModels: nextDisabled, enabledModels: nextEnabled })
    debounceSaveDisabledModels(nextDisabled, curr)
  }

  if (!status || !draft) {
    if (err) {
      return React.createElement(
        'div',
        { className: 'cb-page' },
        React.createElement('div', { className: 'cb-alert cb-alert-err' }, `${t('settings.loading')}: ${err}`),
        React.createElement('button', { type: 'button', className: 'cb-btn', style: { marginTop: '12px' }, onClick: () => { setErr(''); load().catch((e) => setErr(String(e.message || e))) } }, t('settings.retry'))
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
    React.createElement(UpdateBanner, { updateState, handleTriggerUpdate, handleCheckUpdate: checkUpdate, t }),

    // Settings host status warning
    snapshotStatus === 'unavailable'
      ? React.createElement('div', { className: 'cb-alert-bad', style: { marginBottom: '12px' } }, t('settings.unavailable'))
      : null,

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
      verifyStatus,
      t,
    }),

    // Accounts Pool Card
    React.createElement(AccountsSection, {
      status,
      busy,
      handlePinAccount,
      handleAddAccount,
      handleDeleteAccount,
      t,
    }),

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
      handleUpdateModelContext,
      handleSetModelsFilter,
      handleToggleModel,
      planSynced: !!(status?.config?.planSynced || (status?.config?.dynamicModels && status.config.dynamicModels.length > 0)),
      planSyncedAt: status?.config?.planSyncedAt || 0,
      defaultModelWarning: status?.config?.defaultModelWarning || '',
      customModels: draft?.customModels || [],
      modelReasoningDefaults: draft?.modelReasoningDefaults || {},
      onConfigUpdate: handleConfigPatch,
      onUpdateReasoningEffort: (modelId, effort) => {
        const next = { ...(draft?.modelReasoningDefaults || {}) }
        if (!effort) delete next[modelId]
        else next[modelId] = effort
        handleConfigPatch({ modelReasoningDefaults: next })
      },
      t,
    }),

    // Card 4: Session Metrics & Usage Tracking
    React.createElement(StatsSection, { status, onResetStats: handleResetStats, busy, t }),

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
