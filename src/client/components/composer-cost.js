function formatTokens(count) {
  const n = Number(count) || 0
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M'
  if (n >= 1000) return (n / 1000).toFixed(1) + 'k'
  return String(n)
}

function findPrice(modelId, prices) {
  if (!modelId || !Array.isArray(prices)) return null
  const exact = prices.find((entry) => entry && entry.id === modelId)
  if (exact) return exact
  return prices.find((entry) => entry && entry.id && (modelId === entry.id || modelId.endsWith(`/${entry.id}`) || modelId.includes(entry.id))) || null
}

function calculateCost(tokens, modelId, prices) {
  const pTok = Number(tokens?.promptTokens || tokens?.inputTokens || 0)
  const cTok = Number(tokens?.completionTokens || tokens?.outputTokens || 0)
  const rTok = Number(tokens?.reasoningTokens || 0)
  const cacheRead = Number(tokens?.cacheReadTokens || tokens?.cacheRead || 0)
  const cacheWrite = Number(tokens?.cacheWriteTokens || tokens?.cacheWrite || 0)
  const total = pTok + cTok + rTok
  const price = findPrice(modelId, prices)
  if (!price) return { cost: 0, priced: false, source: null, pTok, cTok, rTok, cacheRead, cacheWrite, total }
  const uncachedInput = Math.max(0, pTok - cacheRead - cacheWrite)
  const cost = (
    uncachedInput * Number(price.input || 0) +
    cTok * Number(price.output || 0) +
    cacheRead * Number(price.cacheRead || 0) +
    cacheWrite * Number(price.cacheWrite || 0)
  ) / 1000000
  return { cost, priced: true, source: price.source || 'estimate', pTok, cTok, rTok, cacheRead, cacheWrite, total }
}

const COST_ANCHOR = '[data-slot="conversation.composer.dock"]'
const STATS_ROOT = '[data-composer-stats]'
const STATS_USAGE = '[data-composer-stat="usage"]'
const STATS_ANY = '[data-composer-stat]'
const DIALOG_TRIGGER = 'button[aria-haspopup="dialog"]'
const MISSES_BEFORE_WARNING = 3

/**
 * Inject the session cost into the native token-usage pill instead of drawing a
 * second pill. The composer's `conversation.composer.dock` entry is still the
 * only way to read the session projection; the rendered node is a hidden anchor
 * the injection locates its own composer from.
 */
function ComposerCostDock(props) {
  if (typeof props?.useProjection !== 'function') return null
  return React.createElement(ComposerCostEntry, props)
}

