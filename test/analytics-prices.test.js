import test from 'node:test'
import assert from 'node:assert/strict'
import { rmSync } from 'node:fs'
import path from 'node:path'
import { tmpdir } from 'node:os'
import {
  resetStats,
  recordUsage,
  flushStats,
  getAnalytics,
  exportStatsAsCsv,
} from '../lib/stats-storage.js'
import { estimateCost, priceTable, resolveModelPrice } from '../lib/model-prices.js'
import { buildTuiSection, applyTuiSettings } from '../lib/tui-settings.js'

const statsPath = path.join(tmpdir(), `clinebot-analytics-${process.pid}-${Date.now()}.json`)

test('model-prices: estimates split uncached input, output and cache reads', () => {
  const cost = estimateCost({
    model: 'cline-pass/claude-sonnet-4.6',
    promptTokens: 1000,
    completionTokens: 500,
    cacheReadTokens: 200,
  })
  assert.equal(cost.priced, true)
  assert.ok(Math.abs(cost.usd - 0.00996) < 1e-9)
  assert.ok(Math.abs(cost.breakdown.input - 0.0024) < 1e-9)
  assert.ok(Math.abs(cost.breakdown.output - 0.0075) < 1e-9)
  assert.ok(Math.abs(cost.breakdown.cacheRead - 0.00006) < 1e-9)

  const unknown = estimateCost({ model: 'cline-pass/custom-unpriced', promptTokens: 1000, completionTokens: 500 })
  assert.equal(unknown.priced, false)
  assert.equal(unknown.usd, 0)
})

test('model-prices: overrides win and unknown models stay unpriced', () => {
  assert.equal(resolveModelPrice('cline-pass/custom-unpriced'), null)

  const table = priceTable(
    { 'cline-pass/custom-unpriced': { input: 1.5, output: 6 } },
    ['cline-pass/deepseek-v4.1-flash', 'cline-pass/custom-unpriced'],
  )
  assert.equal(table.models.length, 2)
  assert.equal(table.models.find((entry) => entry.id === 'cline-pass/deepseek-v4.1-flash').source, 'estimate')
  assert.deepEqual(
    table.models.find((entry) => entry.id === 'cline-pass/custom-unpriced'),
    { id: 'cline-pass/custom-unpriced', input: 1.5, output: 6, cacheRead: null, cacheWrite: null, source: 'override' },
  )
})

