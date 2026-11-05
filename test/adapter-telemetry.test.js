import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { recordAttemptTelemetry } from '../lib/adapter-telemetry.js'
import { flushStats } from '../lib/stats-storage.js'

test('adapter-telemetry: unsafe statsPath is ignored (#288)', () => {
  const outside = path.join(os.tmpdir(), `clinebot-unsafe-stats-${process.pid}-${Date.now()}.json`)
  try {
    recordAttemptTelemetry({
      pub: { statsPath: outside, priceOverrides: {} },
      accountId: 'CLINEBOT_API_KEY',
      model: 'test-model',
      usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
      isError: false,
      ttftMs: 1,
      latencyMs: 1,
      options: {},
    })
    flushStats()
    assert.equal(fs.existsSync(outside), false)
  } finally {
    try { fs.rmSync(outside, { force: true }) } catch {}
  }
})
