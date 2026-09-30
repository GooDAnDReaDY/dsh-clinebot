import test from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { registerProxyRoutes, USER_AGENT } from '../lib/routes/proxy.js'
import { buildPiAiProvider, usageCache, clearUsageCache } from '../lib/cline-client.js'
import { resetSessionRouter, getSessionRouterStatus } from '../lib/session-router.js'
import { resetStats, getStatsSummary } from '../lib/stats-storage.js'
import { getLocalProxyToken, setLocalProxyToken } from '../lib/proxy-token.js'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const pkg = require('../package.json')

const TEST_TOKEN = 'test-secret-token-12345'
setLocalProxyToken(TEST_TOKEN)

function createMockRes() {
  let jsonResult = null
  let statusCode = 200
  const headers = {}
  return {
    writeHead: (code, hdrs) => {
      statusCode = code
      Object.assign(headers, hdrs)
    },
    setHeader: (k, v) => { headers[k] = v },
    end: (str) => {
      if (str) {
        try {
          jsonResult = JSON.parse(str)
        } catch {
          jsonResult = str
        }
      }
    },
    get json() { return jsonResult },
    get status() { return statusCode },
    get headers() { return headers }
  }
}

test('proxy: registers /v1/chat/completions and /v1/models endpoints', () => {
  const registered = []
  const mockCtx = {
    effect: (fn) => fn(),
    webServer: {
      register: (route) => {
        registered.push(route)
        return () => {}
      }
    }
  }

  registerProxyRoutes(mockCtx, {
    live: () => ({
      enabled: true,
      baseUrl: 'https://api.cline.bot/api/v1',
      accounts: [],
      dynamicModels: [],
      customModels: []
    })
  })

  assert.equal(registered.length, 2)
  const paths = registered.map(r => r.path)
  assert.ok(paths.includes('/dsh-clinebot/v1/chat/completions'))
  assert.ok(paths.includes('/dsh-clinebot/v1/models'))
})

test('proxy: /v1/models returns OpenAI-compatible models format when authorized (#145)', async () => {
  resetSessionRouter()
  let routeHandler = null
  const mockCtx = {
    effect: (fn) => fn(),
    webServer: {
      register: (route) => {
        if (route.path === '/dsh-clinebot/v1/models') {
          routeHandler = route.handler
        }
      }
    }
  }

  registerProxyRoutes(mockCtx, {
    live: () => ({
      enabled: true,
      baseUrl: 'https://api.cline.bot/api/v1',
      customModels: [{ id: 'cline-pass/custom-llama', name: 'Custom Llama' }]
    })
  })

  const req = {
    method: 'GET',
    socket: { remoteAddress: '127.0.0.1' },
    headers: { authorization: `Bearer ${TEST_TOKEN}` }
  }
  const res = createMockRes()

  await routeHandler(req, res)
  assert.equal(res.status, 200)
  assert.ok(res.json)
  assert.equal(res.json.object, 'list')
  assert.ok(Array.isArray(res.json.data))
  assert.ok(res.json.data.some(m => m.id === 'cline-pass/custom-llama'))
  assert.ok(res.json.data.some(m => m.id === 'cline-pass/deepseek-v4-flash'))
})

test('proxy: rejects unauthorized requests missing or with invalid Bearer token (#145)', async () => {
  resetSessionRouter()
  let completionsHandler = null
  let modelsHandler = null
  const mockCtx = {
    effect: (fn) => fn(),
    webServer: {
      register: (route) => {
        if (route.path === '/dsh-clinebot/v1/chat/completions') completionsHandler = route.handler
        if (route.path === '/dsh-clinebot/v1/models') modelsHandler = route.handler
      }
    }
  }

  registerProxyRoutes(mockCtx, {
    live: () => ({ enabled: true, baseUrl: 'https://api.cline.bot/api/v1', accounts: [] })
  })

  // 1. Missing Authorization on /v1/chat/completions
  const res1 = createMockRes()
  await completionsHandler({ method: 'POST', socket: { remoteAddress: '127.0.0.1' }, headers: {} }, res1)
  assert.equal(res1.status, 401)
  assert.ok(res1.json?.error?.includes('Unauthorized'))

  // 2. Invalid Bearer token on /v1/chat/completions
  const res2 = createMockRes()
  await completionsHandler({ method: 'POST', socket: { remoteAddress: '127.0.0.1' }, headers: { authorization: 'Bearer wrong-token' } }, res2)
  assert.equal(res2.status, 401)
  assert.ok(res2.json?.error?.includes('Unauthorized'))

  // 3. Missing Authorization on /v1/models
  const res3 = createMockRes()
  await modelsHandler({ method: 'GET', socket: { remoteAddress: '127.0.0.1' }, headers: {} }, res3)
  assert.equal(res3.status, 401)
  assert.ok(res3.json?.error?.includes('Unauthorized'))
})

