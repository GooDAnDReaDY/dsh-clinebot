import test from 'node:test'
import assert from 'node:assert/strict'
import { registerSettingsRoutes } from '../lib/routes/settings.js'
import { registerModelsRoutes } from '../lib/routes/models.js'
import { registerAuthRoutes } from '../lib/routes/auth.js'
import { publicUsage } from '../lib/http.js'
import { publicConfig, plainConfig } from '../lib/config.js'
import { smokeChat } from '../lib/cline-client.js'
import { Readable } from 'node:stream'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../', import.meta.url))

function capture(register, { credentials = { set: async () => true }, liveConfig = {} } = {}) {
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
    live: () => ({ enabled: true, accounts: [], dynamicModels: [], ...liveConfig }),
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

test('GET status, config, usage, and key verify reject an untrusted client', async () => {
  const cases = [
    [registerSettingsRoutes, '/dsh-clinebot/status'],
    [registerSettingsRoutes, '/dsh-clinebot/config'],
    [registerModelsRoutes, '/dsh-clinebot/usage'],
    [registerAuthRoutes, '/dsh-clinebot/key/verify'],
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

test('POST /dsh-clinebot/key/verify rejects non-POST and validates key payload', async () => {
  const handler = capture(registerAuthRoutes).find((route) => route.path === '/dsh-clinebot/key/verify').handler
  // 1. GET returns 405
  const getOut = respond()
  await handler(local, getOut.res)
  assert.equal(getOut.read().status, 405)

  // 2. Remote IP returns 403
  const remoteOut = respond()
  await handler({ method: 'POST', headers: {}, socket: { remoteAddress: '203.0.113.10' } }, remoteOut.res)
  assert.equal(remoteOut.read().status, 403)

  // 3. Empty key returns 400
  const emptyReq = {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    socket: { remoteAddress: '127.0.0.1' },
    [Symbol.asyncIterator]: async function* () {
      yield Buffer.from(JSON.stringify({ key: '' }))
    },
  }
  const emptyOut = respond()
  await handler(emptyReq, emptyOut.res)
  assert.equal(emptyOut.read().status, 400)
  assert.equal(emptyOut.read().body.valid, false)
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

test('POST /save-key accepts valid targetEnvName matching CLINEBOT_API_KEY pattern when in accounts pool', async () => {
  const handler = capture(registerSettingsRoutes, {
    liveConfig: { accounts: [{ label: 'Secondary', apiKeyEnv: 'CLINEBOT_API_KEY_SECONDARY' }] }
  }).find((route) => route.path === '/dsh-clinebot/save-key').handler
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

test('POST /save-key rejects disallowed apiKeyEnv even if forged into accounts', async () => {
  const handler = capture(registerSettingsRoutes, {
    liveConfig: { accounts: [{ label: 'Forged', apiKeyEnv: 'OPENAI_API_KEY' }] }
  }).find((route) => route.path === '/dsh-clinebot/save-key').handler
  const req = Readable.from([Buffer.from(JSON.stringify({ apiKey: 'test-key', apiKeyEnv: 'OPENAI_API_KEY' }))])
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

test('POST /dsh-clinebot/key/verify rejects insecure remote http baseUrl', async () => {
  const handler = capture(registerAuthRoutes, {
    liveConfig: { baseUrl: 'http://insecure-remote.com/api/v1' }
  }).find((route) => route.path === '/dsh-clinebot/key/verify').handler
  const req = Readable.from([Buffer.from(JSON.stringify({ key: 'valid-test-key-string' }))])
  req.method = 'POST'
  req.headers = { host: '127.0.0.1:3000', origin: 'http://127.0.0.1:3000' }
  req.socket = { remoteAddress: '127.0.0.1' }

  const out = respond()
  await handler(req, out.res)
  const payload = out.read()
  assert.equal(payload.status, 400)
  assert.equal(payload.body.ok, false)
  assert.match(payload.body.error, /Insecure baseUrl/)
})

test('smokeChat rejects insecure remote http baseUrl', async () => {
  const result = await smokeChat('http://insecure-api.cline.bot/api/v1', 'some-key')
  assert.equal(result.ok, false)
  assert.match(result.error, /Insecure protocol/)
})

test('PUT /config behavior: 405, 403, 503, 400 (unknown / enabledModels), and 200 success', async () => {
  let replacedWith = null
  let settingsAvailable = true
  const settingsApi = {
    replace: async (val) => { replacedWith = val },
  }
  const handlers = []
  const ctx = {
    effect: (fn) => fn(),
    webServer: { register: (r) => handlers.push(r) },
  }
  registerSettingsRoutes(ctx, {
    live: () => ({ enabled: true, disabledModels: [], dynamicModels: [{ id: 'm1' }] }),
    getSettingsApi: () => settingsAvailable ? settingsApi : null,
    syncProviderState: async () => {},
    triggerAutoDiscover: () => {},
  })

  const handler = handlers.find((r) => r.path === '/dsh-clinebot/config').handler

  // 1. Method not allowed (POST -> 405)
  const req405 = Readable.from([])
  req405.method = 'POST'
  req405.headers = { host: '127.0.0.1:3000', origin: 'http://127.0.0.1:3000' }
  req405.socket = { remoteAddress: '127.0.0.1' }
  const out405 = respond()
  await handler(req405, out405.res)
  assert.equal(out405.read().status, 405)

  // 2. Untrusted client (remote IP -> 403)
  const req403 = Readable.from([Buffer.from(JSON.stringify({ defaultModel: 'cline-pass/deepseek-v4-pro' }))])
  req403.method = 'PUT'
  req403.headers = {}
  req403.socket = { remoteAddress: '203.0.113.10' }
  const out403 = respond()
  await handler(req403, out403.res)
  assert.equal(out403.read().status, 403)

  // 3. Settings service unavailable -> 503
  settingsAvailable = false
  const req503 = Readable.from([Buffer.from(JSON.stringify({ defaultModel: 'cline-pass/deepseek-v4-pro' }))])
  req503.method = 'PUT'
  req503.headers = { host: '127.0.0.1:3000', origin: 'http://127.0.0.1:3000' }
  req503.socket = { remoteAddress: '127.0.0.1' }
  const out503 = respond()
  await handler(req503, out503.res)
  assert.equal(out503.read().status, 503)
  settingsAvailable = true

  // 4. Invalid JSON -> 400
  const reqInvalidJson = Readable.from([Buffer.from('not json{')])
  reqInvalidJson.method = 'PUT'
  reqInvalidJson.headers = { host: '127.0.0.1:3000', origin: 'http://127.0.0.1:3000' }
  reqInvalidJson.socket = { remoteAddress: '127.0.0.1' }
  const outInvalidJson = respond()
  await handler(reqInvalidJson, outInvalidJson.res)
  assert.equal(outInvalidJson.read().status, 400)

  // 5. Unknown fields -> 400
  const reqUnknown = Readable.from([Buffer.from(JSON.stringify({ maliciousOrUnknown: 'bad' }))])
  reqUnknown.method = 'PUT'
  reqUnknown.headers = { host: '127.0.0.1:3000', origin: 'http://127.0.0.1:3000' }
  reqUnknown.socket = { remoteAddress: '127.0.0.1' }
  const outUnknown = respond()
  await handler(reqUnknown, outUnknown.res)
  assert.equal(outUnknown.read().status, 400)
  assert.match(outUnknown.read().body.error, /unknown config field/)

  // 6. Deprecated enabledModels rejected -> 400
  const reqEnabledModels = Readable.from([Buffer.from(JSON.stringify({ enabledModels: ['old-model'] }))])
  reqEnabledModels.method = 'PUT'
  reqEnabledModels.headers = { host: '127.0.0.1:3000', origin: 'http://127.0.0.1:3000' }
  reqEnabledModels.socket = { remoteAddress: '127.0.0.1' }
  const outEnabledModels = respond()
  await handler(reqEnabledModels, outEnabledModels.res)
  assert.equal(outEnabledModels.read().status, 400)
  assert.match(outEnabledModels.read().body.error, /enabledModels is deprecated/)

  // 7. Success with valid payload -> 200
  const req200 = Readable.from([Buffer.from(JSON.stringify({ defaultModel: 'cline-pass/deepseek-v4-pro', timeoutMs: 12000 }))])
  req200.method = 'PUT'
  req200.headers = { host: '127.0.0.1:3000', origin: 'http://127.0.0.1:3000' }
  req200.socket = { remoteAddress: '127.0.0.1' }
  const out200 = respond()
  await handler(req200, out200.res)
  assert.equal(out200.read().status, 200)
  const plainReplaced = plainConfig(replacedWith)
  assert.equal(plainReplaced.defaultModel, 'cline-pass/deepseek-v4-pro')
  assert.equal(plainReplaced.timeoutMs, 12000)
})

test('apply() returns undefined and does not produce Invalid effect in Cordis', async () => {
  const { apply } = await import('../lib/index.js')
  const ctx = {
    inject: () => {},
    effect: (fn) => fn(),
    on: () => () => {},
    logger: { info: () => {}, warn: () => {} },
  }
  const result = apply(ctx, {})
  assert.equal(result, undefined, 'apply() must return undefined to prevent Cordis 4 Invalid effect')
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



test('settings: handleConfigPatch uses PUT /config to persist customModels and reasoning defaults (#156)', async () => {
  const clientSrc = readFileSync(path.join(root, 'src', 'client', 'settings-page.js'), 'utf8')
  const clientBundle = readFileSync(path.join(root, 'lib', 'client.js'), 'utf8')

  // 1. Static assertion: handleConfigPatch must use PUT, not POST
  assert.ok(clientSrc.includes("method: 'PUT'"), 'settings-page.js handleConfigPatch must use PUT')
  assert.ok(!clientSrc.includes("method: 'POST',\n        headers: { 'Content-Type': 'application/json' },\n        body: JSON.stringify(patch)"), 'Must not send POST /config')
  assert.ok(clientBundle.includes("method: 'PUT'"), 'lib/client.js bundle must use PUT')

  // 2. Integration: route accepts PUT /config with customModels and modelReasoningDefaults
  let persistedConfig = null
  let currentLiveConfig = {
    enabled: true,
    customModels: [],
    modelReasoningDefaults: {}
  }
  const settingsApi = {
    replace: async (val) => { persistedConfig = val; currentLiveConfig = val }
  }
  const handlers = []
  const ctx = {
    effect: (fn) => fn(),
    webServer: { register: (r) => handlers.push(r) },
  }
  registerSettingsRoutes(ctx, {
    live: () => currentLiveConfig,
    getSettingsApi: () => settingsApi,
    syncProviderState: async () => {},
    triggerAutoDiscover: () => {},
  })
  const handler = handlers.find((r) => r.path === '/dsh-clinebot/config').handler

  // Add custom model via PUT
  const customModelsPatch = {
    customModels: [{
      id: 'custom-deepseek-coder',
      name: 'Custom DeepSeek Coder',
      contextLength: 128000,
      maxTokens: 8192,
      category: 'coding',
      isCustom: true
    }]
  }
  const req1 = Readable.from([Buffer.from(JSON.stringify({ config: customModelsPatch }))])
  req1.method = 'PUT'
  req1.headers = { host: '127.0.0.1:3000', origin: 'http://127.0.0.1:3000' }
  req1.socket = { remoteAddress: '127.0.0.1' }
  const out1 = respond()
  await handler(req1, out1.res)
  assert.equal(out1.read().status, 200)
  assert.equal(persistedConfig.customModels.length, 1)
  assert.equal(persistedConfig.customModels[0].id, 'custom-deepseek-coder')

  // Update reasoning defaults via PUT
  const reasoningPatch = {
    modelReasoningDefaults: {
      'custom-deepseek-coder': 'high'
    }
  }
  const req2 = Readable.from([Buffer.from(JSON.stringify({ config: reasoningPatch }))])
  req2.method = 'PUT'
  req2.headers = { host: '127.0.0.1:3000', origin: 'http://127.0.0.1:3000' }
  req2.socket = { remoteAddress: '127.0.0.1' }
  const out2 = respond()
  await handler(req2, out2.res)
  assert.equal(out2.read().status, 200)
  assert.equal(persistedConfig.modelReasoningDefaults['custom-deepseek-coder'], 'high')
  // Ensure customModels from previous step was preserved
  assert.equal(persistedConfig.customModels.length, 1)
})
