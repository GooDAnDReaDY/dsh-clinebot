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

test('telemetry: single request through proxy and llm/stream does not duplicate persistent stats (#160)', async () => {
  const { apply } = await import('../lib/index.js')
  const { resetStats, getStatsSummary } = await import('../lib/stats-storage.js')
  resetStats()

  const listeners = []
  const registeredRoutes = {}
  const mockCtx = {
    get: () => null,
    inject: (deps, fn) => fn({ settings: {}, effect: (fn) => fn() }),
    on: (evt, handler) => {
      listeners.push({ evt, handler })
      return () => {}
    },
    webServer: {
      register: (r) => {
        registeredRoutes[r.path] = r.handler
        return () => {}
      },
    },
    effect: (fn) => fn(),
  }

  apply(mockCtx, {
    enabled: true,
    proxyMode: true,
    apiKeyEnv: 'CLINE_API_KEY',
  })

  process.env.CLINE_API_KEY = 'test-key'

  const originalFetch = global.fetch
  global.fetch = async (url, opts) => {
    const sseText = [
      'data: {"choices":[{"delta":{"content":"Hi"}}]}',
      '',
      'data: {"usage":{"prompt_tokens":10,"completion_tokens":5,"total_tokens":15}}',
      '',
      'data: [DONE]',
      '',
      ''
    ].join('\n')
    return new Response(sseText, {
      status: 200,
      headers: { 'content-type': 'text/event-stream' }
    })
  }

  try {
    const proxyHandler = registeredRoutes['/dsh-clinebot/v1/chat/completions']
    assert.ok(proxyHandler, 'Proxy completions route must be registered')

    const req = {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'authorization': 'Bearer test-key',
      },
      socket: { remoteAddress: '127.0.0.1' },
      [Symbol.asyncIterator]: async function* () {
        yield Buffer.from(JSON.stringify({
          model: 'cline-pass/deepseek-v4-flash',
          stream: true,
          messages: [{ role: 'user', content: 'hi' }]
        }))
      },
      on: () => {},
      removeListener: () => {},
    }
    const written = []
    const res = {
      statusCode: 200,
      setHeader: () => {},
      write: (data) => written.push(data),
      end: () => {},
      on: () => {},
      removeListener: () => {},
    }

    await proxyHandler(req, res)

    const streamListener = listeners.find((l) => l.evt === 'llm/stream')
    assert.ok(streamListener, 'llm/stream listener must be registered')
    async function* dshStream() {
      yield { type: 'chunk', text: 'Hi' }
      yield { type: 'usage', usage: { inputTokens: 10, outputTokens: 5 } }
      yield { type: 'finish', reason: { kind: 'stop' } }
    }
    const wrapped = streamListener.handler(
      { provider: PROVIDER_ID, model: 'cline-pass/deepseek-v4-flash' },
      dshStream
    )
    for await (const _ of wrapped) {}

    const stats = getStatsSummary()
    assert.equal(stats.totals.requests, 1, 'Should record exactly 1 persistent request, not 2')
    assert.equal(stats.totals.totalTokens, 15, 'Should record exactly 15 tokens, not 30')
    assert.equal(stats.totals.promptTokens, 10)
    assert.equal(stats.totals.completionTokens, 5)
  } finally {
    global.fetch = originalFetch
    delete process.env.CLINE_API_KEY
  }
})

test('telemetry: direct mode (proxyMode: false) records persistent stats exactly once (#160)', async () => {
  const { apply } = await import('../lib/index.js')
  const { resetStats, getStatsSummary } = await import('../lib/stats-storage.js')
  resetStats()

  const listeners = []
  const mockCtx = {
    get: () => null,
    inject: (deps, fn) => fn({ settings: {}, effect: (fn) => fn() }),
    on: (evt, handler) => {
      listeners.push({ evt, handler })
      return () => {}
    },
    webServer: { register: () => {} },
    effect: (fn) => fn(),
  }

  apply(mockCtx, {
    enabled: true,
    proxyMode: false,
  })

  const streamListener = listeners.find((l) => l.evt === 'llm/stream')
  assert.ok(streamListener, 'llm/stream listener must be registered')

  async function* directStream() {
    yield { type: 'chunk', text: 'Direct' }
    yield { type: 'usage', usage: { inputTokens: 10, outputTokens: 5 } }
    yield { type: 'finish', reason: { kind: 'stop' } }
  }
  const wrapped = streamListener.handler(
    { provider: PROVIDER_ID, model: 'cline-pass/deepseek-v4-flash' },
    directStream
  )
  for await (const _ of wrapped) {}

  const stats = getStatsSummary()
  assert.equal(stats.totals.requests, 1, 'Direct mode should record 1 request')
  assert.equal(stats.totals.totalTokens, 15, 'Direct mode should record 15 tokens')
})