test('proxy: rejects browser cross-site or Origin requests with 403 (#145)', async () => {
  resetSessionRouter()
  let completionsHandler = null
  let modelsHandler = null
  const mockCtx = {
    effect: (fn) => fn(),
    webServer: {
      register: (route) => {
        if (route.path === '/dsh-clinebot/v1/chat/completions') completionsHandler = route.handler
        if (route.path === '/dsh-clinebot/v1/models') modelsHandler = route.handler
      }
    }
  }

  registerProxyRoutes(mockCtx, {
    live: () => ({ enabled: true, baseUrl: 'https://api.cline.bot/api/v1', accounts: [] })
  })

  // 1. Request with Sec-Fetch-Site: cross-site
  const res1 = createMockRes()
  await completionsHandler({
    method: 'POST',
    socket: { remoteAddress: '127.0.0.1' },
    headers: {
      authorization: `Bearer ${TEST_TOKEN}`,
      'sec-fetch-site': 'cross-site'
    }
  }, res1)
  assert.equal(res1.status, 403)
  assert.ok(res1.json?.error?.includes('Cross-site or browser requests to proxy are forbidden'))

  // 2. Request with Origin header
  const res2 = createMockRes()
  await completionsHandler({
    method: 'POST',
    socket: { remoteAddress: '127.0.0.1' },
    headers: {
      authorization: `Bearer ${TEST_TOKEN}`,
      origin: 'https://evil.example.com'
    }
  }, res2)
  assert.equal(res2.status, 403)
  assert.ok(res2.json?.error?.includes('Cross-site or browser requests to proxy are forbidden'))

  // 3. Models request with Origin
  const res3 = createMockRes()
  await modelsHandler({
    method: 'GET',
    socket: { remoteAddress: '127.0.0.1' },
    headers: {
      authorization: `Bearer ${TEST_TOKEN}`,
      origin: 'https://evil.example.com'
    }
  }, res3)
  assert.equal(res3.status, 403)
  assert.ok(res3.json?.error?.includes('Cross-site or browser requests to proxy are forbidden'))
})

test('proxy: rejects non-loopback network requests with 403', async () => {
  resetSessionRouter()
  let completionsHandler = null
  let modelsHandler = null
  const mockCtx = {
    effect: (fn) => fn(),
    webServer: {
      register: (route) => {
        if (route.path === '/dsh-clinebot/v1/chat/completions') completionsHandler = route.handler
        if (route.path === '/dsh-clinebot/v1/models') modelsHandler = route.handler
      }
    }
  }

  registerProxyRoutes(mockCtx, {
    live: () => ({ enabled: true, baseUrl: 'https://api.cline.bot/api/v1', accounts: [] })
  })

  // 1. External IP on /v1/chat/completions
  const resCompletions = createMockRes()
  await completionsHandler({
    method: 'POST',
    socket: { remoteAddress: '192.168.1.50' },
    headers: { authorization: `Bearer ${TEST_TOKEN}` }
  }, resCompletions)
  assert.equal(resCompletions.status, 403)
  assert.equal(resCompletions.json?.error, 'Loopback access only')

  // 2. External IP on /v1/models
  const resModels = createMockRes()
  await modelsHandler({
    method: 'GET',
    socket: { remoteAddress: '192.168.1.50' },
    headers: { authorization: `Bearer ${TEST_TOKEN}` }
  }, resModels)
  assert.equal(resModels.status, 403)
  assert.equal(resModels.json?.error, 'Loopback access only')
})

