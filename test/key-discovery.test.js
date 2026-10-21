import test from 'node:test'
import assert from 'node:assert/strict'
import { Readable } from 'node:stream'
import {
  discoverLocalClineKeys,
  consumeDiscoveredKey,
  maskApiKey,
} from '../lib/key-discovery.js'
import { registerAccountsRoutes } from '../lib/routes/accounts.js'
import { Config, plainConfig } from '../lib/config.js'

function createReq({ method = 'GET', url = '/', body = null, remote = '127.0.0.1', untrusted = false } = {}) {
  const chunks = body ? [Buffer.from(typeof body === 'string' ? body : JSON.stringify(body))] : []
  const req = Readable.from(chunks)
  req.method = method
  req.url = url
  if (untrusted) {
    req.headers = { host: 'internal-hub:3000', origin: 'http://evil-attacker.com' }
    req.socket = { remoteAddress: '203.0.113.10' }
  } else {
    req.headers = { host: '127.0.0.1:3000', origin: 'http://127.0.0.1:3000', 'content-type': 'application/json' }
    req.socket = { remoteAddress: remote }
  }
  return req
}

function createRes() {
  let status = 0
  let body = ''
  return {
    res: {
      writeHead: (code) => { status = code },
      end: (payload) => { body = payload || '' },
    },
    read: () => ({ status, body: body ? JSON.parse(body) : null }),
  }
}

function setupMockAccountsApp() {
  const routes = new Map()
  const credsStore = new Map()
  let liveConfig = plainConfig(Config({
    apiKeyEnv: 'CLINEBOT_API_KEY',
    accounts: [{ label: 'Primary', apiKeyEnv: 'CLINEBOT_API_KEY' }],
  }))

  const mockCtx = {
    webServer: {
      register: ({ path, handler }) => {
        routes.set(path, handler)
      },
    },
    effect: (fn) => fn(),
    credentials: {
      set: async (ref, val) => {
        const name = typeof ref === 'object' ? ref.name : ref
        credsStore.set(name, val)
      },
      unset: async (ref) => {
        const name = typeof ref === 'object' ? ref.name : ref
        credsStore.delete(name)
        return true
      },
      resolve: async (ref) => {
        const name = typeof ref === 'object' ? ref.name : ref
        return credsStore.has(name) ? { value: credsStore.get(name) } : null
      },
    },
    get: (svc) => (svc === 'credentials' ? mockCtx.credentials : null),
  }

  const mockSettingsApi = {
    replace: async (val) => {
      liveConfig = val
    },
  }

  registerAccountsRoutes(mockCtx, {
    live: () => liveConfig,
    syncProviderState: async () => {},
    getSettingsApi: () => mockSettingsApi,
  })

  return { routes, credsStore, getLive: () => liveConfig }
}

test('key-discovery: detects environment variable without leaking raw secret in output (#246)', () => {
  const origEnv = process.env.CLINE_API_KEY
  try {
    const rawSecret = 'cline_test_1234567890abcdef'
    process.env.CLINE_API_KEY = rawSecret
    const discovered = discoverLocalClineKeys()
    assert.ok(Array.isArray(discovered))
    assert.ok(discovered.length > 0)

    const envHit = discovered.find((d) => d.maskedKey === 'cline_te••••cdef')
    assert.ok(envHit, 'Should find key by maskedKey')
    assert.ok(envHit.id, 'Must contain an opaque id')
    assert.equal(envHit.key, undefined, 'CRITICAL: item.key must NOT be exposed')
    assert.ok(envHit.source.includes('Environment'))

    // Assert that serialized JSON does not contain the raw secret
    const serialized = JSON.stringify(discovered)
    assert.ok(!serialized.includes(rawSecret), 'Raw secret must never appear in serialized JSON')

    // Secret must be consumed by id and never returned in the public list.
    assert.equal(consumeDiscoveredKey(envHit.id), rawSecret)
    assert.equal(consumeDiscoveredKey(envHit.id), null, 'Key must be consumed only once')
  } finally {
    if (origEnv !== undefined) {
      process.env.CLINE_API_KEY = origEnv
    } else {
      delete process.env.CLINE_API_KEY
    }
  }
})

test('key-discovery: returns clean array without crashing on non-existent directories', () => {
  const discovered = discoverLocalClineKeys()
  assert.ok(Array.isArray(discovered))
  for (const item of discovered) {
    assert.ok(typeof item.source === 'string')
    assert.ok(typeof item.id === 'string')
    assert.ok(typeof item.maskedKey === 'string')
    assert.equal(item.key, undefined, 'item.key must be undefined')
  }
})

