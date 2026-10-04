import test from 'node:test'
import http from 'node:http'
import assert from 'node:assert/strict'
import {
  startLoopbackProxyServer,
  stopLoopbackProxyServer,
  getProxyPort,
  detectHostWebServerFence,
  resetProxyServerState,
} from '../lib/proxy-server.js'
import { getLocalProxyToken, setLocalProxyToken, LOCAL_PROXY_KEY_ENV } from '../lib/proxy-token.js'
import { upsertPiAiProvider } from '../lib/provider-sync.js'

const TEST_TOKEN = 'test-proxy-server-token-99999'
setLocalProxyToken(TEST_TOKEN)

function makeMockCtx(cfg = {}) {
  const currentCfg = {
    enabled: true,
    proxyMode: true,
    apiKeyEnv: 'CLINEBOT_API_KEY',
    baseUrl: 'https://api.cline.bot/v1',
    accounts: [],
    ...cfg,
  }
  const mutated = []
  const mockCreds = {
    resolve: async () => ({ value: 'test-real-key' }),
    set: async () => {},
  }
  const mockSettings = {
    mutate: async (ns, ops) => {
      mutated.push({ ns, ops })
    },
  }
  return {
    ctx: {
      get: (name) => {
        if (name === 'credentials') return mockCreds
        if (name === 'settings') return mockSettings
        return null
      },
      logger: {
        info: () => {},
        warn: () => {},
      },
    },
    routeEnv: {
      live: () => currentCfg,
      getSettingsApi: () => ({ get: () => currentCfg }),
      syncProviderState: async () => {},
    },
    mutated,
  }
}

test('proxy-server: starts dedicated loopback server on ephemeral port and binds to 127.0.0.1', async (t) => {
  resetProxyServerState()
  t.after(async () => {
    await stopLoopbackProxyServer()
  })

  const { ctx, routeEnv } = makeMockCtx()
  const port = await startLoopbackProxyServer(ctx, routeEnv)
  assert.ok(typeof port === 'number' && port > 0, `Expected positive port number, got ${port}`)
  assert.equal(getProxyPort(), port, 'getProxyPort() must match returned port')

  // Concurrent call returns same port
  const secondCallPort = await startLoopbackProxyServer(ctx, routeEnv)
  assert.equal(secondCallPort, port, 'Concurrent call must return same active proxy port')
})

test('proxy-server: serves /dsh-clinebot/v1/models with bearer authentication', async (t) => {
  resetProxyServerState()
  t.after(async () => {
    await stopLoopbackProxyServer()
  })

  const { ctx, routeEnv } = makeMockCtx()
  const port = await startLoopbackProxyServer(ctx, routeEnv)

  // 1. Without auth header -> 401
  const resNoAuth = await fetch(`http://127.0.0.1:${port}/dsh-clinebot/v1/models`)
  assert.equal(resNoAuth.status, 401)

  // 2. With valid local proxy token -> 200
  const resAuth = await fetch(`http://127.0.0.1:${port}/dsh-clinebot/v1/models`, {
    headers: {
      Authorization: `Bearer ${TEST_TOKEN}`,
    },
  })
  assert.equal(resAuth.status, 200)
  const data = await resAuth.json()
  assert.equal(data.object, 'list')
  assert.ok(Array.isArray(data.data))

  // 3. Unknown endpoint -> 404
  const res404 = await fetch(`http://127.0.0.1:${port}/dsh-clinebot/v1/nonexistent`)
  assert.equal(res404.status, 404)
})

test('proxy-server: detectHostWebServerFence identifies 403 forbidden fence signature', async (t) => {
  // Spin up a mock server returning 403 forbidden
  const fencedServer = http.createServer((req, res) => {
    res.statusCode = 403
    res.setHeader('Content-Type', 'text/plain')
    res.end('forbidden')
  })

  const fencedPort = await new Promise((resolve) => {
    fencedServer.listen(0, '127.0.0.1', () => {
      resolve(fencedServer.address().port)
    })
  })
  t.after(() => {
    fencedServer.close()
  })

  const isFenced = await detectHostWebServerFence(fencedPort)
  assert.equal(isFenced, true, 'detectHostWebServerFence must return true for 403 forbidden')

  // Normal server returning 401 JSON should NOT be detected as fence
  const normalServer = http.createServer((req, res) => {
    res.statusCode = 401
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ ok: false, error: 'Unauthorized' }))
  })
  const normalPort = await new Promise((resolve) => {
    normalServer.listen(0, '127.0.0.1', () => {
      resolve(normalServer.address().port)
    })
  })
  t.after(() => {
    normalServer.close()
  })

  const isNormalFenced = await detectHostWebServerFence(normalPort)
  assert.equal(isNormalFenced, false, 'detectHostWebServerFence must return false for 401 unauthorized')

  // Non-listening port returns false
  const unusedPortFenced = await detectHostWebServerFence(59998)
  assert.equal(unusedPortFenced, false, 'detectHostWebServerFence must return false for unused port')
})

