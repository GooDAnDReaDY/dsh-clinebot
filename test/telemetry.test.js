import test from 'node:test'
import assert from 'node:assert/strict'
import { PROVIDER_ID } from '../lib/models.js'

test('telemetry: llm/stream records real DSH traffic, token usage, latency and models', async () => {
  const { sessionStats, resetSessionStats, recordSmokeTest } = await import('../lib/cline-client.js')
  const { apply } = await import('../lib/index.js')
  resetSessionStats()

  const listeners = []
  const ctx = {
    get: () => null,
    inject: (deps, fn) => fn({ settings: {}, effect: (fn) => fn() }),
    on: (evt, handler) => {
      listeners.push({ evt, handler })
      return () => {}
    },
    effect: (fn) => fn(),
  }

  apply(ctx, { enabled: true })

  const streamListener = listeners.find((l) => l.evt === 'llm/stream')
  assert.ok(streamListener, 'llm/stream listener must be registered')

  // 1. Non-cline provider stream must not be counted in sessionStats
  async function* otherStream() {
    yield { type: 'usage', usage: { inputTokens: 50, outputTokens: 50 } }
    yield { type: 'finish', reason: { kind: 'stop' } }
  }
  const wrappedOther = streamListener.handler({ provider: 'other-provider', model: 'other-model' }, otherStream)
  for await (const _ of wrappedOther) {}
  assert.equal(sessionStats.totalRequests, 0, 'Other provider must not affect sessionStats')

  // 2. Successful stream with usage and stop finish
  async function* clineSuccessStream() {
    yield { type: 'chunk', text: 'Hello' }
    yield {
      type: 'usage',
      usage: { inputTokens: 120, outputTokens: 45, cacheReadTokens: 10, cacheWriteTokens: 5 },
    }
    yield { type: 'finish', reason: { kind: 'stop' } }
  }
  const wrappedSuccess = streamListener.handler(
    { provider: PROVIDER_ID, model: 'cline-pass/deepseek-v4-flash' },
    clineSuccessStream
  )
  for await (const _ of wrappedSuccess) {}

  assert.equal(sessionStats.totalRequests, 1)
  assert.equal(sessionStats.successfulRequests, 1)
  assert.equal(sessionStats.failedRequests, 0)
  assert.equal(sessionStats.promptTokensEst, 135) // 120 + 10 + 5
  assert.equal(sessionStats.completionTokensEst, 45)
  assert.equal(sessionStats.totalTokensEst, 180)
  assert.ok(typeof sessionStats.lastLatencyMs === 'number')
  assert.equal(sessionStats.byModel['cline-pass/deepseek-v4-flash']?.requests, 1)
  assert.equal(sessionStats.byModel['cline-pass/deepseek-v4-flash']?.promptTokens, 135)
  assert.equal(sessionStats.byModel['cline-pass/deepseek-v4-flash']?.completionTokens, 45)

  // 3. Error finish with HTTP 502
  async function* clineErrorStream() {
    yield {
      type: 'finish',
      reason: { kind: 'error', failure: { status: 502, message: 'Upstream gateway error' } },
    }
  }
  const wrappedError = streamListener.handler(
    { provider: PROVIDER_ID, model: 'cline-pass/deepseek-v4-pro' },
    clineErrorStream
  )
  for await (const _ of wrappedError) {}

  assert.equal(sessionStats.totalRequests, 2)
  assert.equal(sessionStats.successfulRequests, 1)
  assert.equal(sessionStats.failedRequests, 1)
  assert.equal(sessionStats.lastError, 'Upstream gateway error')

  // 4. Aborted finish
  async function* clineAbortedStream() {
    yield { type: 'usage', usage: { inputTokens: 20, outputTokens: 5 } }
    yield { type: 'finish', reason: { kind: 'aborted' } }
  }
  const wrappedAborted = streamListener.handler(
    { provider: PROVIDER_ID, model: 'cline-pass/deepseek-v4-flash' },
    clineAbortedStream
  )
  for await (const _ of wrappedAborted) {}

  assert.equal(sessionStats.totalRequests, 3)
  assert.equal(sessionStats.abortedRequests, 1)
  assert.equal(sessionStats.failedRequests, 1) // unchanged

  // 5. Smoke tests do NOT inflate sessionStats.totalRequests
  recordSmokeTest({ latencyMs: 80, ok: true, model: 'cline-pass/deepseek-v4-flash' })
  assert.equal(sessionStats.totalRequests, 3, 'Smoke test must not inflate totalRequests')
  assert.ok(sessionStats.lastSmoke)
  assert.equal(sessionStats.lastSmoke.ok, true)
  assert.equal(sessionStats.lastSmoke.latencyMs, 80)
})