test('stats v2: analytics aggregates totals, models, sessions and days', () => {
  resetStats(statsPath)

  recordUsage({
    model: 'cline-pass/claude-sonnet-4.6',
    accountId: 'acc-a',
    sessionId: 'session-1',
    promptTokens: 1000,
    completionTokens: 500,
    cacheReadTokens: 200,
    costUsd: 0.01,
    priced: true,
    ttftMs: 300,
    latencyMs: 1000,
    statsPath,
  })
  recordUsage({
    model: 'cline-pass/claude-sonnet-4.6',
    accountId: 'acc-a',
    sessionId: 'session-1',
    promptTokens: 200,
    completionTokens: 100,
    isError: true,
    latencyMs: 200,
    statsPath,
  })
  recordUsage({
    model: 'cline-pass/deepseek-v4.1-flash',
    accountId: 'acc-b',
    sessionId: 'session-2',
    promptTokens: 300,
    completionTokens: 100,
    costUsd: 0.002,
    priced: true,
    ttftMs: 100,
    latencyMs: 400,
    statsPath,
  })
  flushStats(statsPath)

  const byModel = getAnalytics({ groupBy: 'model' })
  assert.equal(byModel.totals.requests, 3)
  assert.equal(byModel.totals.successful, 2)
  assert.equal(byModel.totals.failed, 1)
  assert.equal(byModel.totals.totalTokens, 2200)
  assert.ok(Math.abs(byModel.totals.costUsd - 0.012) < 1e-9)
  assert.equal(byModel.unpriced, 1)
  assert.equal(byModel.groups.length, 2)
  assert.equal(byModel.groups[0].key, 'cline-pass/claude-sonnet-4.6')
  assert.equal(byModel.groups[0].requests, 2)
  assert.equal(byModel.groups[0].totalTokens, 1800)
  assert.equal(byModel.groups[0].successRate, 50)

  assert.equal(byModel.heatmap.total, 3)
  assert.equal(byModel.heatmap.grid.length, 7)
  assert.equal(byModel.heatmap.grid[0].length, 24)
  assert.equal(byModel.heatmap.hours.length, 24)
  assert.equal(byModel.heatmap.models.find((entry) => entry.model === 'cline-pass/claude-sonnet-4.6').total, 2)
  assert.equal(byModel.heatmap.models.find((entry) => entry.model === 'cline-pass/deepseek-v4.1-flash').total, 1)
  const heatmapRequests = byModel.heatmap.grid.reduce(
    (sum, row) => sum + row.reduce((daySum, cell) => daySum + cell, 0),
    0,
  )
  assert.equal(heatmapRequests, 3)
  const filtered = getAnalytics({ groupBy: 'model', heatmapDays: 7, heatmapModel: 'cline-pass/claude-sonnet-4.6' })
  assert.equal(filtered.heatmap.total, 2)

  const bySession = getAnalytics({ groupBy: 'session' })
  assert.deepEqual(bySession.groups.map((entry) => entry.key).sort(), ['session-1', 'session-2'])
  assert.equal(bySession.groups.find((entry) => entry.key === 'session-1').requests, 2)

  const byDay = getAnalytics({ groupBy: 'day' })
  assert.equal(byDay.groups.length, 1)
  assert.equal(byDay.groups[0].requests, 3)

  const byAccount = getAnalytics({ groupBy: 'account' })
  assert.equal(byAccount.groups.find((entry) => entry.key === 'acc-a').requests, 2)
  assert.equal(byAccount.groups.find((entry) => entry.key === 'acc-b').requests, 1)

  const detailed = exportStatsAsCsv(true)
  assert.match(detailed, /^Dimension,Key,Requests,PromptTokens,CompletionTokens,ReasoningTokens,CacheReadTokens,CacheWriteTokens,TotalTokens,CostUsd,TtftMs,LatencyMs/)
  assert.match(detailed, /Session,"session-1"/)
})

test('tui: section exposes the connection, model and advanced fields', () => {
  const section = buildTuiSection({ live: () => ({}) })
  assert.equal(section.ns, 'dsh-clinebot')
  assert.equal(section.title, 'ClineBot')
  assert.deepEqual(section.fields.map((field) => field.path.join('.')), [
    'apiKey',
    'baseUrl',
    'filterModelsByPlan',
    'webSearch',
    'showSidebarQuota',
    'activeAccount',
    'contextWindow',
    'maxOutputTokens',
  ])
  const apiKey = section.fields.find((field) => field.path[0] === 'apiKey')
  assert.equal(apiKey.secret.ref, 'CLINEBOT_API_KEY')
  assert.deepEqual(section.groups.map((group) => group.id), ['connection', 'models', 'advanced'])
})

test('tui: applyTuiSettings registers the section and disposes it', () => {
  let registered = null
  let disposed = false
  const ctx = {
    inject: (_names, callback) => callback({
      tuiSettingsSections: {
        register: (section) => {
          registered = section
          return () => { disposed = true }
        },
      },
    }),
    effect: (factory) => {
      const cleanup = factory()
      cleanup()
      return () => {}
    },
  }
  applyTuiSettings(ctx, { live: () => ({}) })
  assert.equal(registered.ns, 'dsh-clinebot')
  assert.equal(registered.fields.length, 8)
  assert.equal(disposed, true)
})

test.after(() => {
  rmSync(statsPath, { force: true })
})
