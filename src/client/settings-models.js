/**
 * Model-picker selection state and debounced persistence.
 *
 * Model toggles are immediate by design: the picker is a direct inventory
 * control, not part of the staged settings form.
 */
function useModelSelection({ status, draft, setDraft, load, setErr }) {
  const debounceTimerRef = React.useRef(null)

  React.useEffect(() => () => {
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current)
  }, [])

  function debounceSaveDisabledModels(nextDisabled, previousDisabled) {
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current)
    debounceTimerRef.current = setTimeout(async () => {
      try {
        const res = await fetchWithTimeout(`${ROUTE_PREFIX}/models/toggle`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ disabledModels: nextDisabled }),
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok || !data.ok) throw new Error(data.error || `HTTP ${res.status}`)
        await load()
      } catch (error) {
        console.warn('[dsh-clinebot] Failed saving disabled models:', error)
        setErr(String(error?.message || error))
        setDraft((previous) => {
          if (!previous) return previous
          const all = status?.availableModels || []
          const previousEnabled = all.map((model) => model.id).filter((id) => !previousDisabled.includes(id))
          return { ...previous, disabledModels: previousDisabled, enabledModels: previousEnabled }
        })
      }
    }, 400)
  }

  function handleToggleModel(id) {
    const current = draft?.disabledModels || []
    const next = current.includes(id)
      ? current.filter((entry) => entry !== id)
      : [...current, id]
    const all = status?.availableModels || []
    const enabled = all.map((model) => model.id).filter((modelId) => !next.includes(modelId))
    setDraft({ ...(draft || {}), disabledModels: next, enabledModels: enabled })
    debounceSaveDisabledModels(next, current)
  }

  function handleSetModelsFilter(type) {
    const all = status?.availableModels || []
    let allowed = new Set()
    if (type === 'all') allowed = new Set(all.map((model) => model.id))
    else if (type === 'vision') allowed = new Set(all.filter((model) => model.input?.includes('image') || model.input?.includes('vision')).map((model) => model.id))
    else if (type === 'coding') allowed = new Set(all.filter((model) => model.category === 'coding').map((model) => model.id))
    else if (type === 'recommended') allowed = new Set(all.filter((model) => model.recommended).map((model) => model.id))

    const current = draft?.disabledModels || []
    const nextDisabled = all.map((model) => model.id).filter((id) => !allowed.has(id))
    const nextEnabled = Array.from(allowed)
    setDraft({ ...(draft || {}), disabledModels: nextDisabled, enabledModels: nextEnabled })
    debounceSaveDisabledModels(nextDisabled, current)
  }

  return { handleToggleModel, handleSetModelsFilter }
}
