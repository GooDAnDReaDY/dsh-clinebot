import test from 'node:test'
import assert from 'node:assert/strict'
import { Readable } from 'node:stream'
import { registerAccountsRoutes } from '../lib/routes/accounts.js'

function makeHarness({ failSettings = false } = {}) {
  const routes = []
  const secrets = new Map()
  let current = {
    enabled: true,
    baseUrl: 'http://127.0.0.1:1',
    apiKeyEnv: 'CLINEBOT_API_KEY',
    defaultModel: 'cline-pass/deepseek-v4.1-flash',
    accounts: [],
    activeAccount: '',
    dynamicModels: [],
    modelContextOverrides: [],
    customModels: [],
    disabledModels: [],
    visibleModels: [],
    filterModelsByPlan: true,
    modelReasoningDefaults: {},
    modelRoutes: {},
    timeoutMs: 1000,
    smokeTimeoutMs: 1000,
    streamIdleTimeoutMs: 1000,
    maxPayloadMb: 40,
    maxOutputTokens: -1,
  }
  const credentials = {
    resolve: async (ref) => ({ value: secrets.get(ref?.name || ref) || '' }),
    set: async (ref, value) => { secrets.set(ref?.name || ref, value) },
    unset: async (ref) => { secrets.delete(ref?.name || ref) },
  }
  const ctx = {
    effect: (fn) => fn(),
    webServer: { register: (route) => { routes.push(route); return () => {} } },
    get: (name) => (name === 'credentials' ? credentials : undefined),
    logger: { warn() {} },
  }
  let failOnce = failSettings
  registerAccountsRoutes(ctx, {
    live: () => current,
    getSettingsApi: () => ({
      replace: async (next) => {
        await new Promise((resolve) => setTimeout(resolve, 5))
        if (failOnce) { failOnce = false; throw new Error('synthetic persistence failure') }
        current = next
      },
    }),
    syncProviderState: async () => {},
  })
  const handler = () => routes.find((route) => route.path === '/dsh-clinebot/accounts').handler
  return { getCurrent: () => current, secrets, handler: handler() }
}

function request(body) {
  const req = Readable.from([Buffer.from(JSON.stringify(body))])
  req.method = 'POST'
  req.headers = { host: '127.0.0.1:3080', origin: 'http://127.0.0.1:3080' }
  req.socket = { remoteAddress: '127.0.0.1' }
  return req
}

function response() {
  let status = 200
  let body = null
  return {
    res: {
      writeHead: (code) => { status = code },
      end: (data) => { try { body = JSON.parse(data) } catch { body = data } },
    },
    status: () => status,
    body: () => body,
  }
}

test('accounts: concurrent additions do not share an env or lose credentials (#274)', async () => {
  const harness = makeHarness()
  const first = response()
  const second = response()
  await Promise.all([
    harness.handler(request({ apiKey: 'key-a' }), first.res),
    harness.handler(request({ apiKey: 'key-b' }), second.res),
  ])
  assert.equal(first.status(), 200)
  assert.equal(second.status(), 200)
  const envs = harness.getCurrent().accounts.map((account) => account.apiKeyEnv)
  assert.deepEqual(envs.sort(), ['CLINEBOT_API_KEY_1', 'CLINEBOT_API_KEY_2'])
  assert.equal(harness.secrets.get('CLINEBOT_API_KEY_1'), 'key-a')
  assert.equal(harness.secrets.get('CLINEBOT_API_KEY_2'), 'key-b')
})

test('accounts: failed settings persistence rolls the new credential back (#272)', async () => {
  const harness = makeHarness({ failSettings: true })
  const result = response()
  await harness.handler(request({ apiKey: 'key-a' }), result.res)
  assert.equal(result.status(), 500)
  assert.equal(harness.getCurrent().accounts.length, 0)
  assert.equal(harness.secrets.has('CLINEBOT_API_KEY_1'), false)
})
