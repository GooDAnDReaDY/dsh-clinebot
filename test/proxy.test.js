import test from 'node:test'
import assert from 'node:assert/strict'
import { registerProxyRoutes } from '../lib/routes/proxy.js'
import { resetSessionRouter, getSessionRouterStatus } from '../lib/session-router.js'

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

test('proxy: /v1/models returns OpenAI-compatible models format', async () => {
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

  const req = { method: 'GET', socket: { remoteAddress: '127.0.0.1' } }
  const res = createMockRes()

  await routeHandler(req, res)
  assert.equal(res.status, 200)
  assert.ok(res.json)
  assert.equal(res.json.object, 'list')
  assert.ok(Array.isArray(res.json.data))
  assert.ok(res.json.data.some(m => m.id === 'cline-pass/custom-llama'))
  assert.ok(res.json.data.some(m => m.id === 'cline-pass/deepseek-v4-flash'))
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
    headers: {},
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
  await completionsHandler({ method: 'POST', socket: { remoteAddress: '192.168.1.50' } }, resCompletions)
  assert.equal(resCompletions.status, 403)
  assert.equal(resCompletions.json?.error, 'Loopback access only')

  // 2. External IP on /v1/models
  const resModels = createMockRes()
  await modelsHandler({ method: 'GET', socket: { remoteAddress: '192.168.1.50' } }, resModels)
  assert.equal(resModels.status, 403)
  assert.equal(resModels.json?.error, 'Loopback access only')
})
