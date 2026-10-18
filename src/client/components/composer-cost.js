function formatTokens(count) {
  const n = Number(count) || 0
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M'
  if (n >= 1000) return (n / 1000).toFixed(1) + 'k'
  return String(n)
}

function calculateCost(tokens, modelId = '') {
  const isPremium = String(modelId).includes('claude') || String(modelId).includes('pro')
  // Rates per 1M tokens
  const promptRate = isPremium ? 3.0 : 0.15
  const completionRate = isPremium ? 15.0 : 0.60
  const reasoningRate = isPremium ? 15.0 : 0.60

  const pTok = Number(tokens?.promptTokens || tokens?.inputTokens || 0)
  const cTok = Number(tokens?.completionTokens || tokens?.outputTokens || 0)
  const rTok = Number(tokens?.reasoningTokens || 0)

  const cost = (pTok * promptRate + cTok * completionRate + rTok * reasoningRate) / 1000000
  return { cost, pTok, cTok, rTok, total: pTok + cTok + rTok }
}

function ComposerCostDock(props) {
  const t = props?.t || makeT(en, en)
  const [stats, setStats] = React.useState(null)
  const [showPopover, setShowPopover] = React.useState(false)

  // Use projection hook if passed by DSH composer dock, or poll session stats
  const projectedTokens = typeof props?.useProjection === 'function' ? props.useProjection('tokenUsage') : null
  const projectedModel = typeof props?.useProjection === 'function' ? props.useProjection('modelSelection') : null

  React.useEffect(() => {
    if (projectedTokens) return
    let active = true
    const loadStats = async () => {
      try {
        const res = await fetchWithTimeout(`${ROUTE_PREFIX}/stats`, { cache: 'no-store' })
        if (!res.ok) return
        const data = await res.json().catch(() => null)
        if (active && data?.stats?.summary) {
          setStats(data.stats.summary)
        }
      } catch {
        // quiet
      }
    }
    loadStats()
    const timer = setTimeout(loadStats, 30000)
    return () => { active = false; clearTimeout(timer) }
  }, [projectedTokens])

  const tokens = projectedTokens || {
    promptTokens: stats?.promptTokens || 0,
    completionTokens: stats?.completionTokens || 0,
    reasoningTokens: stats?.reasoningTokens || 0,
  }

  const modelId = projectedModel?.id || ''
  const { cost, pTok, cTok, rTok, total } = calculateCost(tokens, modelId)

  if (total === 0 && !stats) {
    return null
  }

  const costDisplay = cost < 0.001 && cost > 0 ? '< $0.001' : `$${cost.toFixed(3)}`

  return React.createElement(
    'div',
    {
      className: 'cb-composer-cost-dock',
      'data-composer-session-cost': 'true',
      style: { position: 'relative', display: 'inline-flex', alignItems: 'center' },
    },
    React.createElement(
      'button',
      {
        type: 'button',
        className: 'cb-btn',
        style: {
          padding: '2px 8px',
          fontSize: '11px',
          height: '24px',
          borderRadius: '999px',
          display: 'inline-flex',
          alignItems: 'center',
          gap: '4px',
          color: 'var(--dsw-alias-label-secondary)',
          background: 'var(--dsw-alias-bg-layer-2)',
          border: '1px solid var(--dsw-alias-border-l2)',
          cursor: 'pointer',
        },
        title: `${t('composer.cost_title')}: ${costDisplay} (${formatTokens(total)} tokens)`,
        onClick: () => setShowPopover(!showPopover),
      },
      React.createElement('span', { style: { fontSize: '12px' } }, '🪙'),
      React.createElement('span', { style: { fontWeight: 600, color: 'var(--dsw-alias-label-primary)' } }, `≈ ${costDisplay}`),
      React.createElement('span', { style: { opacity: 0.7 } }, `· ${formatTokens(total)} tok`)
    ),
    showPopover
      ? React.createElement(
          'div',
          {
            className: 'cb-popover',
            style: {
              position: 'absolute',
              bottom: '100%',
              left: 0,
              marginBottom: '6px',
              minWidth: '200px',
              padding: '10px 12px',
              background: 'var(--dsw-alias-bg-layer-3)',
              border: '1px solid var(--dsw-alias-border-l2)',
              borderRadius: '8px',
              boxShadow: 'var(--dsw-elevation-prominent)',
              zIndex: 100,
              fontSize: '12px',
              color: 'var(--dsw-alias-label-primary)',
              display: 'flex',
              flexDirection: 'column',
              gap: '6px',
            },
          },
          React.createElement(
            'div',
            { style: { fontWeight: 600, borderBottom: '1px solid var(--dsw-alias-border-l2)', paddingBottom: '4px' } },
            t('composer.cost_breakdown')
          ),
          React.createElement(
            'div',
            { style: { display: 'flex', justifyContent: 'space-between' } },
            React.createElement('span', { style: { color: 'var(--dsw-alias-label-secondary)' } }, t('composer.prompt_tok')),
            React.createElement('span', { style: { fontVariantNumeric: 'tabular-nums' } }, formatTokens(pTok))
          ),
          React.createElement(
            'div',
            { style: { display: 'flex', justifyContent: 'space-between' } },
            React.createElement('span', { style: { color: 'var(--dsw-alias-label-secondary)' } }, t('composer.completion_tok')),
            React.createElement('span', { style: { fontVariantNumeric: 'tabular-nums' } }, formatTokens(cTok))
          ),
          rTok > 0
            ? React.createElement(
                'div',
                { style: { display: 'flex', justifyContent: 'space-between' } },
                React.createElement('span', { style: { color: 'var(--dsw-alias-label-secondary)' } }, t('composer.reasoning_tok')),
                React.createElement('span', { style: { fontVariantNumeric: 'tabular-nums' } }, formatTokens(rTok))
              )
            : null,
          React.createElement(
            'div',
            { style: { display: 'flex', justifyContent: 'space-between', borderTop: '1px solid var(--dsw-alias-border-l2)', paddingTop: '4px', fontWeight: 600 } },
            React.createElement('span', null, t('composer.est_cost')),
            React.createElement('span', { style: { color: 'var(--dsw-alias-brand-primary)' } }, `≈ ${costDisplay}`)
          )
        )
      : null
  )
}