test('telemetry: failover across accounts records single persistent request with winning account tokens (#160)', async () => {
  const { apply } = await import('../lib/index.js')
  const { resetStats, getStatsSummary } = await import('../lib/stats-storage.js')
  resetStats()

  const registeredRoutes = {}
  const mockCtx = {
    get: () => null,
    inject: (deps, fn) => fn({ settings: {}, effect: (fn) => fn() }),
    on: () => () => {},
    webServer: {
      register: (r) => {
        registeredRoutes[r.path] = r.handler
        return () => {}
      },
    },
    effect: (fn) => fn(),
  }

  apply(mockCtx, {
    enabled: true,
    proxyMode: true,
    accounts: [
      { id: 'acc-1', label: 'Account 1', apiKeyEnv: 'CLINE_API_KEY_1', present: true },
      { id: 'acc-2', label: 'Account 2', apiKeyEnv: 'CLINE_API_KEY_2', present: true },
    ]
  })

  process.env.CLINE_API_KEY_1 = 'key-1'
  process.env.CLINE_API_KEY_2 = 'key-2'

  let fetchCalls = 0
  const originalFetch = global.fetch
  global.fetch = async (url, opts) => {
    fetchCalls += 1
    const auth = opts?.headers?.Authorization || ''
    if (auth.includes('key-1')) {
      // First attempt fails with 429
      return new Response(JSON.stringify({ error: { message: 'Rate limit exceeded' } }), {
        status: 429,
        headers: { 'content-type': 'application/json' }
      })
    }
    // Second attempt succeeds with 15 tokens
    const sseText = [
      'data: {"choices":[{"delta":{"content":"Hi"}}]}',
      '',
      'data: {"usage":{"prompt_tokens":10,"completion_tokens":5,"total_tokens":15}}',
      '',
      'data: [DONE]',
      '',
      ''
    ].join('\n')
    return new Response(sseText, {
      status: 200,
      headers: { 'content-type': 'text/event-stream' }
    })
  }

  try {
    const proxyHandler = registeredRoutes['/dsh-clinebot/v1/chat/completions']
    assert.ok(proxyHandler, 'Proxy completions route must be registered')

    const req = {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'authorization': 'Bearer key-1',
      },
      socket: { remoteAddress: '127.0.0.1' },
      [Symbol.asyncIterator]: async function* () {
        yield Buffer.from(JSON.stringify({
          model: 'cline-pass/deepseek-v4-flash',
          stream: true,
          messages: [{ role: 'user', content: 'hi' }]
        }))
      },
      on: () => {},
      removeListener: () => {},
    }
    const written = []
    const res = {
      statusCode: 200,
      setHeader: () => {},
      write: (data) => written.push(data),
      end: () => {},
      on: () => {},
      removeListener: () => {},
    }

    await proxyHandler(req, res)
    assert.equal(fetchCalls, 2, 'Should have made 2 upstream fetch calls during failover')

    const stats = getStatsSummary()
    assert.equal(stats.totals.requests, 1, 'Should record exactly 1 logical request across failover')
    assert.equal(stats.totals.successful, 1, 'Logical request should be recorded as successful')
    assert.equal(stats.totals.failed, 0, 'No failed request recorded')
    assert.equal(stats.totals.totalTokens, 15, 'Total tokens should match winning account')
    assert.equal(stats.byAccount['acc-2']?.requests, 1)
    assert.equal(stats.byAccount['acc-2']?.totalTokens, 15)
  } finally {
    global.fetch = originalFetch
    delete process.env.CLINE_API_KEY_1
    delete process.env.CLINE_API_KEY_2
  }
})
