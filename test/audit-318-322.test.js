import test from 'node:test'
import assert from 'node:assert/strict'
import { streamOpenAiChunks } from '../lib/adapter-stream.js'
import { resolveSessionAccount, resetSessionRouter } from '../lib/session-router.js'
import { buildStatus } from '../lib/provider-sync.js'
import { getStatsSummary, setStatsRetentionDays } from '../lib/stats-storage.js'
import { ClineBotAdapter } from '../lib/adapter.js'

function credentialsCtx(keys = { CLINEBOT_API_KEY: 'test-key' }) {
  return {
    get(name) {
      if (name === 'credentials') {
        return {
          resolve: async (ref) => ({ value: keys[ref?.name || ref] || '' }),
        }
      }
      return undefined
    },
    logger: { warn() {}, info() {}, error() {} },
  }
}

test('#318: finishChunk returns max-tokens on length/max_tokens even with tool calls', async () => {
  async function* eventsWithToolCallsAndLength() {
    yield {
      choices: [{
        delta: {
          tool_calls: [{
            index: 0,
            id: 'call_1',
            function: { name: 'read_file', arguments: '{"path":' },
          }],
        },
        finish_reason: 'length',
      }],
    }
    yield { done: true }
  }

  const chunks = []
  for await (const chunk of streamOpenAiChunks(eventsWithToolCallsAndLength())) {
    chunks.push(chunk)
  }

  const finish = chunks.find((c) => c.type === 'finish')
  assert.ok(finish, 'Must yield a finish chunk')
  assert.equal(finish.reason.kind, 'max-tokens', 'Must return max-tokens, not tool-calls')
})

test('#318: premature stream disconnect without finish_reason and without [DONE] yields STREAM_TRUNCATED', async () => {
  async function* truncatedEvents() {
    yield {
      choices: [{
        delta: { content: 'Partial answer before connection drops' },
      }],
    }
    // Stream ends without finish_reason and without { done: true }
  }

  const chunks = []
  for await (const chunk of streamOpenAiChunks(truncatedEvents())) {
    chunks.push(chunk)
  }

  const finish = chunks.find((c) => c.type === 'finish')
  assert.ok(finish, 'Must yield a finish chunk')
  assert.equal(finish.reason.kind, 'error', 'Must finish with error')
  assert.equal(finish.reason.failure?.code, 'STREAM_TRUNCATED', 'Must have STREAM_TRUNCATED code')
})

test('#318: stream with [DONE] and no finish_reason finishes normally with stop', async () => {
  async function* doneEvents() {
    yield {
      choices: [{
        delta: { content: 'Complete answer' },
      }],
    }
    yield { done: true }
  }

  const chunks = []
  for await (const chunk of streamOpenAiChunks(doneEvents())) {
    chunks.push(chunk)
  }

  const finish = chunks.find((c) => c.type === 'finish')
  assert.ok(finish, 'Must yield a finish chunk')
  assert.equal(finish.reason.kind, 'stop', 'Must finish with stop')
})

test('#319: adapter records attempt on HTTP 429, 500, 401 and network errors', async () => {
  const attempts = []
  const adapter = new ClineBotAdapter({
    ctx: credentialsCtx({ CLINEBOT_API_KEY: 'test-key' }),
    live: () => ({
      enabled: true,
      baseUrl: 'http://127.0.0.1:9',
      apiKeyEnv: 'CLINEBOT_API_KEY',
      maxFailoverAttempts: 1,
    }),
  })
  adapter.recordAttempt = (info) => { attempts.push(info) }

  // 1. HTTP 429
  adapter.requestChatCompletion = async () => new Response('rate limit', { status: 429 })
  await assert.rejects(async () => {
    for await (const _ of adapter.stream({ model: 'test' }, { messages: [] })) {}
  }, (err) => err.code === 'RATE_LIMIT')
  assert.equal(attempts.length, 1)
  assert.equal(attempts[0].isError, true)
  assert.equal(attempts[0].is429, true)

  // 2. HTTP 500
  attempts.length = 0
  adapter.requestChatCompletion = async () => new Response('internal error', { status: 500 })
  await assert.rejects(async () => {
    for await (const _ of adapter.stream({ model: 'test' }, { messages: [] })) {}
  }, (err) => err.code === 'PROVIDER_ERROR')
  assert.equal(attempts.length, 1)
  assert.equal(attempts[0].isError, true)
  assert.equal(attempts[0].is429, false)

  // 3. HTTP 401
  attempts.length = 0
  adapter.requestChatCompletion = async () => new Response('unauthorized', { status: 401 })
  await assert.rejects(async () => {
    for await (const _ of adapter.stream({ model: 'test' }, { messages: [] })) {}
  }, (err) => err.code === 'AUTH')
  assert.equal(attempts.length, 1)
  assert.equal(attempts[0].isError, true)
  assert.equal(attempts[0].is429, false)

  // 4. Connection network error
  attempts.length = 0
  adapter.requestChatCompletion = async () => { throw new Error('ECONNRESET') }
  await assert.rejects(async () => {
    for await (const _ of adapter.stream({ model: 'test' }, { messages: [] })) {}
  })
  assert.equal(attempts.length, 1)
  assert.equal(attempts[0].isError, true)
})

