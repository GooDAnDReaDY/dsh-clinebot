import test from 'node:test'
import assert from 'node:assert/strict'
import {
  selectLeastUsedAccount,
  resolveSessionAccount,
  markAccountCooldown,
  isAccountInCooldown,
  clearAccountCooldown,
  resetSessionRouter,
  releaseSession,
  pruneSessions,
  MAX_SESSIONS,
  SESSION_TTL_MS,
  getSessionRouterStatus,
  matchesAccount,
  isAccountBlocked,
  getAccountUsageMetric
} from '../lib/session-router.js'

test('session-router: selectLeastUsedAccount picks account with lowest percentUsed', () => {
  resetSessionRouter()
  const pool = [
    { id: 'acc1', label: 'Account 1', percentUsed: 80, present: true },
    { id: 'acc2', label: 'Account 2', percentUsed: 20, present: true },
    { id: 'acc3', label: 'Account 3', percentUsed: 50, present: true }
  ]

  const chosen = selectLeastUsedAccount(pool)
  assert.equal(chosen.id, 'acc2')
})

test('session-router: sticky session keeps same account pinned across calls', () => {
  resetSessionRouter()
  const pool = [
    { id: 'acc1', label: 'Account 1', percentUsed: 30, present: true },
    { id: 'acc2', label: 'Account 2', percentUsed: 70, present: true }
  ]

  const s1 = resolveSessionAccount('session-abc', pool)
  assert.equal(s1.account.id, 'acc1')
  assert.equal(s1.isReassigned, false)
  assert.equal(s1.reason, 'new_session_assigned')

  // Simulate pool usage changes (acc1 becomes more used than acc2)
  pool[0].percentUsed = 90
  pool[1].percentUsed = 40

  // Same session MUST remain pinned to acc1!
  const s2 = resolveSessionAccount('session-abc', pool)
  assert.equal(s2.account.id, 'acc1')
  assert.equal(s2.isReassigned, false)
  assert.equal(s2.reason, 'sticky_pinned')

  // A NEW session must pick acc2 (which is now least used)
  const s3 = resolveSessionAccount('session-xyz', pool)
  assert.equal(s3.account.id, 'acc2')
  assert.equal(s3.reason, 'new_session_assigned')
})

test('session-router: mid-session failover when pinned account hits cooldown', () => {
  resetSessionRouter()
  const pool = [
    { id: 'acc1', label: 'Account 1', percentUsed: 10, present: true },
    { id: 'acc2', label: 'Account 2', percentUsed: 50, present: true }
  ]

  const s1 = resolveSessionAccount('session-chat-1', pool)
  assert.equal(s1.account.id, 'acc1')

  // acc1 encounters 429
  markAccountCooldown('acc1', 60000, null, 'rate_limit_429')
  assert.equal(isAccountInCooldown('acc1'), true)

  // Next request in same session must failover to acc2
  const s2 = resolveSessionAccount('session-chat-1', pool)
  assert.equal(s2.account.id, 'acc2')
  assert.equal(s2.isReassigned, true)
  assert.equal(s2.reason, 'mid_session_failover')
})

test('session-router: automatic cooldown recovery after expiration', () => {
  resetSessionRouter()
  markAccountCooldown('acc-quick', 5, null, 'fast_recovery')
  assert.equal(isAccountInCooldown('acc-quick'), true)

  // Sleep slightly past 5ms
  return new Promise((resolve) => {
    setTimeout(() => {
      assert.equal(isAccountInCooldown('acc-quick'), false)
      resolve()
    }, 15)
  })
})

test('session-router: releaseSession removes session mapping', () => {
  resetSessionRouter()
  const pool = [{ id: 'acc1', percentUsed: 10, present: true }]
  resolveSessionAccount('temp-session', pool)
  releaseSession('temp-session')

  const res = resolveSessionAccount('temp-session', pool)
  assert.equal(res.reason, 'new_session_assigned')
})

test('session-router: LRU bounds and capacity eviction', () => {
  resetSessionRouter()
  const pool = [{ id: 'acc1', percentUsed: 10, present: true }]

  // Fill up to custom max limit 3
  const now = Date.now()
  for (let i = 1; i <= 3; i++) {
    resolveSessionAccount(`session-${i}`, pool)
  }

  const statusBefore = getSessionRouterStatus()
  assert.equal(statusBefore.activeSessionsCount, 3)

  // prune with maxLimit = 2
  pruneSessions(now, 2, SESSION_TTL_MS)
  const statusAfter = getSessionRouterStatus()
  assert.equal(statusAfter.activeSessionsCount, 2)
  assert.equal(statusAfter.maxSessions, MAX_SESSIONS)
})

