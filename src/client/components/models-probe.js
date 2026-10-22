function ModelProbeButton({ modelId, busy, t }) {
  const [state, setState] = React.useState({ busy: false, result: null, error: '' })

  async function probe() {
    setState({ busy: true, result: null, error: '' })
    try {
      const response = await fetchWithTimeout(`${ROUTE_PREFIX}/models/probe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ modelId }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok || !data.ok) throw new Error(data.error || `HTTP ${response.status}`)
      setState({ busy: false, result: data, error: '' })
    } catch (err) {
      setState({ busy: false, result: null, error: String(err?.message || err) })
    }
  }

  return React.createElement(
    'span',
    { className: 'cb-row', style: { gap: '4px', marginTop: '2px' } },
    React.createElement(
      'button',
      {
        type: 'button',
        className: 'cb-btn',
        style: { padding: '1px 6px', fontSize: '10px' },
        disabled: !!busy || state.busy,
        title: t('models.btn_probe'),
        onClick: probe,
      },
      state.busy ? t('models.probing') : t('models.btn_probe')
    ),
    state.result
      ? React.createElement('span', { className: 'cb-hint', style: { fontSize: '10px' } },
          t('models.probe_result', { ms: state.result.latencyMs ?? '—' }))
      : null,
    state.error
      ? React.createElement('span', { className: 'cb-hint', style: { fontSize: '10px', color: 'var(--dsw-alias-state-error-primary)' } },
          t('models.probe_failed', { error: state.error }))
      : null
  )
}