test('proxy-server: stopLoopbackProxyServer gracefully closes server', async () => {
  resetProxyServerState()
  const { ctx, routeEnv } = makeMockCtx()
  const port = await startLoopbackProxyServer(ctx, routeEnv)
  assert.ok(port > 0)

  await stopLoopbackProxyServer()
  assert.equal(getProxyPort(), null, 'getProxyPort() must be null after stopping')

  // Connection should be refused after stop
  await assert.rejects(
    () => fetch(`http://127.0.0.1:${port}/dsh-clinebot/v1/models`, { signal: AbortSignal.timeout(500) })
  )
})

test('proxy-server: upsertPiAiProvider uses dedicated loopback port when proxyMode: true', async (t) => {
  resetProxyServerState()
  t.after(async () => {
    await stopLoopbackProxyServer()
  })

  const { ctx, routeEnv, mutated } = makeMockCtx({ proxyMode: true })
  const port = await startLoopbackProxyServer(ctx, routeEnv)

  const cfg = {
    enabled: true,
    proxyMode: true,
    apiKeyEnv: 'CLINEBOT_API_KEY',
    baseUrl: 'https://api.cline.bot/v1',
  }
  const provider = await upsertPiAiProvider(ctx, cfg)
  assert.equal(provider.baseURL, `http://127.0.0.1:${port}/dsh-clinebot/v1`)
  assert.equal(provider.apiKeyEnv, LOCAL_PROXY_KEY_ENV)
  assert.equal(mutated.length, 1)
})

test('proxy-server: upsertPiAiProvider uses direct pub.baseUrl when proxyMode: false', async () => {
  resetProxyServerState()
  const { ctx, mutated } = makeMockCtx({ proxyMode: false })

  const cfg = {
    enabled: true,
    proxyMode: false,
    apiKeyEnv: 'CLINEBOT_API_KEY',
    baseUrl: 'https://api.cline.bot/v1',
  }
  const provider = await upsertPiAiProvider(ctx, cfg)
  assert.equal(provider.baseURL, 'https://api.cline.bot/v1')
  assert.equal(provider.apiKeyEnv, 'CLINEBOT_API_KEY')
  assert.equal(mutated.length, 1)
})

test('proxy-server: upsertPiAiProvider falls back to direct pub.baseUrl when host webServer is fenced and dedicated server is unavailable', async (t) => {
  resetProxyServerState()

  // Simulate fenced host webServer
  const fencedServer = http.createServer((req, res) => {
    res.statusCode = 403
    res.setHeader('Content-Type', 'text/plain')
    res.end('forbidden')
  })
  const fencedPort = await new Promise((resolve) => {
    fencedServer.listen(0, '127.0.0.1', () => {
      resolve(fencedServer.address().port)
    })
  })
  t.after(() => {
    fencedServer.close()
  })

  const { ctx } = makeMockCtx({ proxyMode: true })
  // Attach fenced port to ctx.webServer
  ctx.webServer = { port: fencedPort }

  const cfg = {
    enabled: true,
    proxyMode: true,
    apiKeyEnv: 'CLINEBOT_API_KEY',
    baseUrl: 'https://api.cline.bot/v1',
  }

  // Dedicated server is NOT running (getProxyPort() === null)
  assert.equal(getProxyPort(), null)

  const provider = await upsertPiAiProvider(ctx, cfg)
  // Must fall back to pub.baseUrl due to fence detection!
  assert.equal(provider.baseURL, 'https://api.cline.bot/v1', 'Must fall back to direct baseUrl when fence detected')
  assert.equal(provider.apiKeyEnv, 'CLINEBOT_API_KEY', 'Must use direct apiKeyEnv when falling back')
})
