/**
 * Session Router & Least-Used Sticky Balancing (Issue #128)
 *
 * Implements sticky session pinning with least-used quota routing:
 * 1. An account with the highest available quota (lowest percentUsed) is selected on session start.
 * 2. The account is pinned to the session for all subsequent requests in that session.
 * 3. Mid-session failover occurs strictly if the pinned account encounters HTTP 429 or quota depletion.
 * 4. Automatic cooldown recovery restores accounts once their rate-limit / reset timestamp has elapsed.
 */

// In-memory sessions: sessionId -> { accountId, assignedAt, lastUsedAt }
const sessions = new Map()

// In-memory cooldowns: accountId -> { until: timestamp, reason: string }
const cooldowns = new Map()

// Optional best-effort sink for account health/rotation history.
let accountEventSink = null

export function setAccountEventSink(sink) {
  accountEventSink = typeof sink === 'function' ? sink : null
}

function emitAccountEvent(event) {
  if (!accountEventSink) return
  try {
    accountEventSink({ ...event, at: Date.now() })
  } catch {
    /* history must never break routing */
  }
}

function accountIdOf(account) {
  return account?.apiKeyEnv || account?.id || ''
}

export const MAX_SESSIONS = 1000
export const SESSION_TTL_MS = 24 * 60 * 60 * 1000 // 24 hours

/**
 * Evict expired sessions and trim capacity to maxLimit via LRU.
 *
 * @param {number} [now=Date.now()] Current timestamp
 * @param {number} [maxLimit=MAX_SESSIONS] Capacity threshold
 * @param {number} [ttlMs=SESSION_TTL_MS] Expiration TTL
 */
export function pruneSessions(now = Date.now(), maxLimit = MAX_SESSIONS, ttlMs = SESSION_TTL_MS) {
  for (const [id, s] of sessions.entries()) {
    if (now - s.lastUsedAt > ttlMs) {
      sessions.delete(id)
    }
  }

  while (sessions.size > maxLimit) {
    let oldestId = null
    let oldestTime = Infinity
    for (const [id, s] of sessions.entries()) {
      if (s.lastUsedAt < oldestTime) {
        oldestTime = s.lastUsedAt
        oldestId = id
      }
    }
    if (oldestId) {
      sessions.delete(oldestId)
    } else {
      break
    }
  }
}

/**
 * Check if an account is currently in cooldown or rate-limited.
 * Performs automatic recovery if the cooldown duration has passed.
 *
 * @param {string} accountId
 * @param {string} [modelId] Optional model scope
 * @returns {boolean} true if account is currently blocked
 */
function readCooldown(key, accountId) {
  const entry = cooldowns.get(key)
  if (!entry) return false
  if (Date.now() >= entry.until) {
    cooldowns.delete(key)
    emitAccountEvent({ type: 'recover', accountId, reason: entry.reason })
    return false
  }
  return true
}

export function isAccountInCooldown(accountId, modelId = '') {
  if (!accountId) return false
  if (readCooldown(accountId, accountId)) return true
  return Boolean(modelId && readCooldown(`${accountId}::${modelId}`, accountId))
}

/**
 * Mark an account as in cooldown (rate-limited or quota exhausted).
 *
 * @param {string} accountId
 * @param {number} [durationMs=60000] Default 60s cooldown if resetsAt is not provided
 * @param {string|number|null} [resetsAt] ISO string or timestamp of quota window reset
 * @param {string} [reason='rate_limit']
 * @param {string} [modelId] Optional model scope
 */
export function markAccountCooldown(accountId, durationMs = 60000, resetsAt = null, reason = 'rate_limit', modelId = '') {
  if (!accountId) return

  let until = Date.now() + durationMs

  if (resetsAt) {
    const resetTime = typeof resetsAt === 'number' ? resetsAt : new Date(resetsAt).getTime()
    if (!Number.isNaN(resetTime) && resetTime > Date.now()) {
      until = resetTime
    }
  }

  const key = modelId ? `${accountId}::${modelId}` : accountId
  cooldowns.set(key, { until, reason, accountId, ...(modelId ? { modelId } : {}) })
  emitAccountEvent({ type: 'cooldown', accountId, reason, until, ...(modelId ? { modelId } : {}) })
}

export function matchesAccount(acc, identifier) {
  if (!acc || !identifier) return false
  return acc.id === identifier || acc.apiKeyEnv === identifier || acc.label === identifier
}

export function isAccountBlocked(acc, modelId = '') {
  if (!acc) return false
  return Boolean(
    (acc.id && isAccountInCooldown(acc.id, modelId)) ||
    (acc.apiKeyEnv && isAccountInCooldown(acc.apiKeyEnv, modelId)) ||
    (acc.label && isAccountInCooldown(acc.label, modelId))
  )
}