function ComposerCostEntry(props) {
  const t = props?.t || makeT(en, en)
  const configSnapshot = useConfigFormsSnapshot(props?.ctx)
  const [stats, setStats] = React.useState(null)
  const [prices, setPrices] = React.useState([])
  const markerRef = React.useRef(null)

  const projectedTokens = props.useProjection('tokenUsage')
  const selection = props.useProjection('modelSelection')
  const priceOverridesKey = JSON.stringify(configSnapshot?.value?.priceOverrides || {})

  React.useEffect(() => {
    let active = true
    fetchWithTimeout(`${ROUTE_PREFIX}/prices`, { cache: 'no-store' })
      .then((response) => response.json())
      .then((data) => {
        if (active && data?.ok && Array.isArray(data.models)) setPrices(data.models)
      })
      .catch(() => {})
    return () => { active = false }
  }, [priceOverridesKey])

  React.useEffect(() => {
    if (projectedTokens) return undefined
    let active = true
    const loadStats = async () => {
      try {
        const res = await fetchWithTimeout(`${ROUTE_PREFIX}/stats`, { cache: 'no-store' })
        if (!res.ok) return
        const data = await res.json().catch(() => null)
        const totals = data?.stats?.totals || data?.stats?.summary || null
        if (active && totals) setStats(totals)
      } catch {
        /* quiet */
      }
    }
    loadStats()
    const timer = setTimeout(loadStats, 30000)
    return () => { active = false; clearTimeout(timer) }
  }, [projectedTokens])

  const selected = selection?.lastUsed
    ?? selection?.next
    ?? (selection?.provider || selection?.model ? selection : null)
  const provider = String(selected?.provider || '')
  const modelId = String(selected?.model || selected?.id || '')
  const isClineBot = (provider === '' || provider === 'clinebot' || provider === 'llm-clinebot')
    && (provider === 'clinebot' || provider === 'llm-clinebot' || modelId.startsWith('cline-pass/'))

  const rawTokens = projectedTokens || {
    promptTokens: stats?.promptTokens || 0,
    completionTokens: stats?.completionTokens || 0,
    reasoningTokens: stats?.reasoningTokens || 0,
    cacheReadTokens: stats?.cacheReadTokens || 0,
    cacheWriteTokens: stats?.cacheWriteTokens || 0,
  }
  const cacheRead = Number(rawTokens.cacheReadTokens || 0)
  const cacheWrite = Number(rawTokens.cacheWriteTokens || 0)
  const uncachedInput = Number(rawTokens.uncachedInputTokens)
  const promptTokens = Number.isFinite(uncachedInput)
    ? uncachedInput + cacheRead + cacheWrite
    : Number(rawTokens.promptTokens || rawTokens.inputTokens || 0)
  const tokens = {
    promptTokens,
    completionTokens: Number(rawTokens.completionTokens || rawTokens.outputTokens || 0),
    reasoningTokens: Number(rawTokens.reasoningTokens || 0),
    cacheReadTokens: cacheRead,
    cacheWriteTokens: cacheWrite,
  }
  const { cost, priced, source, pTok, cTok, rTok, total } = calculateCost(tokens, modelId, prices)

  const costValue = priced ? (cost < 0.0001 && cost > 0 ? '< $0.0001' : `$${cost.toFixed(4)}`) : t('composer.unpriced')
  const costDisplay = priced && source === 'estimate' ? `≈ ${costValue}` : costValue
  const title = [
    `${t('composer.cost_title')} ${costDisplay}`,
    `${t('composer.prompt_tok')} ${formatTokens(pTok)}`,
    `${t('composer.completion_tok')} ${formatTokens(cTok)}`,
    ...(rTok > 0 ? [`${t('composer.reasoning_tok')} ${formatTokens(rTok)}`] : []),
    ...(cacheRead > 0 ? [`${t('composer.cache_read')} ${formatTokens(cacheRead)}`] : []),
    ...(cacheWrite > 0 ? [`${t('composer.cache_write')} ${formatTokens(cacheWrite)}`] : []),
    ...(priced ? [`${t('composer.price_source')} ${source === 'override' ? t('composer.price_override') : t('composer.price_estimate')}`] : []),
  ].join(' · ')
  const inject = isClineBot && priced && total > 0

  React.useEffect(() => {
    if (!inject || typeof document === 'undefined') return undefined
    const marker = markerRef.current
    if (!marker) return undefined
    const scope = marker.closest(COST_ANCHOR)
    if (!scope) return undefined

    let host = null
    let root = null
    let valueNode = null
    let misses = 0

    const apply = () => {
      if (!root || root.parentNode === null) {
        const usageAnchor = scope.querySelector(STATS_USAGE) || scope.querySelector(STATS_ANY)
        const statsRoot = usageAnchor || scope.querySelector(STATS_ROOT) || scope
        const triggers = statsRoot.querySelectorAll(DIALOG_TRIGGER)
        const button = triggers[triggers.length - 1] || usageAnchor
        if (!button) {
          misses += 1
          if (misses === MISSES_BEFORE_WARNING) {
            console.warn('[dsh-clinebot] no native token-usage pill found for the session cost')
          }
          return
        }
        misses = 0
        host = button
        root = document.createElement('span')
        root.setAttribute('data-clinebot-session-cost', '')
        root.style.display = 'inline-flex'
        root.style.alignItems = 'center'
        const separator = document.createElement('span')
        separator.textContent = '·'
        separator.setAttribute('aria-hidden', 'true')
        separator.style.color = 'var(--dsw-alias-separator-primary)'
        separator.style.margin = '0 6px 0 0'
        valueNode = document.createElement('span')
        valueNode.style.fontWeight = '500'
        root.appendChild(separator)
        root.appendChild(valueNode)
        button.appendChild(root)
      }
      if (root.parentNode !== host) host.appendChild(root)
      if (valueNode.textContent !== costDisplay) valueNode.textContent = costDisplay
      if (root.title !== title) root.title = title
    }

    apply()
    const observer = typeof window !== 'undefined' && typeof window.MutationObserver === 'function'
      ? new window.MutationObserver(apply)
      : null
    observer?.observe(document.body, { childList: true })
    let timer = null
    const tick = () => {
      apply()
      timer = setTimeout(tick, 2000)
    }
    timer = setTimeout(tick, 2000)
    return () => {
      observer?.disconnect()
      if (timer) clearTimeout(timer)
      if (root?.parentNode) root.parentNode.removeChild(root)
    }
  }, [inject, costDisplay, title])

  if (configSnapshot?.value?.showComposerCost === false) return null
  if (total === 0 && !stats) return null
  if (!inject) return null
  return React.createElement('span', {
    ref: markerRef,
    style: { display: 'none' },
    'data-clinebot-cost-anchor': '',
  })
}
