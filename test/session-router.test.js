import test from 'node:test'
import assert from 'node:assert/strict'
import {
  selectLeastUsedAccount,
  resolveSessionAccount,
  markAccountCooldown,
  isAccountInCooldown,
  clearAccountCooldown,
  resetSessionRouter,
  releaseSession
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
