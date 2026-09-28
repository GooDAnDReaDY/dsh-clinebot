import test from 'node:test'
import assert from 'node:assert/strict'
import { rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { tmpdir, homedir } from 'node:os'
import {
  recordUsage,
  loadStats,
  saveStatsSync,
  getStatsSummary,
  resetStats,
  createEmptyStats,
  resolvePath
} from '../lib/stats-storage.js'
import { resolvePathWithHome } from '../lib/provider-sync.js'

const testStatsPath = path.join(tmpdir(), `clinebot-test-stats-${Date.now()}.json`)

test('stats-storage: recordUsage updates totals and dimensions', () => {
  resetStats(testStatsPath)

  recordUsage({
    model: 'cline-pass/deepseek-v4-flash',
    accountId: 'acc1',
    promptTokens: 120,
    completionTokens: 80,
    totalTokens: 200,
    statsPath: testStatsPath
  })

  recordUsage({
    model: 'cline-pass/kimi-k3',
    accountId: 'acc2',
    promptTokens: 300,
    completionTokens: 150,
    totalTokens: 450,
    is429: true,
    isError: true,
    statsPath: testStatsPath
  })

  saveStatsSync(testStatsPath)

  const summary = getStatsSummary()
  assert.equal(summary.totals.requests, 2)
  assert.equal(summary.totals.successful, 1)
  assert.equal(summary.totals.failed, 1)
  assert.equal(summary.totals.rateLimited429, 1)
  assert.equal(summary.totals.promptTokens, 420)
  assert.equal(summary.totals.completionTokens, 230)
  assert.equal(summary.totals.totalTokens, 650)

  // Dimension checks
  assert.ok(summary.byModel['cline-pass/deepseek-v4-flash'])
  assert.equal(summary.byModel['cline-pass/deepseek-v4-flash'].requests, 1)
  assert.equal(summary.byModel['cline-pass/deepseek-v4-flash'].totalTokens, 200)

  assert.ok(summary.byModel['cline-pass/kimi-k3'])
  assert.equal(summary.byModel['cline-pass/kimi-k3'].requests, 1)
  assert.equal(summary.byModel['cline-pass/kimi-k3'].totalTokens, 450)

  assert.ok(summary.byAccount.acc1)
  assert.equal(summary.byAccount.acc1.totalTokens, 200)

  assert.ok(summary.byAccount.acc2)
  assert.equal(summary.byAccount.acc2.totalTokens, 450)
})

test('stats-storage: loadStats recovers persisted JSON across restarts', () => {
  const loaded = loadStats(testStatsPath)
  assert.equal(loaded.totals.requests, 2)
  assert.equal(loaded.totals.totalTokens, 650)
})

test('stats-storage: handles corrupted file gracefully', () => {
  const corruptPath = path.join(tmpdir(), `corrupt-stats-${Date.now()}.json`)
  writeFileSync(corruptPath, '{ broken json content...', 'utf8')

  const recovered = loadStats(corruptPath)
  assert.equal(recovered.totals.requests, 0)
  assert.equal(recovered.totals.totalTokens, 0)

  try { rmSync(corruptPath, { force: true }) } catch {}
  try { rmSync(testStatsPath, { force: true }) } catch {}
})


test('stats-storage: resolvePath unwraps volatile { get } references and functions (#141, GH #9)', () => {
  const defaultPath = path.join(homedir(), '.dsh', 'clinebot-stats.json')

  // 1. Plain string
  assert.equal(resolvePath('~/.dsh/my-stats.json'), path.join(homedir(), '.dsh', 'my-stats.json'))

  // 2. Volatile { get } object reference
  const volatileRef = { get: () => '~/.dsh/ref-stats.json' }
  assert.equal(resolvePath(volatileRef), path.join(homedir(), '.dsh', 'ref-stats.json'))

  // 3. Getter function
  const getterFn = () => '~/.dsh/fn-stats.json'
  assert.equal(resolvePath(getterFn), path.join(homedir(), '.dsh', 'fn-stats.json'))

  // 4. Nested getter
  const nestedRef = { get: () => ({ get: () => '~/.dsh/nested-stats.json' }) }
  assert.equal(resolvePath(nestedRef), path.join(homedir(), '.dsh', 'nested-stats.json'))

  // 5. Non-string inputs fallback safely without throwing
  assert.equal(resolvePath(null), defaultPath)
  assert.equal(resolvePath(undefined), defaultPath)
  assert.equal(resolvePath(12345), defaultPath)
  assert.equal(resolvePath({}), defaultPath)
  assert.equal(resolvePath(true), defaultPath)
})

test('stats-storage: recordUsage with volatile { get } statsPath persists without crashing (#141, GH #9)', () => {
  const targetFile = path.join(tmpdir(), `volatile-stats-${Date.now()}.json`)
  const volatileStatsPath = { get: () => targetFile }

  assert.doesNotThrow(() => {
    recordUsage({
      model: 'cline-pass/deepseek-v4-flash',
      accountId: 'acc-vol',
      promptTokens: 50,
      completionTokens: 50,
      totalTokens: 100,
      statsPath: volatileStatsPath
    })
    saveStatsSync(volatileStatsPath)
  })

  const loaded = loadStats(volatileStatsPath)
  assert.ok(loaded.totals.requests >= 1)
})

test('provider-sync: resolvePathWithHome unwraps volatile references safely (#143)', () => {
  const volatileCache = { get: () => '~/.dsh/models-cache.json' }
  const resolved = resolvePathWithHome(volatileCache)
  assert.equal(resolved, path.join(homedir(), '.dsh', 'models-cache.json'))

  const nonString = resolvePathWithHome(123)
  assert.equal(nonString, '')
})
