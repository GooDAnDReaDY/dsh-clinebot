import test from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { registerProxyRoutes } from '../lib/routes/proxy.js'
import { resetSessionRouter } from '../lib/session-router.js'
import { resetStats } from '../lib/stats-storage.js'
import { setLocalProxyToken } from '../lib/proxy-token.js'

const TEST_TOKEN = 'test-pretoken-token-12345'
setLocalProxyToken(TEST_TOKEN)

function createReq(bodyObj) {
  const req = new EventEmitter()
  req.method = 'POST'
  req.socket = { remoteAddress: '127.0.0.1' }
  req.headers = {
    authorization: 'Bearer ' + TEST_TOKEN,
    'content-type': 'application/json'
  }
  req[Symbol.asyncIterator] = async function* () {
    yield Buffer.from(JSON.stringify(bodyObj))
  }
  return req
}

function createMockRes() {
  const res = new EventEmitter()
  res.statusCode = 200
  res.headers = {}
  res.data = ''
  res.headersSent = false
  res.flushHeaders = () => { res.headersSent = true }
  res.setHeader = (k, v) => { res.headers[k.toLowerCase()] = v }
  res.writeHead = (code, hdrs) => {
    res.statusCode = code
    res.headersSent = true
    if (hdrs) Object.assign(res.headers, hdrs)
  }
  res.write = (chunk) => {
    res.headersSent = true
    res.data += Buffer.isBuffer(chunk) ? chunk.toString('utf8') : (chunk instanceof Uint8Array ? Buffer.from(chunk).toString('utf8') : String(chunk))
  }
  res.end = (chunk) => {
    if (chunk) res.data += chunk.toString()
    res.emit('finish')
  }
  return res
}

function setupMockCtx(currentConfig) {
  let completionsHandler = null
  const mockCreds = {
    resolve: async (env) => ({ value: 'key-for-' + env })
  }
  const mockCtx = {
    effect: (fn) => fn(),
    get: (name) => (name === 'credentials' ? mockCreds : null),
    credentials: mockCreds,
    webServer: {
      register: (route) => {
        if (route.path === '/dsh-clinebot/v1/chat/completions') completionsHandler = route.handler
      }
    }
  }
  registerProxyRoutes(mockCtx, { live: () => currentConfig })
  return completionsHandler
}

test('proxy: pre-first-token 502 error does not commit SSE headers and fails over to next account (#212)', async () => {
  resetSessionRouter()
  resetStats()

  const config = {
    enabled: true,
    baseUrl: 'https://api.cline.bot/api/v1',
    accounts: [
      { id: 'acc-1', apiKeyEnv: 'CLINEBOT_API_KEY_1' },
      { id: 'acc-2', apiKeyEnv: 'CLINEBOT_API_KEY_2' }
    ],
    timeoutMs: 1000,
  }

  const handler = setupMockCtx(config)
  const originalFetch = globalThis.fetch
  let fetchAttempts = 0

  globalThis.fetch = async (url, opts) => {
    fetchAttempts++
    if (fetchAttempts === 1) {
      return new Response('{"error":"Bad Gateway"}', {
        status: 502,
        headers: { 'content-type': 'application/json' }
      })
    }
    return new Response(new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('data: {"choices":[{"delta":{"content":"Success from acc2"}}]}' + '\n\n'))
        controller.enqueue(new TextEncoder().encode('data: [DONE]' + '\n\n'))
        controller.close()
      }
    }), {
      status: 200,
      headers: { 'content-type': 'text/event-stream' }
    })
  }

  try {
    const res = createMockRes()
    await handler(createReq({ stream: true, model: 'deepseek-v4-flash' }), res)
    assert.equal(fetchAttempts, 2, 'Must fail over to second account')
    assert.equal(res.statusCode, 200)
    assert.equal(res.headers['content-type'], 'text/event-stream; charset=utf-8')
    assert.ok(res.data.includes('Success from acc2'))
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('proxy: pre-first-token early JSON error in 200 stream triggers failover (#212)', async () => {
  resetSessionRouter()
  resetStats()

  const config = {
    enabled: true,
    baseUrl: 'https://api.cline.bot/api/v1',
    accounts: [
      { id: 'acc-1', apiKeyEnv: 'CLINEBOT_API_KEY_1' },
      { id: 'acc-2', apiKeyEnv: 'CLINEBOT_API_KEY_2' }
    ],
    timeoutMs: 1000,
  }

  const handler = setupMockCtx(config)
  const originalFetch = globalThis.fetch
  let fetchAttempts = 0

  globalThis.fetch = async (url, opts) => {
    fetchAttempts++
    if (fetchAttempts === 1) {
      return new Response(new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('{"error":{"message":"Rate limit reached"}}'))
          controller.close()
        }
      }), {
        status: 200,
        headers: { 'content-type': 'text/event-stream' }
      })
    }
    return new Response(new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('data: {"choices":[{"delta":{"content":"Recovered"}}]}' + '\n\n'))
        controller.enqueue(new TextEncoder().encode('data: [DONE]' + '\n\n'))
        controller.close()
      }
    }), {
      status: 200,
      headers: { 'content-type': 'text/event-stream' }
    })
  }

  try {
    const res = createMockRes()
    await handler(createReq({ stream: true, model: 'deepseek-v4-flash' }), res)
    assert.equal(fetchAttempts, 2, 'Must fail over on early JSON error')
    assert.equal(res.statusCode, 200)
    assert.ok(res.data.includes('Recovered'))
  } finally {
    globalThis.fetch = originalFetch
  }
})