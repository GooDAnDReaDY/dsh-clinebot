import fs from 'node:fs'
import test from 'node:test'
import assert from 'node:assert/strict'
import { rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { tmpdir, homedir } from 'node:os'
import {
  recordUsage,
  loadStats,
  saveStatsSync,
  flushStats,
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

test('stats-storage: handles corrupted file gracefully and preserves backup for diagnostics (#158)', () => {
  const corruptPath = path.join(tmpdir(), `corrupt-stats-${Date.now()}.json`)
  writeFileSync(corruptPath, '{ broken json content...', 'utf8')

  const recovered = loadStats(corruptPath)
  assert.equal(recovered.totals.requests, 0)
  assert.equal(recovered.totals.totalTokens, 0)

  // Verify backup exists for diagnostics
  const tmpFiles = fs.readdirSync(tmpdir())
  const backupName = path.basename(corruptPath) + '.corrupt.'
  const foundBackup = tmpFiles.find((f) => f.startsWith(backupName))
  assert.ok(foundBackup, `Corrupted stats file must create diagnostic backup matching ${backupName}*`)

  try { rmSync(corruptPath, { force: true }) } catch {}
  if (foundBackup) {
    try { rmSync(path.join(tmpdir(), foundBackup), { force: true }) } catch {}
  }
  try { rmSync(testStatsPath, { force: true }) } catch {}
})

test('stats-storage: flushStats synchronously flushes queued writes (#158)', () => {
  const flushPath = path.join(tmpdir(), `flush-stats-${Date.now()}.json`)
  resetStats(flushPath)

  recordUsage({
    model: 'cline-pass/deepseek-v4-flash',
    accountId: 'acc-flush',
    promptTokens: 10,
    completionTokens: 20,
    totalTokens: 30,
    statsPath: flushPath,
  })

  // Flush immediately without waiting for 500ms debounce
  flushStats(flushPath)

  const diskContent = JSON.parse(fs.readFileSync(flushPath, 'utf8'))
  assert.equal(diskContent.totals.requests, 1)
  assert.equal(diskContent.totals.totalTokens, 30)

  try { rmSync(flushPath, { force: true }) } catch {}
})

test('stats-storage: apply() cold start loads existing stats and preserves history on next request (#158)', async () => {
  const { apply } = await import('../lib/index.js')
  const coldStatsPath = path.join(tmpdir(), `cold-stats-${Date.now()}.json`)

  // Pre-seed disk with 50 previous requests
  const seedStats = {
    ...createEmptyStats(),
    totals: {
      requests: 50,
      successful: 48,
      failed: 2,
      rateLimited429: 1,
      promptTokens: 5000,
      completionTokens: 5000,
      totalTokens: 10000,
    },
    byModel: { 'cline-pass/deepseek-v4-flash': { requests: 50, promptTokens: 5000, completionTokens: 5000, totalTokens: 10000 } },
    byAccount: { 'default': { requests: 50, promptTokens: 5000, completionTokens: 5000, totalTokens: 10000 } },
  }
  fs.writeFileSync(coldStatsPath, JSON.stringify(seedStats, null, 2), 'utf8')

  let effectDispose = null
  const registeredRoutes = {}
  const mockCtx = {
    get: () => null,
    webServer: {
      register: (r) => {
        registeredRoutes[r.path] = r.handler
        return () => {}
      },
    },
    effect: (fn) => {
      const cleanup = fn()
      if (typeof cleanup === 'function') effectDispose = cleanup
      return () => {}
    },
  }

  // 1. Boot plugin on cold start
  apply(mockCtx, { enabled: true, statsPath: coldStatsPath })

  // Verify memory has 50 requests right after apply()
  const summaryAfterBoot = getStatsSummary()
  assert.equal(summaryAfterBoot.totals.requests, 50, `apply() must load pre-existing stats on startup`)

  // 2. Record new usage event (51st request)
  recordUsage({
    model: 'cline-pass/deepseek-v4-flash',
    accountId: 'default',
    promptTokens: 100,
    completionTokens: 50,
    totalTokens: 150,
    statsPath: coldStatsPath,
  })

  // Flush to disk
  flushStats(coldStatsPath)

  // Verify 51 requests on disk (not wiped to 1!)
  const diskAfterFlush = JSON.parse(fs.readFileSync(coldStatsPath, 'utf8'))
  assert.equal(diskAfterFlush.totals.requests, 51, `Stats must increment to 51, not wipe to 1`)
  assert.equal(diskAfterFlush.totals.totalTokens, 10150)
  assert.equal(diskAfterFlush.byModel['cline-pass/deepseek-v4-flash'].requests, 51)

  // 3. Test disposal flush effect
  if (typeof effectDispose === 'function') {
    effectDispose()
  }

  try { rmSync(coldStatsPath, { force: true }) } catch {}
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