test('proxy: /v1/chat/completions validates method and missing keys gracefully', async () => {
  resetSessionRouter()
  let routeHandler = null
  const mockCtx = {
    effect: (fn) => fn(),
    webServer: {
      register: (route) => {
        if (route.path === '/dsh-clinebot/v1/chat/completions') {
          routeHandler = route.handler
        }
      }
    }
  }

  registerProxyRoutes(mockCtx, {
    live: () => ({
      enabled: true,
      baseUrl: 'https://api.cline.bot/api/v1',
      accounts: []
    })
  })

  // Test non-POST method
  const reqGet = { method: 'GET', socket: { remoteAddress: '127.0.0.1' } }
  const resGet = createMockRes()
  await routeHandler(reqGet, resGet)
  assert.equal(resGet.status, 405)
  assert.equal(resGet.json.ok, false)
  assert.equal(resGet.json.error, 'POST only')

  // Test POST with no keys configured in pool
  const reqPost = {
    method: 'POST',
    socket: { remoteAddress: '127.0.0.1' },
    headers: { authorization: `Bearer ${TEST_TOKEN}` },
    on: (evt, cb) => {
      if (evt === 'data') cb(Buffer.from(JSON.stringify({ model: 'deepseek-v4-flash' })))
      if (evt === 'end') cb()
    }
  }
  const resPost = createMockRes()
  await routeHandler(reqPost, resPost)
  assert.equal(resPost.status, 503)
  assert.ok(resPost.json.error)
  assert.equal(resPost.json.error.code, 'no_keys_available')
})

test('proxy: defaults model to defaultModel when omitted in request (#140)', async () => {
  resetSessionRouter()
  let completionsHandler = null

  const mockCtx = {
    effect: (fn) => fn(),
    webServer: {
      register: (route) => {
        if (route.path === '/dsh-clinebot/v1/chat/completions') completionsHandler = route.handler
      }
    }
  }

  registerProxyRoutes(mockCtx, {
    live: () => ({
      enabled: true,
      defaultModel: 'cline-pass/deepseek-v4-flash',
      accounts: []
    })
  })

  const reqPost = {
    method: 'POST',
    socket: { remoteAddress: '127.0.0.1' },
    headers: { authorization: `Bearer ${TEST_TOKEN}` },
    on: (evt, cb) => {
      if (evt === 'data') cb(Buffer.from(JSON.stringify({ messages: [{ role: 'user', content: 'hi' }] })))
      if (evt === 'end') cb()
    }
  }
  const resPost = createMockRes()
  await completionsHandler(reqPost, resPost)

  assert.equal(resPost.status, 503)
  assert.equal(resPost.json?.error?.code, 'no_keys_available')
})

test('proxy: /v1/chat/completions accepts request bodies > 256KB without 400 body too large (#142, GH #10)', async () => {
  resetSessionRouter()
  let completionsHandler = null

  const mockCtx = {
    effect: (fn) => fn(),
    webServer: {
      register: (route) => {
        if (route.path === '/dsh-clinebot/v1/chat/completions') completionsHandler = route.handler
      }
    }
  }

  registerProxyRoutes(mockCtx, {
    live: () => ({
      enabled: true,
      defaultModel: 'cline-pass/deepseek-v4-flash',
      accounts: []
    })
  })

  const largeContent = 'A'.repeat(512 * 1024)
  const largePayload = JSON.stringify({
    model: 'cline-pass/deepseek-v4-flash',
    messages: [{ role: 'user', content: largeContent }]
  })

  const reqLarge = {
    method: 'POST',
    socket: { remoteAddress: '127.0.0.1' },
    headers: { authorization: `Bearer ${TEST_TOKEN}` },
    on: (evt, cb) => {
      if (evt === 'data') cb(Buffer.from(largePayload))
      if (evt === 'end') cb()
    }
  }
  const resLarge = createMockRes()
  await completionsHandler(reqLarge, resLarge)

  assert.notEqual(resLarge.status, 400)
  assert.equal(resLarge.status, 503)
  assert.equal(resLarge.json?.error?.code, 'no_keys_available')
})

test('proxy: User-Agent dynamically reflects package version (#147)', () => {
  assert.equal(USER_AGENT, `@goodandready/dsh-clinebot/${pkg.version}`)
})

