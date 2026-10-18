import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { loadStats, recordUsage, saveStatsSync, resolvePath } from '../lib/stats-storage.js'
import { resolvePathWithHome } from '../lib/provider-sync.js'

test('protective: tests must never touch or modify real ~/.dsh files (#146)', () => {
  const realHome = os.userInfo().homedir
  const realDshStats = path.join(realHome, '.dsh', 'clinebot-stats.json')
  const realDshCache = path.join(realHome, '.dsh', 'clinebot-models-cache.json')

  // Verify test sandbox environment is active
  assert.ok(process.env.HOME, 'process.env.HOME must be defined')
  assert.notEqual(process.env.HOME, realHome, 'process.env.HOME must point to an isolated sandbox, not real home')
  assert.ok(process.env.DSH_HOME, 'process.env.DSH_HOME must be defined')

  // Snapshot mtime of real files if they exist
  const getFileState = (filePath) => {
    try {
      if (fs.existsSync(filePath)) {
        const stat = fs.statSync(filePath)
        return { exists: true, mtimeMs: stat.mtimeMs, size: stat.size }
      }
    } catch {}
    return { exists: false }
  }

  const beforeStats = getFileState(realDshStats)
  const beforeCache = getFileState(realDshCache)

  // Execute storage resolution and write without passing custom path
  const defaultResolved = resolvePath()
  assert.ok(defaultResolved.startsWith(process.env.HOME) || defaultResolved.startsWith(process.env.DSH_HOME))
  assert.ok(!defaultResolved.startsWith(realHome), `defaultResolved (${defaultResolved}) must not point to real home (${realHome})`)

  const resolvedHomePath = resolvePathWithHome('~/.dsh/clinebot-models-cache.json')
  assert.ok(resolvedHomePath.startsWith(process.env.HOME))

  recordUsage({
    model: 'cline-pass/deepseek-v4-flash',
    promptTokens: 10,
    completionTokens: 10,
    totalTokens: 20
  })
  saveStatsSync()

  // Verify real ~/.dsh files were completely unaffected
  const afterStats = getFileState(realDshStats)
  const afterCache = getFileState(realDshCache)

  assert.deepEqual(afterStats, beforeStats, 'Real ~/.dsh/clinebot-stats.json must NOT be modified by tests')
  assert.deepEqual(afterCache, beforeCache, 'Real ~/.dsh/clinebot-models-cache.json must NOT be modified by tests')
})
