import test from 'node:test'
import assert from 'node:assert/strict'
import { rmSync } from 'node:fs'
import path from 'node:path'
import { tmpdir } from 'node:os'
import { resetStats, recordUsage, getBudgetSpend } from '../lib/stats-storage.js'
import { budgetStatus, budgetErrorMessage } from '../lib/budget.js'
import { ClineBotAdapter } from '../lib/adapter.js'

const statsPath = path.join(tmpdir(), `clinebot-budget-${process.pid}-${Date.now()}.json`)

test('budget: daily and monthly guards block at their estimated limits', () => {
  resetStats(statsPath)
  recordUsage({
    model: 'cline-pass/deepseek-v4.1-flash',
    promptTokens: 1000,
    completionTokens: 500,
    costUsd: 2.5,
    priced: true,
    statsPath,
  })

  const spend = getBudgetSpend()
  assert.ok(spend.dayCost >= 2.5)
  assert.ok(spend.monthCost >= 2.5)

  const daily = budgetStatus({ dailyBudgetUsd: 2 }, spend)
  assert.equal(daily.blocked, true)
  assert.equal(daily.scope, 'daily')
  assert.match(budgetErrorMessage(daily), /Daily ClineBot budget/)

  const monthly = budgetStatus({ monthlyBudgetUsd: 2 }, spend)
  assert.equal(monthly.blocked, true)
  assert.equal(monthly.scope, 'monthly')
  assert.match(budgetErrorMessage(monthly), /Monthly ClineBot budget/)

  assert.equal(budgetStatus({ dailyBudgetUsd: 3, monthlyBudgetUsd: 3 }, spend).blocked, false)
  assert.equal(budgetStatus({ dailyBudgetUsd: 0, monthlyBudgetUsd: 0 }, spend).blocked, false)
})

test('budget: adapter rejects before opening an upstream request', async () => {
  resetStats(statsPath)
  recordUsage({
    model: 'cline-pass/deepseek-v4.1-flash',
    promptTokens: 100,
    completionTokens: 50,
    costUsd: 1,
    priced: true,
    statsPath,
  })
  const adapter = new ClineBotAdapter({ ctx: {}, live: () => ({}) })
  const config = { enabled: true, dailyBudgetUsd: 0.5, statsPath }
  await assert.rejects(async () => {
    for await (const _chunk of adapter.streamWithConfig({ model: 'cline-pass/deepseek-v4.1-flash' }, config)) {
      // no chunks expected
    }
  }, /Daily ClineBot budget reached/)
})

test.after(() => {
  rmSync(statsPath, { force: true })
})
