/**
 * Staged configuration draft for the ClineBot settings page.
 *
 * Fields edited in the form are merged into `pending` and written with one
 * `PUT /config` when the user presses Save. Account operations remain
 * immediate and are handled by the page's existing handlers.
 */
function useStagedConfig({ status, draft, setDraft, load, t, pendingRef }) {
  const [pending, setPending] = React.useState({})
  const [saving, setSaving] = React.useState(false)
  const [saveState, setSaveState] = React.useState('idle')
  const [saveError, setSaveError] = React.useState('')
  const savedTimer = React.useRef(null)

  React.useEffect(() => () => {
    if (savedTimer.current) clearTimeout(savedTimer.current)
  }, [])

  const validationError = React.useMemo(() => {
    if (Object.hasOwn(pending, 'baseUrl')) {
      const raw = String(pending.baseUrl || '').trim()
      try {
        const url = new URL(raw)
        const local = url.hostname === 'localhost' || url.hostname === '127.0.0.1'
        if (url.protocol !== 'https:' && !local) return t('settings.save_invalid_base_url')
      } catch {
        return t('settings.save_invalid_base_url')
      }
    }
    for (const key of ['timeoutMs', 'smokeTimeoutMs', 'streamIdleTimeoutMs', 'maxPayloadMb']) {
      if (!Object.hasOwn(pending, key)) continue
      const value = Number(pending[key])
      if (!Number.isFinite(value) || value <= 0) return t('settings.save_invalid_number')
    }
    return ''
  }, [pending, t])

  const stage = React.useCallback((patch) => {
    if (!patch || typeof patch !== 'object') return
    const next = { ...(pendingRef.current || {}), ...patch }
    pendingRef.current = next
    setPending(next)
    setDraft((current) => ({ ...(current || {}), ...patch }))
    setSaveState('unsaved')
    setSaveError('')
  }, [pendingRef, setDraft])

  const discard = React.useCallback(() => {
    pendingRef.current = {}
    setPending({})
    setDraft(status?.config || {})
    setSaveState('idle')
    setSaveError('')
  }, [pendingRef, setDraft, status])

  const save = React.useCallback(async () => {
    const patch = pendingRef.current || {}
    if (Object.keys(patch).length === 0 || saving) return
    if (validationError) {
      setSaveState('error')
      setSaveError(validationError)
      return
    }
    setSaving(true)
    setSaveState('saving')
    setSaveError('')
    try {
      const res = await fetchWithTimeout(`${ROUTE_PREFIX}/config`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ config: patch }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || data.ok === false) throw new Error(data.error || `HTTP ${res.status}`)
      pendingRef.current = {}
      setPending({})
      await load()
      setSaveState('saved')
      if (savedTimer.current) clearTimeout(savedTimer.current)
      savedTimer.current = setTimeout(() => {
        setSaveState((current) => (current === 'saved' ? 'idle' : current))
      }, 2500)
    } catch (error) {
      setSaveState('error')
      setSaveError(String(error?.message || error))
    } finally {
      setSaving(false)
    }
  }, [load, pendingRef, saving, validationError])

  return {
    pending,
    pendingCount: Object.keys(pending).length,
    saving,
    saveState,
    saveError,
    validationError,
    invalid: Boolean(validationError),
    stage,
    discard,
    save,
  }
}
