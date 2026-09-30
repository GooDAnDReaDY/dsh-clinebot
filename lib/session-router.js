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

export function matchesAccount(acc, identifier) {
  if (!acc || !identifier) return false
  return acc.id === identifier || acc.apiKeyEnv === identifier || acc.label === identifier
}

export function isAccountBlocked(acc) {
  if (!acc) return false
  return Boolean(
    (acc.id && isAccountInCooldown(acc.id)) ||
    (acc.apiKeyEnv && isAccountInCooldown(acc.apiKeyEnv)) ||
    (acc.label && isAccountInCooldown(acc.label))
  )
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
    return !isAccountBlocked(acc)
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
 * @param {string} [defaultActiveId] Explicit active account ID, envName or 'auto'
 * @returns {{ account: Object|null, isReassigned: boolean, reason: string }}
 */
export function resolveSessionAccount(sessionId, accounts = [], defaultActiveId = '') {
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

  const pinnedAvailable = pinnedAccount && !isAccountBlocked(pinnedAccount) ? pinnedAccount : null

  // If no sessionId provided:
  if (!sessionId) {
    if (pinnedAvailable) {
      return { account: pinnedAvailable, isReassigned: false, reason: 'pinned_active' }
    }
    const best = selectLeastUsedAccount(safeAccounts) || safeAccounts[0]
    return { account: best, isReassigned: false, reason: pinnedAccount ? 'pinned_in_cooldown_fallback' : 'no_session_id' }
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

  // If manual pin is configured and available:
  if (pinnedAvailable) {
    const reassigned = Boolean(existing && !matchesAccount(pinnedAvailable, existing.accountId))
    sessions.set(sessionId, {
      accountId: pinnedAvailable.apiKeyEnv || pinnedAvailable.id,
      assignedAt: existing ? existing.assignedAt : now,
      lastUsedAt: now
    })
    return {
      account: pinnedAvailable,
      isReassigned: reassigned,
      reason: reassigned ? 'pinned_override' : (existing ? 'sticky_pinned' : 'pinned_active')
    }
  }

  // If in auto mode or pinned account is unavailable:
  if (existing) {
    const assigned = safeAccounts.find(a => matchesAccount(a, existing.accountId))
    if (assigned && !isAccountBlocked(assigned)) {
      existing.lastUsedAt = now
      return { account: assigned, isReassigned: false, reason: 'sticky_pinned' }
    }
    // Otherwise, failover is needed
  }

  // Prune if needed
  if (!existing && sessions.size >= MAX_SESSIONS) {
    pruneSessions(now, MAX_SESSIONS - 1, SESSION_TTL_MS)
  }

  // Pick least-used available account
  const chosen = selectLeastUsedAccount(safeAccounts) || safeAccounts[0]
  if (chosen) {
    sessions.set(sessionId, {
      accountId: chosen.apiKeyEnv || chosen.id,
      assignedAt: existing ? existing.assignedAt : now,
      lastUsedAt: now
    })
  }

  return {
    account: chosen,
    isReassigned: Boolean(existing),
    reason: existing ? 'mid_session_failover' : (pinnedAccount ? 'pinned_in_cooldown_fallback' : 'new_session_assigned')
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
    maxSessions: MAX_SESSIONS,
    sessionTtlMs: SESSION_TTL_MS,
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