/**
 * Select the best account from the pool based on least-used quota.
 * Lowest percentUsed is prioritized.
 *
 * @param {Array<Object>} accounts Pool of accounts
 * @returns {Object|null} Selected account or null
 */
export function getAccountUsageMetric(acc) {
  if (typeof acc?.percentUsed === 'number') {
    return acc.percentUsed
  }
  // Unknown quota is treated as 50% neutral midpoint rather than assuming 0% completely free
  return 50
}

let roundRobinCursor = 0

export function getNextRoundRobinAccount(accounts = [], modelId = '') {
  if (!Array.isArray(accounts) || accounts.length === 0) {
    return null
  }
  const available = accounts.filter(acc => acc && acc.present !== false && !isAccountBlocked(acc, modelId))
  const pool = available.length > 0 ? available : accounts.filter(acc => acc && acc.present !== false)
  if (pool.length === 0) {
    return accounts[0] || null
  }
  const chosen = pool[Math.abs(roundRobinCursor) % pool.length]
  roundRobinCursor = (roundRobinCursor + 1) % pool.length
  return chosen
}

export function selectLeastUsedAccount(accounts = [], modelId = '') {
  if (!Array.isArray(accounts) || accounts.length === 0) {
    return null
  }

  // Filter available accounts that have keys present and are not in cooldown
  const available = accounts.filter(acc => {
    if (!acc || acc.present === false) return false
    return !isAccountBlocked(acc, modelId)
  })

  const candidatePool = available.length > 0 ? available : accounts.filter(a => a && a.present !== false)
  if (candidatePool.length === 0) {
    return accounts[0] || null
  }

  // Sort by lowest percentUsed (least used). Unknown quota is treated as neutral 50%
  const sorted = [...candidatePool].sort((a, b) => {
    const aUsed = getAccountUsageMetric(a)
    const bUsed = getAccountUsageMetric(b)
    return aUsed - bUsed
  })

  return sorted[0]
}

/**
 * Resolve or assign an account for a given session.
 *
 * @param {string|null} sessionId Unique session or conversation identifier
 * @param {Array<Object>} accounts Configured accounts pool
 * @param {string} [defaultActiveId] Explicit active account ID, envName or 'auto'
 * @returns {{ account: Object|null, isReassigned: boolean, reason: string }}
 */
/**
 * Match a model ID against modelRoutes map (supports exact match or prefix without cline-pass/).
 *
 * @param {string} [modelId] Target model ID
 * @param {Object} [modelRoutes] Model routing table
 * @param {Array<Object>} [safeAccounts] Available accounts
 * @returns {Object|null}
 */