test('session-router: TTL expiration removes stale sessions', () => {
  resetSessionRouter()
  const pool = [
    { id: 'acc1', percentUsed: 10, present: true },
    { id: 'acc2', percentUsed: 50, present: true }
  ]

  resolveSessionAccount('stale-session', pool)
  const status = getSessionRouterStatus()
  assert.equal(status.activeSessionsCount, 1)

  // Fast forward past SESSION_TTL_MS
  const future = Date.now() + SESSION_TTL_MS + 1000
  pruneSessions(future, MAX_SESSIONS, SESSION_TTL_MS)

  const statusAfter = getSessionRouterStatus()
  assert.equal(statusAfter.activeSessionsCount, 0)
})

test('session-router: matchesAccount helper correctly identifies accounts (\#161)', () => {
  const acc = { id: 'account-2', apiKeyEnv: 'CLINEBOT_API_KEY_B', label: 'Account B' }
  assert.equal(matchesAccount(acc, 'account-2'), true)
  assert.equal(matchesAccount(acc, 'CLINEBOT_API_KEY_B'), true)
  assert.equal(matchesAccount(acc, 'Account B'), true)
  assert.equal(matchesAccount(acc, 'other'), false)
  assert.equal(matchesAccount(null, 'account-2'), false)
})

test('session-router: manually pinned account overrides least-used selection (\#161)', () => {
  resetSessionRouter()
  const pool = [
    { id: 'default', apiKeyEnv: 'CLINEBOT_API_KEY', label: 'Default', percentUsed: 10, present: true, value: 'key-a' },
    { id: 'account-2', apiKeyEnv: 'CLINEBOT_API_KEY_B', label: 'Account B', percentUsed: 80, present: true, value: 'key-b' }
  ]

  // Even though Account A has lower percentUsed (10% vs 80%), activeAccount is pinned to B
  const s1 = resolveSessionAccount('sess-1', pool, 'CLINEBOT_API_KEY_B')
  assert.equal(s1.account.apiKeyEnv, 'CLINEBOT_API_KEY_B')
  assert.equal(s1.reason, 'pinned_active')
})

test('session-router: UI pin change dynamically overrides existing session assignment (\#161)', () => {
  resetSessionRouter()
  const pool = [
    { id: 'default', apiKeyEnv: 'CLINEBOT_API_KEY', label: 'Default', percentUsed: 20, present: true, value: 'key-a' },
    { id: 'account-2', apiKeyEnv: 'CLINEBOT_API_KEY_B', label: 'Account B', percentUsed: 30, present: true, value: 'key-b' }
  ]

  // Session started with Account A
  const s1 = resolveSessionAccount('sess-override', pool, 'CLINEBOT_API_KEY')
  assert.equal(s1.account.apiKeyEnv, 'CLINEBOT_API_KEY')

  // User subsequently switches activeAccount to B in UI
  const s2 = resolveSessionAccount('sess-override', pool, 'CLINEBOT_API_KEY_B')
  assert.equal(s2.account.apiKeyEnv, 'CLINEBOT_API_KEY_B')
  assert.equal(s2.isReassigned, true)
  assert.equal(s2.reason, 'pinned_override')

  // Subsequent request in same session stays on B
  const s3 = resolveSessionAccount('sess-override', pool, 'CLINEBOT_API_KEY_B')
  assert.equal(s3.account.apiKeyEnv, 'CLINEBOT_API_KEY_B')
  assert.equal(s3.isReassigned, false)
  assert.equal(s3.reason, 'sticky_pinned')
})

test('session-router: auto mode routes via least-used quota and maintains sticky session (\#161)', () => {
  resetSessionRouter()
  const pool = [
    { id: 'default', apiKeyEnv: 'CLINEBOT_API_KEY', percentUsed: 75, present: true, value: 'key-a' },
    { id: 'account-2', apiKeyEnv: 'CLINEBOT_API_KEY_B', percentUsed: 15, present: true, value: 'key-b' }
  ]

  // In auto mode, least-used B (15%) is selected
  const s1 = resolveSessionAccount('sess-auto', pool, 'auto')
  assert.equal(s1.account.apiKeyEnv, 'CLINEBOT_API_KEY_B')
  assert.equal(s1.reason, 'new_session_assigned')

  // Next call in auto mode maintains sticky session on B
  const s2 = resolveSessionAccount('sess-auto', pool, 'auto')
  assert.equal(s2.account.apiKeyEnv, 'CLINEBOT_API_KEY_B')
  assert.equal(s2.reason, 'sticky_pinned')
})

