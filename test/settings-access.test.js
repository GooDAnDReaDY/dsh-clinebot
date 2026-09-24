import test from 'node:test'
import assert from 'node:assert/strict'
import { registerSettingsRoutes } from '../lib/routes/settings.js'
import { registerModelsRoutes } from '../lib/routes/models.js'
import { registerAuthRoutes } from '../lib/routes/auth.js'
import { publicUsage } from '../lib/http.js'
import { publicConfig } from '../lib/config.js'
import { smokeChat } from '../lib/cline-client.js'
import { Readable } from 'node:stream'

function capture(register, { credentials = { set: async () => true } } = {}) {
  const handlers = []
  const ctx = {
    effect: (fn) => fn(),
    webServer: {
      register: (route) => {
        handlers.push(route)
        return () => {}
      },
    },
    credentials,
  }
  register(ctx, {
    live: () => ({ enabled: true, accounts: [], dynamicModels: [] }),
    getSettingsApi: () => null,
    syncProviderState: async () => {},
    triggerAutoDiscover: () => {},
  })
  return handlers
}

function respond() {
  let status = 0
  let body = ''
  return {
    res: {
      writeHead: (code) => { status = code },
      end: (payload) => { body = payload },
    },
    read: () => ({ status, body: body ? JSON.parse(body) : null }),
  }
}

const remote = { method: 'GET', headers: {}, socket: { remoteAddress: '203.0.113.10' } }
const local = { method: 'GET', headers: {}, socket: { remoteAddress: '127.0.0.1' } }

test('GET status, config, usage, and auth status reject an untrusted client', async () => {
  const cases = [
    [registerSettingsRoutes, '/dsh-clinebot/status'],
    [registerSettingsRoutes, '/dsh-clinebot/config'],
    [registerModelsRoutes, '/dsh-clinebot/usage'],
    [registerAuthRoutes, '/dsh-clinebot/auth/status'],
  ]
  for (const [register, path] of cases) {
    const handler = capture(register).find((route) => route.path === path).handler
    const out = respond()
    await handler(remote, out.res)
    const payload = out.read()
    assert.equal(payload.status, 403, path)
    assert.equal(JSON.stringify(payload.body).includes('sk-'), false)
  }
})

test('GET config from loopback returns public config without a key value', async () => {
  const handler = capture(registerSettingsRoutes).find((route) => route.path === '/dsh-clinebot/config').handler
  const out = respond()
  await handler(local, out.res)
  const payload = out.read()
  assert.equal(payload.status, 200)
  assert.equal(typeof payload.body.config.apiKeyEnv, 'string')
  assert.equal(Object.hasOwn(payload.body.config, 'apiKey'), false)
  assert.equal(Object.hasOwn(payload.body.config, 'value'), false)
})

test('GET auth status from loopback reports idle', async () => {
  const handler = capture(registerAuthRoutes).find((route) => route.path === '/dsh-clinebot/auth/status').handler
  const out = respond()
  await handler(local, out.res)
  const payload = out.read()
  assert.equal(payload.status, 200)
  assert.equal(payload.body.status, 'idle')
})

test('publicUsage keeps quota fields and drops account timestamps and plan models', () => {
  const view = publicUsage({
    ok: true,
    plan: 'Example',
    user: { email: 'user@example.com', createdAt: '2020-01-01' },
    windows: { fiveHour: { percentUsed: 10, remainingPercent: 90, resetsAt: 'later', extra: true } },
    dynamicModels: [{ id: 'secret-model' }],
    checkedAt: 1,
  })
  assert.equal(view.user.email, 'user@example.com')
  assert.equal(Object.hasOwn(view.user, 'createdAt'), false)
  assert.equal(view.windows.fiveHour.percentUsed, 10)
  assert.equal(Object.hasOwn(view.windows.fiveHour, 'extra'), false)
  assert.equal(Object.hasOwn(view, 'dynamicModels'), false)
})

test('POST /save-key rejects disallowed targetEnvName', async () => {
  const handler = capture(registerSettingsRoutes).find((route) => route.path === '/dsh-clinebot/save-key').handler
  const req = Readable.from([Buffer.from(JSON.stringify({ apiKey: 'test-key', apiKeyEnv: 'AWS_SECRET_ACCESS_KEY' }))])
  req.method = 'POST'
  req.headers = { host: '127.0.0.1:3000', origin: 'http://127.0.0.1:3000' }
  req.socket = { remoteAddress: '127.0.0.1' }

  const out = respond()
  await handler(req, out.res)
  const payload = out.read()
  assert.equal(payload.status, 400)
  assert.equal(payload.body.ok, false)
  assert.match(payload.body.error, /Disallowed apiKeyEnv/)
})

test('POST /save-key accepts valid targetEnvName matching CLINEBOT_API_KEY pattern', async () => {
  const handler = capture(registerSettingsRoutes).find((route) => route.path === '/dsh-clinebot/save-key').handler
  const req = Readable.from([Buffer.from(JSON.stringify({ apiKey: 'test-key', apiKeyEnv: 'CLINEBOT_API_KEY_SECONDARY' }))])
  req.method = 'POST'
  req.headers = { host: '127.0.0.1:3000', origin: 'http://127.0.0.1:3000' }
  req.socket = { remoteAddress: '127.0.0.1' }

  const out = respond()
  await handler(req, out.res)
  const payload = out.read()
  assert.equal(payload.status, 200)
  assert.equal(payload.body.ok, true)
  assert.equal(payload.body.envName, 'CLINEBOT_API_KEY_SECONDARY')
})

test('smokeChat rejects insecure remote http baseUrl', async () => {
  const result = await smokeChat('http://insecure-api.cline.bot/api/v1', 'some-key')
  assert.equal(result.ok, false)
  assert.match(result.error, /Insecure protocol/)
})

test('PUT /config strips enabledModels before persisting to settingsApi', async () => {
  let replacedWith = null
  const settingsApi = {
    replace: async (val) => { replacedWith = val },
  }
  const handlers = []
  const ctx = {
    effect: (fn) => fn(),
    webServer: { register: (r) => handlers.push(r) },
  }
  registerSettingsRoutes(ctx, {
    live: () => ({ enabled: true, disabledModels: [], enabledModels: ['old-model'], dynamicModels: [] }),
    getSettingsApi: () => settingsApi,
    syncProviderState: async () => {},
    triggerAutoDiscover: () => {},
  })

  const handler = handlers.find((r) => r.path === '/dsh-clinebot/config').handler
  const req = Readable.from([Buffer.from(JSON.stringify({ defaultModel: 'cline-pass/deepseek-v4-pro', enabledModels: ['old-model'] }))])
  req.method = 'PUT'
  req.headers = { host: '127.0.0.1:3000', origin: 'http://127.0.0.1:3000' }
  req.socket = { remoteAddress: '127.0.0.1' }

  const out = respond()
  await handler(req, out.res)
  const payload = out.read()
  assert.equal(payload.status, 200)
  assert.equal(replacedWith.enabledModels.length, 0, 'enabledModels should not be persisted')
})

test('publicConfig enables newly discovered dynamic models by default when disabledModels is empty', async () => {
  const cfg = {
    disabledModels: [],
    dynamicModels: [
      { id: 'cline-pass/new-model-v2', name: 'New Model V2' },
    ],
  }
  const pub = publicConfig(cfg)
  assert.ok(pub.enabledModels.includes('cline-pass/new-model-v2'), 'New dynamic model must be enabled by default')
})