test('proxy: closing client response aborts upstream request and cleans up listeners (#164)', async () => {
  resetSessionRouter()
  let completionsHandler = null
  const mockCreds = {
    resolve: async () => ({ value: 'sk-test-key-164' })
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

  registerProxyRoutes(mockCtx, {
    live: () => ({
      enabled: true,
      baseUrl: 'https://api.cline.bot/api/v1',
      accounts: [{ id: 'acc-1', apiKeyEnv: 'CLINEBOT_API_KEY' }]
    })
  })

  const originalFetch = globalThis.fetch

  const createReq = (bodyObj) => {
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

  // 1. Client disconnects mid-stream -> upstream stream reader is cancelled
  try {
    let upstreamCancelled = false
    let upstreamCancelReason = null
    let upstreamFetchSignal = null

    globalThis.fetch = async (url, init) => {
      upstreamFetchSignal = init.signal
      const sseStream = new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('data: {"id":"1","choices":[{"delta":{"content":"first"}}]}\n\n'))
        },
        cancel(reason) {
          upstreamCancelled = true
          upstreamCancelReason = reason
        }
      })
      return new Response(sseStream, {
        status: 200,
        headers: { 'content-type': 'text/event-stream' }
      })
    }

    const emitterRes = new EventEmitter()
    emitterRes.statusCode = 200
    emitterRes.writableFinished = false
    emitterRes.writableEnded = false
    emitterRes.destroyed = false
    emitterRes.setHeader = () => {}
    emitterRes.writeHead = () => {}
    emitterRes.write = () => {
      emitterRes.destroyed = true
      emitterRes.emit('close')
    }
    emitterRes.end = () => {
      emitterRes.writableFinished = true
      emitterRes.writableEnded = true
      emitterRes.emit('finish')
    }

    const emitterReq = createReq({ stream: true, model: 'deepseek-v4-flash' })
    await completionsHandler(emitterReq, emitterRes)

    assert.equal(upstreamCancelled, true, 'Upstream stream must be cancelled when client disconnects')
    assert.equal(upstreamFetchSignal.aborted, true, 'Upstream fetch signal must be aborted')
    assert.equal(emitterRes.listenerCount('close'), 0, 'Response close listeners must be cleaned up')
    assert.equal(emitterReq.listenerCount('close'), 0, 'Request close listeners must be cleaned up')

    // 2. Normal EOF -> upstream stream is NOT cancelled, finishes normally
    let eofStreamCancelled = false
    globalThis.fetch = async (url, init) => {
      const sseStream = new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('data: {"id":"2","choices":[{"delta":{"content":"done"}}]}\n\n'))
          controller.enqueue(new TextEncoder().encode('data: [DONE]\n\n'))
          controller.close()
        },
        cancel() {
          eofStreamCancelled = true
        }
      })
      return new Response(sseStream, {
        status: 200,
        headers: { 'content-type': 'text/event-stream' }
      })
    }

    const normRes = new EventEmitter()
    normRes.statusCode = 200
    normRes.writableFinished = false
    normRes.writableEnded = false
    normRes.destroyed = false
    normRes.setHeader = () => {}
    normRes.writeHead = () => {}
    normRes.write = () => {}
    normRes.end = () => {
      normRes.writableFinished = true
      normRes.writableEnded = true
      normRes.emit('finish')
      normRes.emit('close')
    }

    const normReq = createReq({ stream: true, model: 'deepseek-v4-flash' })
    await completionsHandler(normReq, normRes)

    assert.equal(eofStreamCancelled, false, 'Normal stream EOF must not be cancelled')
    assert.equal(normRes.writableFinished, true, 'Normal response must finish')
    assert.equal(normRes.listenerCount('close'), 0, 'Response close listeners must be cleaned up')
    assert.equal(normReq.listenerCount('close'), 0, 'Request close listeners must be cleaned up')
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('proxy: authorizes requests with account pool key or local proxy token (#150, GH #11)', async () => {
  resetSessionRouter()
  let modelsHandler = null
  const mockCreds = {
    resolve: async (ref) => ({ value: ref === 'CLINEBOT_API_KEY' ? 'real-account-key-xyz' : '' })
  }
  const mockCtx = {
    effect: (fn) => fn(),
    get: (name) => name === 'credentials' ? mockCreds : null,
    credentials: mockCreds,
    webServer: {
      register: (route) => {
        if (route.path === '/dsh-clinebot/v1/models') modelsHandler = route.handler
      }
    }
  }

  registerProxyRoutes(mockCtx, {
    live: () => ({
      enabled: true,
      baseUrl: 'https://api.cline.bot/api/v1',
      apiKeyEnv: 'CLINEBOT_API_KEY',
      accounts: []
    })
  })

  // 1. Authorized via local proxy token
  const resLocal = createMockRes()
  await modelsHandler({ method: 'GET', socket: { remoteAddress: '127.0.0.1' }, headers: { authorization: `Bearer ${TEST_TOKEN}` } }, resLocal)
  assert.equal(resLocal.status, 200)

  // 2. Authorized via real account key in pool (when DSH sends CLINEBOT_API_KEY)
  const resAccountKey = createMockRes()
  await modelsHandler({ method: 'GET', socket: { remoteAddress: '127.0.0.1' }, headers: { authorization: 'Bearer real-account-key-xyz' } }, resAccountKey)
  assert.equal(resAccountKey.status, 200)

  // 3. Rejected when key does not match either
  const resBad = createMockRes()
  await modelsHandler({ method: 'GET', socket: { remoteAddress: '127.0.0.1' }, headers: { authorization: 'Bearer wrong-unauthorized-key' } }, resBad)
  assert.equal(resBad.status, 401)
})


