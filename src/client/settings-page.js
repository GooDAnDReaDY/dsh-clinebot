function SettingsPage(props) {
  const ctx = props?.ctx
  const t = props?.t || makeT(en, en)
  const configSnapshot = useConfigFormsSnapshot(ctx)

  const [status, setStatus] = React.useState(null)
  const [draft, setDraft] = React.useState(null)
  const [busy, setBusy] = React.useState('')
  const [err, setErr] = React.useState(''), [msg, setMsg] = React.useState('')
  const [smokeResult, setSmokeResult] = React.useState(null)

  const [updateState, setUpdateState] = React.useState({
    status: 'idle', checking: false, updating: false, currentVersion: '', latestVersion: '',
    updateAvailable: false, canAutoUpdate: true, latestCheckFailed: false, lastCheckedAt: null,
    error: '', notice: '',
  })

  const [apiKeyInput, setApiKeyInput] = React.useState(''), [showKey, setShowKey] = React.useState(false)

  React.useEffect(() => { ensureCss() }, [])

  const pendingRef = React.useRef({})
  const load = React.useCallback(async () => {
    setErr('')
    const [res, statsRes] = await Promise.all([
      fetchWithTimeout(`${ROUTE_PREFIX}/status`, { cache: 'no-store' }),
      fetchWithTimeout(`${ROUTE_PREFIX}/stats`, { cache: 'no-store' }).catch(() => null),
    ])
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
    const rawStats = statsRes && statsRes.ok ? await statsRes.json().catch(() => null) : null
    const statsObj = (rawStats && typeof rawStats === 'object' && rawStats.stats) ? rawStats.stats : (rawStats || data.statsSummary || {})
    setStatus({ ...data, statsSummary: statsObj })
    // Preserve unsaved staged fields across an account/model refresh.
    setDraft({ ...(data.config || {}), ...(pendingRef.current || {}) })
  }, [])

  React.useEffect(() => { load().catch((e) => setErr(String(e.message || e))) }, [load])

  const staged = useStagedConfig({ status, draft, setDraft, load, t, pendingRef })
  const modelSelection = useModelSelection({ status, draft, setDraft, load, setErr })

  const checkUpdate = React.useCallback(async () => {
    setUpdateState((s) => ({ ...s, checking: true, status: 'checking', error: '' }))
    try {
      const res = await fetchWithTimeout(`${ROUTE_PREFIX}/update`)
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
      const res = await fetchWithTimeout(`${ROUTE_PREFIX}/update`, {
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

  const {
    handlePinAccount,
    handleAddAccount,
    handleDeleteAccount,
    handleRenameAccount,
    handleClearKey,
  } = createAccountActions({ performAction, load, t, setMsg })

  async function handleSaveKey() {
    const keyVal = String(apiKeyInput || '').trim()
    if (!keyVal) { setErr(t('key.empty_err')); return }
    await performAction('save-key', async () => {
      const res = await fetchWithTimeout(`${ROUTE_PREFIX}/save-key`, {
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
      const res = await fetchWithTimeout(`${ROUTE_PREFIX}/usage`)
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.ok) throw new Error(data.error || `HTTP ${res.status}`)
      setStatus((prev) => (prev ? { ...prev, usage: data } : prev))
      setMsg(t('quota.refreshed_msg'))
    })
  }

  async function handleUpdateModelContext(payload) {
    await performAction('update-context', async () => {
      const res = await fetchWithTimeout(`${ROUTE_PREFIX}/models/context`, {
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
      const res = await fetchWithTimeout(`${ROUTE_PREFIX}/models/sync`, { method: 'POST' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.ok) throw new Error(data.error || `HTTP ${res.status}`)
      setMsg(t('models.synced_msg', { total: data.totalModelsCount, discovered: data.discoveredCount }))
      await load()
    })
  }

  async function handleRegister() {
    await performAction('register', async () => {
      const res = await fetchWithTimeout(`${ROUTE_PREFIX}/register`, { method: 'POST' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.ok) throw new Error(data.error || `HTTP ${res.status}`)
      const count = status?.availableModels?.filter((m) => !(draft?.disabledModels || []).includes(m.id)).length || 0
      setMsg(t('diag.resynced_msg', { count }))
      await load()
    })
  }

  async function handleUnregister() {
    await performAction('unregister', async () => {
      const res = await fetchWithTimeout(`${ROUTE_PREFIX}/unregister`, { method: 'POST' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.ok) throw new Error(data.error || `HTTP ${res.status}`)
      setMsg(t('diag.unregistered_msg'))
      await load()
    })
  }

  async function handleSmoke() {
    setSmokeResult(null)
    await performAction('smoke', async () => {
      const res = await fetchWithTimeout(`${ROUTE_PREFIX}/smoke`, {
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
        const res = await fetchWithTimeout(`${ROUTE_PREFIX}/key/verify`, {
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

  async function handleConfigPatch(patch) {
    setDraft((d) => ({ ...(d || {}), ...(patch || {}) }))
    await performAction('patch-config', async () => {
      const res = await fetchWithTimeout(`${ROUTE_PREFIX}/config`, {
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
      const res = await fetchWithTimeout(`${ROUTE_PREFIX}/stats/reset`, { method: 'POST' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.ok) throw new Error(data.error || `HTTP ${res.status}`)
      await load()
    })
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
        t('header.title'),
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
    configSnapshot?.status === 'unavailable'
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
      handleRenameAccount,
      handleClearKey,
      accountMode: draft?.accountMode || status?.config?.accountMode || 'least_used',
      handleUpdateAccountMode: (mode) => handleConfigPatch({ accountMode: mode }),
      modelRoutes: draft?.modelRoutes || status?.config?.modelRoutes || {},
      onUpdateModelRoutes: (routes) => handleConfigPatch({ modelRoutes: routes }),
      t,
    }),

    // Quota Warning & Dashboard Card
    React.createElement(QuotaSection, {
      keyPresent,
      status,
      usage,
      busy,
      handleRefreshQuota,
      showSidebarQuota: draft?.showSidebarQuota !== false,
      onToggleSidebarQuota: (value) => staged.stage({ showSidebarQuota: value }),
      t,
    }),

    // Models & context: a foldable group keeps the long model table out of the
    // initial page while preserving the picker controls.
    React.createElement(
      CollapsibleGroup,
      {
        title: t('settings.models_group'),
        description: t('settings.models_group_hint'),
        badge: `${enabledCount}/${modelsList.length}`,
        divided: true,
        defaultOpen: false,
      },
      React.createElement(ModelsSection, {
        modelsList,
        disabledSet,
        enabledCount,
        keyPresent,
        busy,
        handleSyncPlanModels,
        handleUpdateModelContext,
        handleSetModelsFilter: modelSelection.handleSetModelsFilter,
        handleToggleModel: modelSelection.handleToggleModel,
        planSynced: !!(status?.config?.planSynced || (status?.config?.dynamicModels && status.config.dynamicModels.length > 0)),
        planSyncedAt: status?.config?.planSyncedAt || 0,
        defaultModelWarning: status?.config?.defaultModelWarning || '',
        customModels: draft?.customModels || [],
        modelReasoningDefaults: draft?.modelReasoningDefaults || {},
        visibleModels: draft?.visibleModels || [],
        filterModelsByPlan: draft?.filterModelsByPlan !== false,
        onConfigUpdate: staged.stage,
        onUpdateReasoningEffort: (modelId, effort) => {
          const next = { ...(draft?.modelReasoningDefaults || {}) }
          if (!effort) delete next[modelId]; else next[modelId] = effort
          staged.stage({ modelReasoningDefaults: next })
        },
        t,
      }),
      React.createElement(PriceSection, {
        modelsList,
        priceOverrides: draft?.priceOverrides || {},
        onConfigUpdate: staged.stage,
        t,
      })
    ),

    // Session Metrics & Usage Tracking
    React.createElement(StatsSection, { status, onResetStats: handleResetStats, busy, t }),

    React.createElement(IntegrationsSection, {
      draft,
      onStage: staged.stage,
      transport: draft?.transport || status?.config?.transport || 'adapter',
      t,
    }),

    // Diagnostics & Sync with DSH
    React.createElement(DiagSection, {
      keyPresent,
      isRegistered,
      busy,
      smokeResult,
      handleSmoke,
      handleUnregister,
      handleRegister,
      proxyMode: draft?.proxyMode !== false,
      onToggleProxy: (value) => staged.stage({ proxyMode: value }),
      t,
    }),

    React.createElement(AdvancedSection, {
      draft,
      onStage: staged.stage,
      transport: draft?.transport || status?.config?.transport || 'adapter',
      t,
    }),

    React.createElement(SaveBar, {
      pendingCount: staged.pendingCount,
      saving: staged.saving,
      saveState: staged.saveState,
      saveError: staged.saveError,
      invalid: staged.invalid,
      validationError: staged.validationError,
      onSave: staged.save,
      onDiscard: staged.discard,
      t,
    })
  )
}