test('#319: aborted stream after first token records aborted: true', async () => {
  const attempts = []
  const adapter = new ClineBotAdapter({
    ctx: credentialsCtx({ CLINEBOT_API_KEY: 'test-key' }),
    live: () => ({
      enabled: true,
      baseUrl: 'http://127.0.0.1:9',
      apiKeyEnv: 'CLINEBOT_API_KEY',
    }),
  })
  adapter.recordAttempt = (info) => { attempts.push(info) }

  const controller = new AbortController()
  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    start(ctrl) {
      ctrl.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"Hi"}}]}\n\n'))
      setTimeout(() => {
        controller.abort()
        try { ctrl.close() } catch {}
      }, 10)
    },
  })

  adapter.requestChatCompletion = async () => new Response(stream, {
    status: 200,
    headers: { 'content-type': 'text/event-stream' },
  })

  const chunks = []
  try {
    for await (const chunk of adapter.stream({ model: 'test', messages: [], signal: controller.signal })) {
      chunks.push(chunk)
    }
  } catch {}

  assert.ok(attempts.length >= 1, 'Should record the aborted attempt')
  const lastAttempt = attempts[attempts.length - 1]
  assert.equal(lastAttempt.aborted, true, 'Attempt must be recorded as aborted')
  assert.equal(lastAttempt.isError, false, 'Client abort must not be classified as provider error')
})

test('#320: per-model account routing takes precedence over pinned account', () => {
  resetSessionRouter()
  const pool = [
    { apiKeyEnv: 'KEY_1', id: 'acc1', present: true, value: 'k1' },
    { apiKeyEnv: 'KEY_2', id: 'acc2', present: true, value: 'k2' },
  ]
  const routes = {
    'special-model': 'KEY_2',
  }

  // 1. With sessionId: special-model routes to KEY_2 even though KEY_1 is pinned
  const res1 = resolveSessionAccount('sess-1', pool, 'KEY_1', 'least_used', 'special-model', routes)
  assert.equal(res1.account.apiKeyEnv, 'KEY_2', 'Must route to KEY_2 per model rule')
  assert.equal(res1.reason, 'model_route')

  // 2. With sessionId: other model routes to pinned KEY_1
  const res2 = resolveSessionAccount('sess-2', pool, 'KEY_1', 'least_used', 'other-model', routes)
  assert.equal(res2.account.apiKeyEnv, 'KEY_1', 'Must route to pinned KEY_1')
  assert.equal(res2.reason, 'pinned_active')

  // 3. Without sessionId: special-model routes to KEY_2 even though KEY_1 is pinned
  const res3 = resolveSessionAccount('', pool, 'KEY_1', 'least_used', 'special-model', routes)
  assert.equal(res3.account.apiKeyEnv, 'KEY_2', 'Must route to KEY_2 without session')
  assert.equal(res3.reason, 'model_route')
})

test('#322: buildStatus includes router diagnostics and getStatsSummary includes retentionDays', async () => {
  const status = await buildStatus({
    credentials: { resolve: async () => ({ value: 'test' }) },
    llm: { listProviders: async () => [] },
  }, {
    enabled: true,
    apiKeyEnv: 'CLINEBOT_API_KEY',
    baseUrl: 'https://synthetic.invalid/v1',
  })

  assert.ok(status.router, 'status must include router diagnostics')
  assert.equal(typeof status.router.activeSessionsCount, 'number')
  assert.equal(typeof status.router.maxSessions, 'number')
  assert.ok(status.router.cooldowns, 'status.router must include cooldowns')

  setStatsRetentionDays(45)
  const stats = getStatsSummary()
  assert.equal(stats.retentionDays, 45)
})
