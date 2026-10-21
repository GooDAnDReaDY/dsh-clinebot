import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import {
  loadAccountEvents,
  recordAccountEvent,
  getAccountEvents,
  flushAccountEvents,
} from '../lib/account-events.js'

test('account-events: keeps newest events, persists them and reloads', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'clinebot-events-'))
  const file = path.join(dir, 'events.json')
  try {
    loadAccountEvents(file)
    recordAccountEvent({ type: 'cooldown', accountId: 'KEY_A', reason: 'rate_limit', until: Date.now() + 1000 })
    recordAccountEvent({ type: 'recover', accountId: 'KEY_A', reason: 'manual' })
    recordAccountEvent({ type: 'route', accountId: 'KEY_B', reason: 'new_session_assigned', sessionId: 's1' })
    assert.equal(recordAccountEvent({ type: 'unknown', accountId: 'KEY_A' }), null)

    const events = getAccountEvents(10)
    assert.equal(events.length, 3)
    assert.equal(events[0].type, 'route')
    assert.equal(events[2].type, 'cooldown')

    flushAccountEvents()
    const saved = JSON.parse(readFileSync(file, 'utf8'))
    assert.equal(saved.events.length, 3)

    loadAccountEvents(file)
    assert.equal(getAccountEvents(2).length, 2)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('account-events: ring buffer is capped at 200 entries', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'clinebot-events-cap-'))
  const file = path.join(dir, 'events.json')
  try {
    loadAccountEvents(file)
    for (let index = 0; index < 205; index += 1) {
      recordAccountEvent({ type: 'route', accountId: `KEY_${index}`, reason: 'test' })
    }
    const events = getAccountEvents(500)
    assert.equal(events.length, 200)
    assert.equal(events[0].accountId, 'KEY_204')
    assert.equal(events[199].accountId, 'KEY_5')
    flushAccountEvents()
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
