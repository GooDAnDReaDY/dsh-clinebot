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

/**
 * Check if an account is currently in cooldown or rate-limited.
 * Performs automatic recovery if the cooldown duration has passed.
 *
 * @param {string} accountId
 * @returns {boolean} true if account is currently blocked
 */
export function isAccountInCooldown(accountId) {
  if (!accountId) return false
  const entry = cooldowns.get(accountId)
  if (!entry) return false

  if (Date.now() >= entry.until) {
    cooldowns.delete(accountId)
    return false
  }
  return true
}

/**
 * Mark an account as in cooldown (rate-limited or quota exhausted).
 *
 * @param {string} accountId
 * @param {number} [durationMs=60000] Default 60s cooldown if resetsAt is not provided
 * @param {string|number|null} [resetsAt] ISO string or timestamp of quota window reset
 * @param {string} [reason='rate_limit']
 */
export function markAccountCooldown(accountId, durationMs = 60000, resetsAt = null, reason = 'rate_limit') {
  if (!accountId) return

  let until = Date.now() + durationMs

  if (resetsAt) {
    const resetTime = typeof resetsAt === 'number' ? resetsAt : new Date(resetsAt).getTime()
    if (!Number.isNaN(resetTime) && resetTime > Date.now()) {
      until = resetTime
    }
  }

  cooldowns.set(accountId, { until, reason })
}

/**
 * Clear cooldown for an account manually.
 *
 * @param {string} accountId
 */
export function clearAccountCooldown(accountId) {
  if (accountId) {
    cooldowns.delete(accountId)
  }
}

/**
 * Select the best account from the pool based on least-used quota.
 * Lowest percentUsed is prioritized.
 *
 * @param {Array<Object>} accounts Pool of accounts
 * @returns {Object|null} Selected account or null
 */
export function selectLeastUsedAccount(accounts = []) {
  if (!Array.isArray(accounts) || accounts.length === 0) {
    return null
  }

  // Filter available accounts that have keys present and are not in cooldown
  const available = accounts.filter(acc => {
    if (!acc || acc.present === false) return false
    return !isAccountInCooldown(acc.id || acc.label)
  })

  const candidatePool = available.length > 0 ? available : accounts.filter(a => a && a.present !== false)
  if (candidatePool.length === 0) {
    return accounts[0] || null
  }

  // Sort by lowest percentUsed (least used). If percentUsed is null/undefined, treat as 0% used
  const sorted = [...candidatePool].sort((a, b) => {
    const aUsed = typeof a.percentUsed === 'number' ? a.percentUsed : 0
    const bUsed = typeof b.percentUsed === 'number' ? b.percentUsed : 0
    return aUsed - bUsed
  })

  return sorted[0]
}

/**
 * Resolve or assign an account for a given session.
 *
 * @param {string|null} sessionId Unique session or conversation identifier
 * @param {Array<Object>} accounts Configured accounts pool
 * @param {string} [defaultActiveId] Fallback active account ID
 * @returns {{ account: Object|null, isReassigned: boolean, reason: string }}
 */
export function resolveSessionAccount(sessionId, accounts = [], defaultActiveId = '') {
  const safeAccounts = Array.isArray(accounts) ? accounts : []
  if (safeAccounts.length === 0) {
    return { account: null, isReassigned: false, reason: 'empty_pool' }
  }

  // If no sessionId is provided, use least-used account or default active
  if (!sessionId) {
    const best = selectLeastUsedAccount(safeAccounts) || safeAccounts.find(a => a.id === defaultActiveId) || safeAccounts[0]
    return { account: best, isReassigned: false, reason: 'no_session_id' }
  }

  const existing = sessions.get(sessionId)
  if (existing) {
    const assigned = safeAccounts.find(a => (a.id || a.label) === existing.accountId)
    // If assigned account is still valid and NOT in cooldown, keep sticky pin
    if (assigned && !isAccountInCooldown(assigned.id || assigned.label)) {
      existing.lastUsedAt = Date.now()
      return { account: assigned, isReassigned: false, reason: 'sticky_pinned' }
    }
    // Failover: account was deleted or entered cooldown mid-session
  }

  // New session or mid-session failover: pick least-used account
  const chosen = selectLeastUsedAccount(safeAccounts) || safeAccounts.find(a => a.id === defaultActiveId) || safeAccounts[0]
  if (chosen) {
    const chosenId = chosen.id || chosen.label
    sessions.set(sessionId, {
      accountId: chosenId,
      assignedAt: existing ? existing.assignedAt : Date.now(),
      lastUsedAt: Date.now()
    })
  }

  return {
    account: chosen,
    isReassigned: Boolean(existing),
    reason: existing ? 'mid_session_failover' : 'new_session_assigned'
  }
}

/**
 * Explicitly release a session.
 *
 * @param {string} sessionId
 */
export function releaseSession(sessionId) {
  if (sessionId) {
    sessions.delete(sessionId)
  }
}

/**
 * Clear all sessions and cooldowns (for test environments).
 */
export function resetSessionRouter() {
  sessions.clear()
  cooldowns.clear()
}

/**
 * Return current session router diagnostics.
 */
export function getSessionRouterStatus() {
  return {
    activeSessionsCount: sessions.size,
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