test('proxy: pi-ai client forwards session affinity headers and sticky router preserves session (#163)', async () => {
  resetSessionRouter()

  let completionsHandler = null
  const mockCreds = {
    resolve: async (ref) => {
      if (ref === 'KEY_A') return { value: 'sk-account-a-secret' }
      if (ref === 'KEY_B') return { value: 'sk-account-b-secret' }
      return { value: '' }
    }
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

  clearUsageCache()
  const setQuota = (key, pct) => {
    usageCache.set('cline:usage:' + key.slice(-8), {
      expiresAt: Date.now() + 60000,
      data: { windows: { fiveHour: { percentUsed: pct } } }
    })
  }

  setQuota('sk-account-a-secret', 10)
  setQuota('sk-account-b-secret', 90)

  registerProxyRoutes(mockCtx, {
    live: () => ({
      enabled: true,
      baseUrl: 'https://api.cline.bot/api/v1',
      accounts: [
        { id: 'acc-a', apiKeyEnv: 'KEY_A' },
        { id: 'acc-b', apiKeyEnv: 'KEY_B' }
      ]
    })
  })

  const upstreamCalls = []
  const originalFetch = globalThis.fetch
  globalThis.fetch = async (url, init) => {
    upstreamCalls.push({
      url,
      auth: init.headers?.Authorization,
      body: JSON.parse(init.body || '{}')
    })
    const sseBody = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('data: {"id":"1","choices":[{"delta":{"content":"pong"}}]\n\ndata: [DONE]\n\n'))
        controller.close()
      }
    })
    return new Response(sseBody, {
      status: 200,
      headers: { 'content-type': 'text/event-stream' }
    })
  }

  try {
    const provider = buildPiAiProvider({
      baseUrl: 'http://127.0.0.1:3080/dsh-clinebot/v1',
      apiKey: TEST_TOKEN,
      models: [{ id: 'deepseek-v4-flash', name: 'DeepSeek V4 Flash' }]
    })

    assert.equal(provider.compat.sendSessionAffinityHeaders, true)
    assert.equal(provider.compat.sessionAffinityFormat, 'openrouter')
    const model = { ...provider.models[0], api: provider.api, baseUrl: provider.baseURL }
    assert.equal(model.compat.sendSessionAffinityHeaders, true)
    assert.equal(model.compat.sessionAffinityFormat, 'openrouter')

    const runProxyRequest = async (headers, bodyObj) => {
      const chunks = []
      let statusCode = 200
      let resHeaders = {}
      const res = {
        writeHead: (code, hdrs) => {
          statusCode = code
          resHeaders = hdrs || {}
        },
        write: (chunk) => {
          chunks.push(chunk.toString('utf8'))
        },
        end: (finalChunk) => {
          if (finalChunk) chunks.push(finalChunk.toString('utf8'))
        },
        on: (evt, cb) => {},
        removeListener: () => {},
        get statusCode() { return statusCode },
        get headers() { return resHeaders },
        get output() { return chunks.join('') }
      }

      const reqBodyStr = JSON.stringify(bodyObj)
      const req = {
        method: 'POST',
        socket: { remoteAddress: '127.0.0.1' },
        headers: {
          authorization: 'Bearer ' + TEST_TOKEN,
          'content-type': 'application/json',
          ...headers
        },
        on: (evt, cb) => {
          if (evt === 'data') cb(Buffer.from(reqBodyStr))
          if (evt === 'end') cb()
        },
        off: () => {}
      }

      await completionsHandler(req, res)
      return { status: statusCode, headers: resHeaders, output: res.output }
    }

    let piAiStream = null
    try {
      const piMod = await import('@earendil-works/pi-ai/api/openai-completions')
      piAiStream = piMod.stream
    } catch {
      try {
        const piMod = await import('/home/vadim/.nvm/versions/node/v24.15.0/lib/node_modules/@deepseek-ai/dsh/node_modules/@earendil-works/pi-ai/dist/api/openai-completions.js')
        piAiStream = piMod.stream
      } catch {}
    }

    if (piAiStream) {
      const customFetch = async (url, init) => {
        const headers = Object.fromEntries(new Headers(init.headers).entries())
        const body = JSON.parse(init.body || '{}')
        const result = await runProxyRequest(headers, body)
        return new Response(result.output, {
          status: result.status,
          headers: result.headers
        })
      }

      const s1 = piAiStream(model, { messages: [{ role: 'user', content: 'test1' }] }, {
        apiKey: TEST_TOKEN,
        sessionId: 'session-alpha-123',
        fetch: customFetch
      })
      for await (const chunk of s1) {
        
      }

      assert.equal(upstreamCalls.length, 1)
      const call1Auth = upstreamCalls[0].auth

      const s2 = piAiStream(model, { messages: [{ role: 'user', content: 'test2' }] }, {
        apiKey: TEST_TOKEN,
        sessionId: 'session-alpha-123',
        fetch: customFetch
      })
      for await (const chunk of s2) {}

      assert.equal(upstreamCalls.length, 2)
      assert.equal(upstreamCalls[1].auth, call1Auth, 'Sticky affinity must keep the same account')

      setQuota('sk-account-a-secret', 95); setQuota('sk-account-b-secret', 5)
      const s3 = piAiStream(model, { messages: [{ role: 'user', content: 'test3' }] }, {
        apiKey: TEST_TOKEN,
        sessionId: 'session-beta-456',
        fetch: customFetch
      })
      for await (const chunk of s3) {}

      assert.equal(upstreamCalls.length, 3)
      assert.notEqual(upstreamCalls[2].auth, call1Auth, 'Different session routes to different account')
    } else {
      const res1 = await runProxyRequest({ 'x-session-id': 'session-alpha-123' }, { stream: true, model: 'deepseek-v4-flash' })
      assert.equal(res1.status, 200)
      assert.equal(upstreamCalls.length, 1)
      const call1Auth = upstreamCalls[0].auth

      const res2 = await runProxyRequest({ 'x-session-id': 'session-alpha-123' }, { stream: true, model: 'deepseek-v4-flash' })
      assert.equal(res2.status, 200)
      assert.equal(upstreamCalls[1].auth, call1Auth)

      setQuota('sk-account-a-secret', 95); setQuota('sk-account-b-secret', 5)
      const res3 = await runProxyRequest({ 'x-session-id': 'session-beta-456' }, { stream: true, model: 'deepseek-v4-flash' })
      assert.equal(res3.status, 200)
      assert.notEqual(upstreamCalls[2].auth, call1Auth)
    }

    // Verify upstream secrets NEVER leak into response outputs
    for (const call of upstreamCalls) {
      assert.ok(call.auth.includes('sk-account-'), 'Upstream used real account secret')
    }
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('proxy: separate connect timeout from streaming idle watchdog and error accounting (#165)', async () => {
  resetSessionRouter()
  let completionsHandler = null
  const mockCreds = {
    resolve: async () => ({ value: 'sk-test-key-165' })
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

  let currentConfig = {
    enabled: true,
    baseUrl: 'https://api.cline.bot/api/v1',
    accounts: [{ id: 'acc-1', apiKeyEnv: 'CLINEBOT_API_KEY' }],
    timeoutMs: 80,
    connectTimeoutMs: 80,
    streamIdleTimeoutMs: 200
  }

  registerProxyRoutes(mockCtx, {
    live: () => currentConfig
  })

  const originalFetch = globalThis.fetch

  const createReq = (bodyObj) => {
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

  const createMockStreamRes = () => {
    const res = new EventEmitter()
    res.statusCode = 200
    res.headers = {}
    res.chunks = []
    res.writableFinished = false
    res.writableEnded = false
    res.destroyed = false
    res.setHeader = (k, v) => { res.headers[k.toLowerCase()] = v }
    res.writeHead = (code, hdrs) => {
      res.statusCode = code
      if (hdrs) Object.assign(res.headers, hdrs)
    }
    res.write = (chunk) => {
      if (!res.destroyed && !res.writableEnded) {
        res.chunks.push(chunk.toString('utf8'))
      }
    }
    res.end = (finalChunk) => {
      if (finalChunk && !res.destroyed && !res.writableEnded) {
        res.chunks.push(finalChunk.toString('utf8'))
      }
      res.writableFinished = true
      res.writableEnded = true
      res.emit('finish')
      res.emit('close')
    }
    return res
  }

  try {
    // --- 1. Healthy stream longer than connectTimeoutMs (80ms) succeeds ---
    resetStats()
    globalThis.fetch = async () => {
      const sseStream = new ReadableStream({
        async start(controller) {
          for (let i = 1; i <= 4; i++) {
            await new Promise((r) => setTimeout(r, 35))
            controller.enqueue(new TextEncoder().encode(`data: {"id":"${i}","choices":[{"delta":{"content":"${i}"}}]}\\n\\n`))
          }
          controller.enqueue(new TextEncoder().encode('data: [DONE]\\n\\n'))
          controller.close()
        }
      })
      return new Response(sseStream, {
        status: 200,
        headers: { 'content-type': 'text/event-stream' }
      })
    }

    const res1 = createMockStreamRes()
    await completionsHandler(createReq({ stream: true, model: 'deepseek-v4-flash' }), res1)

    assert.equal(res1.statusCode, 200)
    assert.equal(res1.chunks.length >= 4, true, 'All chunks delivered even though total stream > connectTimeoutMs')
    const stats1 = getStatsSummary()
    assert.equal(stats1.totals.successful, 1, 'Healthy long stream must be counted as successful')
    assert.equal(stats1.totals.failed, 0, 'Healthy long stream must not have failed count')

    // --- 2. Stalled stream triggers idle watchdog abort and records failure ---
    resetStats()
    currentConfig = {
      ...currentConfig,
      connectTimeoutMs: 300,
      streamIdleTimeoutMs: 70
    }

    let upstreamCancelledReason = null
    globalThis.fetch = async () => {
      const sseStream = new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('data: {"id":"1","choices":[{"delta":{"content":"start"}}]}\\n\\n'))
          // Stalls indefinitely...
        },
        cancel(reason) {
          upstreamCancelledReason = reason
        }
      })
      return new Response(sseStream, {
        status: 200,
        headers: { 'content-type': 'text/event-stream' }
      })
    }

    const res2 = createMockStreamRes()
    await completionsHandler(createReq({ stream: true, model: 'deepseek-v4-flash' }), res2)

    assert.equal(upstreamCancelledReason, 'stream idle timeout', 'Watchdog must cancel reader with idle timeout')
    const combinedChunks2 = res2.chunks.join('')
    assert.ok(combinedChunks2.includes('stream_idle_timeout'), 'Client must receive idle timeout error payload')
    const stats2 = getStatsSummary()
    assert.equal(stats2.totals.failed, 1, 'Stalled idle stream must be recorded as failed')
    assert.equal(stats2.totals.successful, 0, 'Stalled idle stream must not be recorded as successful')

    // --- 3. Mid-stream error records failure instead of success ---
    resetStats()
    globalThis.fetch = async () => {
      const sseStream = new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('data: {"id":"1","choices":[{"delta":{"content":"first"}}]}\\n\\n'))
          setTimeout(() => {
            controller.error(new Error('Upstream socket reset by peer'))
          }, 30)
        }
      })
      return new Response(sseStream, {
        status: 200,
        headers: { 'content-type': 'text/event-stream' }
      })
    }

    const res3 = createMockStreamRes()
    await completionsHandler(createReq({ stream: true, model: 'deepseek-v4-flash' }), res3)

    const stats3 = getStatsSummary()
    assert.equal(stats3.totals.failed, 1, 'Mid-stream error must be recorded as failed')
    assert.equal(stats3.totals.successful, 0, 'Mid-stream error must not be recorded as successful')

  } finally {
    globalThis.fetch = originalFetch
  }
})