test('key-discovery: route GET /keys/discovered does not leak raw secrets (#246)', async () => {
  const origEnv = process.env.CLINE_API_KEY
  try {
    const rawSecret = 'cline_top_secret_discovery_key_9999'
    process.env.CLINE_API_KEY = rawSecret

    const { routes } = setupMockAccountsApp()
    const handler = routes.get('/dsh-clinebot/keys/discovered')
    assert.ok(handler, 'GET /dsh-clinebot/keys/discovered handler must be registered')

    const req = createReq({ method: 'GET', url: '/dsh-clinebot/keys/discovered' })
    const { res, read } = createRes()
    await handler(req, res)

    const { status, body } = read()
    assert.equal(status, 200)
    assert.equal(body.ok, true)
    assert.ok(Array.isArray(body.discovered))

    const found = body.discovered.find((k) => k.maskedKey === maskApiKey(rawSecret))
    assert.ok(found, 'Discovered list must include the masked key')
    assert.ok(found.id, 'Must contain opaque id')
    assert.equal(found.key, undefined, 'item.key must NOT be present in HTTP response')

    const rawResponse = JSON.stringify(body)
    assert.ok(!rawResponse.includes(rawSecret), 'HTTP response body must not contain the raw secret')
  } finally {
      if (origEnv !== undefined) {
      process.env.CLINE_API_KEY = origEnv
    } else {
      delete process.env.CLINE_API_KEY
    }
  }
})

test('key-discovery: route POST /keys/discovered/import safely imports key by id (#246)', async () => {
  const origEnv = process.env.CLINE_API_KEY
  try {
    const rawSecret = 'cline_importable_secret_key_8888'
    process.env.CLINE_API_KEY = rawSecret

    const { routes, credsStore, getLive } = setupMockAccountsApp()
    const getHandler = routes.get('/dsh-clinebot/keys/discovered')
    const importHandler = routes.get('/dsh-clinebot/keys/discovered/import')
    assert.ok(importHandler, 'POST /dsh-clinebot/keys/discovered/import handler must be registered')

    // 1. Get discovered keys to obtain opaque id
    const getReq = createReq({ method: 'GET', url: '/dsh-clinebot/keys/discovered' })
    const getRes = createRes()
    await getHandler(getReq, getRes.res)
    const { body: getBody } = getRes.read()
    const hit = getBody.discovered.find((k) => k.maskedKey === maskApiKey(rawSecret))
    assert.ok(hit?.id)

    // 2. Import by id without sending rawSecret
    const importReq = createReq({
      method: 'POST',
      url: '/dsh-clinebot/keys/discovered/import',
      body: { id: hit.id, label: 'Discovered CLI Key', apiKeyEnv: 'CLINEBOT_API_KEY_2' },
    })
    const importRes = createRes()
    await importHandler(importReq, importRes.res)

    const { status, body } = importRes.read()
    assert.equal(status, 200)
    assert.equal(body.ok, true)
    assert.equal(body.account.apiKeyEnv, 'CLINEBOT_API_KEY_2')
    assert.equal(body.account.label, 'Discovered CLI Key')

    // Verify credential store received the secret without browser ever possessing it
    assert.equal(credsStore.get('CLINEBOT_API_KEY_2'), rawSecret)

    // Verify config now contains the new account
    const accounts = getLive().accounts
    assert.ok(accounts.some((a) => a.apiKeyEnv === 'CLINEBOT_API_KEY_2'))

    // 3. Second import attempt with same id should fail (already consumed)
    const retryReq = createReq({
      method: 'POST',
      url: '/dsh-clinebot/keys/discovered/import',
      body: { id: hit.id },
    })
    const retryRes = createRes()
    await importHandler(retryReq, retryRes.res)
    assert.equal(retryRes.read().status, 404)
  } finally {
      if (origEnv !== undefined) {
      process.env.CLINE_API_KEY = origEnv
    } else {
      delete process.env.CLINE_API_KEY
    }
  }
})

test('key-discovery: route POST /keys/discovered/import rejects missing id and untrusted requests (#246)', async () => {
  const { routes } = setupMockAccountsApp()
  const importHandler = routes.get('/dsh-clinebot/keys/discovered/import')

  // Missing id -> 400
  const req400 = createReq({ method: 'POST', url: '/dsh-clinebot/keys/discovered/import', body: {} })
  const res400 = createRes()
  await importHandler(req400, res400.res)
  assert.equal(res400.read().status, 400)

  // Untrusted request -> 403
  const req403 = createReq({
    method: 'POST',
    url: '/dsh-clinebot/keys/discovered/import',
    body: { id: 'some-id' },
    untrusted: true,
  })
  const res403 = createRes()
  await importHandler(req403, res403.res)
  assert.equal(res403.read().status, 403)
})