test('session-router: manually pinned account fails over to least-used when in cooldown (\#161)', () => {
  resetSessionRouter()
  const pool = [
    { id: 'default', apiKeyEnv: 'CLINEBOT_API_KEY', percentUsed: 20, present: true, value: 'key-a' },
    { id: 'account-2', apiKeyEnv: 'CLINEBOT_API_KEY_B', percentUsed: 10, present: true, value: 'key-b' }
  ]

  // Account B is pinned, but hits rate limit / 429
  markAccountCooldown('CLINEBOT_API_KEY_B', 60000, null, 'rate_limit_429')

  const s1 = resolveSessionAccount('sess-failover', pool, 'CLINEBOT_API_KEY_B')
  // Must fail over to Default Account A
  assert.equal(s1.account.apiKeyEnv, 'CLINEBOT_API_KEY')
  assert.equal(s1.reason, 'pinned_in_cooldown_fallback')
})

import { resolveAccountPool, getAccountQuotaSnapshot } from '../lib/account-pool.js'
import { usageCache, clearUsageCache } from '../lib/cline-client.js'

test('session-router & account-pool: real resolveAccountPool with usageCache selects least-used account (\#162)', async () => {
  clearUsageCache()
  resetSessionRouter()

  const keyA = 'key-alpha-12345678'
  const keyB = 'key-bravo-87654321'

  // Seed cache: A = 99% used, B = 1% used
  usageCache.set(`cline:usage:${keyA.slice(-8)}`, {
    timestamp: Date.now(),
    data: {
      windows: {
        fiveHour: { percentUsed: 99, resetsAt: new Date(Date.now() + 3600000).toISOString() },
        weekly: { percentUsed: 20 }
      }
    }
  })

  usageCache.set(`cline:usage:${keyB.slice(-8)}`, {
    timestamp: Date.now(),
    data: {
      windows: {
        fiveHour: { percentUsed: 1, resetsAt: new Date(Date.now() + 3600000).toISOString() },
        weekly: { percentUsed: 1 }
      }
    }
  })

  const ctxMock = {
    get: (svc) => {
      if (svc === 'credentials') {
        return {
          resolve: async (ref) => {
            const name = typeof ref === 'object' ? (ref._id || ref.id) : ref
            if (name === 'CLINEBOT_API_KEY') return { value: keyA }
            if (name === 'CLINEBOT_API_KEY_2') return { value: keyB }
            return null
          }
        }
      }
      return null
    }
  }

  const cfg = {
    apiKeyEnv: 'CLINEBOT_API_KEY',
    activeAccount: 'auto',
    accounts: [
      { id: 'account-2', apiKeyEnv: 'CLINEBOT_API_KEY_2', label: 'Account B' }
    ]
  }

  const pool = await resolveAccountPool(ctxMock, cfg)
  assert.equal(pool.length, 2)
  assert.equal(pool[0].percentUsed, 99)
  assert.equal(pool[1].percentUsed, 1)

  // In auto mode, router must choose Account B (1% used) instead of Account A (99% used)
  const result = resolveSessionAccount('session-test-quota', pool, 'auto')
  assert.equal(result.account.apiKeyEnv, 'CLINEBOT_API_KEY_2')
  assert.equal(result.account.percentUsed, 1)
})

test('session-router: getAccountUsageMetric distinguishes unknown quota from 0% (\#162)', () => {
  assert.equal(getAccountUsageMetric({ percentUsed: 0 }), 0)
  assert.equal(getAccountUsageMetric({ percentUsed: 80 }), 80)
  assert.equal(getAccountUsageMetric({ percentUsed: null }), 50)
  assert.equal(getAccountUsageMetric({ percentUsed: undefined }), 50)

  // Account with verified 10% is preferred over unknown (50%)
  const pool1 = [
    { id: 'unk', percentUsed: null, present: true },
    { id: 'known-low', percentUsed: 10, present: true }
  ]
  assert.equal(selectLeastUsedAccount(pool1).id, 'known-low')

  // Unknown (50%) is preferred over verified 90%
  const pool2 = [
    { id: 'known-high', percentUsed: 90, present: true },
    { id: 'unk', percentUsed: null, present: true }
  ]
  assert.equal(selectLeastUsedAccount(pool2).id, 'unk')
})

test('account-pool: getAccountQuotaSnapshot evaluates expired resetsAt as reset to 0% (\#162)', () => {
  clearUsageCache()
  const key = 'key-expired-99999999'
  // resetsAt was 10 seconds ago
  const expiredTime = new Date(Date.now() - 10000).toISOString()
  usageCache.set(`cline:usage:${key.slice(-8)}`, {
    timestamp: Date.now(),
    data: {
      windows: {
        fiveHour: { percentUsed: 98, resetsAt: expiredTime }
      }
    }
  })

  const snap = getAccountQuotaSnapshot(key)
  assert.equal(snap.fiveHour, 0)
  assert.equal(snap.percentUsed, 0)
})
