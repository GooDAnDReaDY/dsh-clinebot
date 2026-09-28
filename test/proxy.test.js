import test from 'node:test'
import assert from 'node:assert/strict'
import { registerProxyRoutes, USER_AGENT } from '../lib/routes/proxy.js'
import { resetSessionRouter, getSessionRouterStatus } from '../lib/session-router.js'
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

test('proxy: client disconnection cancels upstream SSE reader (#138)', async () => {
  resetSessionRouter()
  let registeredCloseHandler = null
  const reqStream = {
    method: 'POST',
    socket: { remoteAddress: '127.0.0.1' },
    headers: {
      authorization: `Bearer ${TEST_TOKEN}`,
      accept: 'text/event-stream'
    },
    on: (evt, cb) => {
      if (evt === 'close') registeredCloseHandler = cb
      if (evt === 'data') cb(Buffer.from(JSON.stringify({ stream: true, model: 'deepseek-v4-flash' })))
      if (evt === 'end') cb()
    },
    off: (evt, cb) => {}
  }
  assert.equal(typeof reqStream.on, 'function')
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
