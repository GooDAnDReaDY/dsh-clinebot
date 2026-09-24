import test from 'node:test'
import assert from 'node:assert/strict'
import { registerSettingsRoutes } from '../lib/routes/settings.js'
import { registerModelsRoutes } from '../lib/routes/models.js'
import { registerAuthRoutes } from '../lib/routes/auth.js'
import { publicUsage } from '../lib/http.js'

function capture(register) {
  const handlers = []
  const ctx = {
    effect: (fn) => fn(),
    webServer: {
      register: (route) => {
        handlers.push(route)
        return () => {}
      },
    },
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