export function resolveModelRouteAccount(modelId, modelRoutes = {}, safeAccounts = []) {
  if (!modelId || !modelRoutes || typeof modelRoutes !== 'object' || !Array.isArray(safeAccounts)) {
    return null
  }
  const cleanId = String(modelId).trim()
  const shortId = cleanId.replace(/^cline-pass\//, '')
  const targetKey = modelRoutes[cleanId] || modelRoutes[shortId] || null
  if (!targetKey) return null

  const targetAcc = safeAccounts.find((a) => matchesAccount(a, targetKey))
  if (targetAcc && !isAccountBlocked(targetAcc, modelId)) {
    return targetAcc
  }
  return null
}

export function resolveSessionAccount(sessionId, accounts = [], defaultActiveId = '', accountMode = 'least_used', model = '', modelRoutes = {}) {
  const safeAccounts = Array.isArray(accounts) ? accounts.filter(a => a && a.present !== false) : []
  if (safeAccounts.length === 0) {
    const fallback = Array.isArray(accounts) && accounts.length > 0 ? accounts[0] : null
    return { account: fallback, isReassigned: false, reason: 'empty_pool' }
  }

  // Determine explicit pin / active account policy
  const isAutoMode = defaultActiveId === 'auto'
  let pinnedAccount = null
  if (!isAutoMode) {
    if (defaultActiveId) {
      pinnedAccount = safeAccounts.find(a => matchesAccount(a, defaultActiveId)) || null
    }
    if (!pinnedAccount) {
      pinnedAccount = safeAccounts.find(a => a.isPinned) || null
    }
  }

  const pinnedAvailable = pinnedAccount && !isAccountBlocked(pinnedAccount, model) ? pinnedAccount : null

  const routedAccount = resolveModelRouteAccount(model, modelRoutes, safeAccounts)

  const pickCandidate = () => {
    if (routedAccount) {
      return routedAccount
    }
    if (accountMode === 'round_robin') {
      return getNextRoundRobinAccount(safeAccounts, model) || safeAccounts[0]
    }
    return selectLeastUsedAccount(safeAccounts, model) || safeAccounts[0]
  }

  // If no sessionId provided:
  if (!sessionId) {
    if (pinnedAvailable) {
      return { account: pinnedAvailable, isReassigned: false, reason: 'pinned_active' }
    }
    const chosen = pickCandidate()
    const noSessReason = routedAccount
      ? 'model_route'
      : (pinnedAccount ? 'pinned_in_cooldown_fallback' : (accountMode === 'round_robin' ? 'round_robin_ad_hoc' : 'no_session_id'))
    return {
      account: chosen,
      isReassigned: false,
      reason: noSessReason
    }
  }

  const now = Date.now()
  let existing = sessions.get(sessionId)

  if (existing) {
    // Check TTL
    if (now - existing.lastUsedAt > SESSION_TTL_MS) {
      sessions.delete(sessionId)
      existing = null
    }
  }

  // Prune if needed before allocating a new session entry (#183)
  if (!existing && sessions.size >= MAX_SESSIONS) {
    pruneSessions(now, MAX_SESSIONS - 1, SESSION_TTL_MS)
  }

  // If manual pin is configured and available:
  if (pinnedAvailable) {
    const reassigned = Boolean(existing && !matchesAccount(pinnedAvailable, existing.accountId))
    sessions.set(sessionId, {
      accountId: pinnedAvailable.apiKeyEnv || pinnedAvailable.id,
      assignedAt: existing ? existing.assignedAt : now,
      lastUsedAt: now
    })
    if (!existing || reassigned) {
      emitAccountEvent({
        type: 'route',
        accountId: accountIdOf(pinnedAvailable),
        reason: reassigned ? 'pinned_override' : 'pinned_active',
        sessionId,
      })
    }
    return {
      account: pinnedAvailable,
      isReassigned: reassigned,
      reason: reassigned ? 'pinned_override' : (existing ? 'sticky_pinned' : 'pinned_active')
    }
  }

  // If model route is specified and available, enforce routed account:
  if (routedAccount) {
    const reassigned = Boolean(existing && !matchesAccount(routedAccount, existing.accountId))
    sessions.set(sessionId, {
      accountId: routedAccount.apiKeyEnv || routedAccount.id,
      assignedAt: existing ? existing.assignedAt : now,
      lastUsedAt: now
    })
    if (!existing || reassigned) {
      emitAccountEvent({ type: 'route', accountId: accountIdOf(routedAccount), reason: 'model_route', sessionId })
    }
    return {
      account: routedAccount,
      isReassigned: reassigned,
      reason: 'model_route'
    }
  }

  // If in auto mode or pinned account is unavailable:
  if (existing) {
    const assigned = safeAccounts.find(a => matchesAccount(a, existing.accountId))
    if (assigned && !isAccountBlocked(assigned, model)) {
      existing.lastUsedAt = now
      return { account: assigned, isReassigned: false, reason: 'sticky_pinned' }
    }
    // Otherwise, failover is needed
  }

  // Pick candidate according to accountMode
  const chosen = pickCandidate()
  if (chosen) {
    sessions.set(sessionId, {
      accountId: chosen.apiKeyEnv || chosen.id,
      assignedAt: existing ? existing.assignedAt : now,
      lastUsedAt: now
    })
  }

  const reason = existing ? 'mid_session_failover' : (pinnedAccount ? 'pinned_in_cooldown_fallback' : (accountMode === 'round_robin' ? 'round_robin_assigned' : 'new_session_assigned'))
  if (chosen) emitAccountEvent({ type: 'route', accountId: accountIdOf(chosen), reason, sessionId })
  return {
    account: chosen,
    isReassigned: Boolean(existing),
    reason
  }
}

/**
 * Clear all sessions and cooldowns (for test environments).
 */
export function resetSessionRouter() {
  sessions.clear()
  cooldowns.clear()
  roundRobinCursor = 0
}

/**
 * Return current session router diagnostics.
 */
export function getSessionRouterStatus() {
  return {
    activeSessionsCount: sessions.size,
    maxSessions: MAX_SESSIONS,
    sessionTtlMs: SESSION_TTL_MS,
    roundRobinCursor,
    cooldownsCount: cooldowns.size,
    cooldowns: Object.fromEntries(
      Array.from(cooldowns.entries()).map(([k, v]) => [
        k,
        {
          remainingMs: Math.max(0, v.until - Date.now()),
          reason: v.reason
        }
      ])
    )
  }
}
