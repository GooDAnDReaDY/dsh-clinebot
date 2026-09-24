import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { Readable } from 'node:stream'
import path from 'node:path'
import vm from 'node:vm'

import { registerSettingsRoutes } from '../lib/routes/settings.js'
import { registerAccountsRoutes } from '../lib/routes/accounts.js'
import { registerModelsRoutes } from '../lib/routes/models.js'
import { registerAuthRoutes } from '../lib/routes/auth.js'
import { registerSlashCommand } from '../lib/slash-command.js'
import { plainConfig } from '../lib/config.js'

const root = fileURLToPath(new URL('../', import.meta.url))

function createReq({ method = 'POST', body = null, remote = '127.0.0.1', untrusted = false } = {}) {
  const chunks = body ? [Buffer.from(typeof body === 'string' ? body : JSON.stringify(body))] : []
  const req = Readable.from(chunks)
  req.method = method
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

function setupRouter({ settingsAvailable = true, activeKey = 'valid-key' } = {}) {
  const routes = []
  let replacedConfig = null
  let providerSynced = false

  const mockSettingsApi = {
    replace: async (val) => { replacedConfig = val },
    mutate: async () => {},
  }

  const mockCreds = {
    set: async () => true,
    resolve: async () => ({ value: activeKey }),
  }

  const ctx = {
    effect: (fn) => fn(),
    webServer: {
      register: (r) => {
        routes.push(r)
        return () => {}
      },
    },
    credentials: mockCreds,
    get: (name) => {
      if (name === 'credentials') return mockCreds
      if (name === 'settings') return settingsAvailable ? mockSettingsApi : null
      return null
    },
  }

  const liveConfig = {
    enabled: true,
    baseUrl: 'https://api.cline.bot/api/v1',
    apiKeyEnv: 'CLINEBOT_API_KEY',
    defaultModel: 'cline-pass/deepseek-v4-flash',
    accounts: [{ label: 'Work', apiKeyEnv: 'CLINEBOT_API_KEY_WORK' }],
    activeAccount: '',
    disabledModels: [],
    dynamicModels: [
      { id: 'cline-pass/deepseek-v4-flash', name: 'DeepSeek Flash' },
      { id: 'cline-pass/kimi-k3', name: 'Kimi K3' },
    ],
    timeoutMs: 15000,
    smokeTimeoutMs: 25000,
  }

  const env = {
    live: () => liveConfig,
    getSettingsApi: () => settingsAvailable ? mockSettingsApi : null,
    syncProviderState: async () => { providerSynced = true },
    triggerAutoDiscover: () => {},
  }

  registerSettingsRoutes(ctx, env)
  registerAccountsRoutes(ctx, env)
  registerModelsRoutes(ctx, env)
  registerAuthRoutes(ctx, env)

  return {
    routes,
    getHandler: (path) => {
      const route = routes.find((r) => r.path === path)
      if (!route) throw new Error(`Route not registered: ${path}`)
      return route.handler
    },
    getReplacedConfig: () => replacedConfig,
    isProviderSynced: () => providerSynced,
  }
}

test('routes: client ROUTE_PREFIX matches registered server base path', () => {
  const clientSource = readFileSync(path.join(root, 'lib', 'client.js'), 'utf8')
  const match = clientSource.match(/const ROUTE_PREFIX = ['"]([^'"]+)['"]/)
  assert.ok(match, 'ROUTE_PREFIX must be defined in lib/client.js')
  assert.equal(match[1], '/dsh-clinebot', 'Client ROUTE_PREFIX must match server /dsh-clinebot')
})

test('routes: behavioral verification of all registered routes kind and prefix', () => {
  const { routes } = setupRouter()
  assert.ok(routes.length >= 9, 'Expected at least 9 routes registered')

  for (const r of routes) {
    assert.equal(r.kind, 'exact', `Route ${r.path} must have kind: exact`)
    assert.ok(r.path.startsWith('/dsh-clinebot/'), `Route ${r.path} must start with /dsh-clinebot/`)
    assert.equal(typeof r.handler, 'function', `Route ${r.path} must have a valid handler function`)
  }

  const registeredPaths = routes.map((r) => r.path)
  const expectedPaths = [
    '/dsh-clinebot/status',
    '/dsh-clinebot/config',
    '/dsh-clinebot/save-key',
    '/dsh-clinebot/accounts/active',
    '/dsh-clinebot/register',
    '/dsh-clinebot/unregister',
    '/dsh-clinebot/models/sync',
    '/dsh-clinebot/models/toggle',
    '/dsh-clinebot/accounts',
    '/dsh-clinebot/accounts/delete',
    '/dsh-clinebot/usage',
    '/dsh-clinebot/key/verify',
    '/dsh-clinebot/smoke',
  ]
  for (const exp of expectedPaths) {
    assert.ok(registeredPaths.includes(exp), `Expected route ${exp} to be registered`)
  }
})

test('routes: behavioral tests for all write endpoints (405, 403, and functional execution)', async () => {
  const writeRoutes = [
    { path: '/dsh-clinebot/save-key', allowedMethod: 'POST', badBody: {}, goodBody: { apiKey: 'test-key', apiKeyEnv: 'CLINEBOT_API_KEY' } },
    { path: '/dsh-clinebot/models/toggle', allowedMethod: 'POST', badBody: null, goodBody: { disabledModels: ['cline-pass/kimi-k3'] } },
    { path: '/dsh-clinebot/accounts/active', allowedMethod: 'POST', badBody: null, goodBody: { account: 'CLINEBOT_API_KEY_WORK' } },
    { path: '/dsh-clinebot/accounts', allowedMethod: 'POST', badBody: { apiKey: '' }, goodBody: { label: 'New Acc', apiKeyEnv: 'CLINEBOT_API_KEY_2', apiKey: 'test-key' } },
    { path: '/dsh-clinebot/accounts/delete', allowedMethod: 'POST', badBody: { apiKeyEnv: '' }, goodBody: { apiKeyEnv: 'CLINEBOT_API_KEY_WORK' } },
    { path: '/dsh-clinebot/register', allowedMethod: 'POST', badBody: null, goodBody: {} },
    { path: '/dsh-clinebot/unregister', allowedMethod: 'POST', badBody: null, goodBody: {} },
    { path: '/dsh-clinebot/smoke', allowedMethod: 'POST', badBody: null, goodBody: { model: 'cline-pass/deepseek-v4-flash' } },
    { path: '/dsh-clinebot/key/verify', allowedMethod: 'POST', badBody: { key: '' }, goodBody: { key: 'candidate-key' } },
    { path: '/dsh-clinebot/config', allowedMethod: 'PUT', badBody: { unknownField: 'bad' }, goodBody: { defaultModel: 'cline-pass/deepseek-v4-flash' } },
  ]

  for (const item of writeRoutes) {
    const { getHandler } = setupRouter()
    const handler = getHandler(item.path)

    // 1. Method Not Allowed (405)
    const wrongMethod = item.allowedMethod === 'PUT' ? 'POST' : 'GET'
    const out405 = createRes()
    await handler(createReq({ method: wrongMethod, body: item.goodBody }), out405.res)
    assert.equal(out405.read().status, 405, `${item.path} with wrong method ${wrongMethod} must return 405`)

    // 2. Untrusted / Cross-site origin (403)
    const out403 = createRes()
    await handler(createReq({ method: item.allowedMethod, body: item.goodBody, untrusted: true }), out403.res)
    assert.equal(out403.read().status, 403, `${item.path} with untrusted origin must return 403`)

    // 3. Bad request payload (400) when badBody provided
    if (item.badBody !== null) {
      const out400 = createRes()
      await handler(createReq({ method: item.allowedMethod, body: item.badBody }), out400.res)
      assert.equal(out400.read().status, 400, `${item.path} with bad payload must return 400`)
    }
  }

  // 4. Settings service unavailable (503) for settings-dependent write endpoints
  const settingsDependent = ['/dsh-clinebot/models/toggle', '/dsh-clinebot/accounts/active', '/dsh-clinebot/accounts', '/dsh-clinebot/accounts/delete', '/dsh-clinebot/config']
  for (const p of settingsDependent) {
    const { getHandler } = setupRouter({ settingsAvailable: false })
    const handler = getHandler(p)
    const method = p === '/dsh-clinebot/config' ? 'PUT' : 'POST'
    const out503 = createRes()
    await handler(createReq({ method, body: { defaultModel: 'cline-pass/deepseek-v4-flash', account: 'CLINEBOT_API_KEY_WORK', disabledModels: [], apiKey: 'key', apiKeyEnv: 'CLINEBOT_API_KEY_2' } }), out503.res)
    assert.equal(out503.read().status, 503, `${p} must return 503 when settings service is unavailable`)
  }

  // 5. Successful write execution: /models/toggle
  {
    const { getHandler, getReplacedConfig, isProviderSynced } = setupRouter()
    const handler = getHandler('/dsh-clinebot/models/toggle')
    const out = createRes()
    await handler(createReq({ method: 'POST', body: { disabledModels: ['cline-pass/kimi-k3'] } }), out.res)
    assert.equal(out.read().status, 200)
    assert.equal(out.read().body.ok, true)
    assert.deepEqual(plainConfig(getReplacedConfig()).disabledModels, ['cline-pass/kimi-k3'])
    assert.equal(isProviderSynced(), true)
  }

  // 6. Successful write execution: /accounts/active
  {
    const { getHandler, getReplacedConfig, isProviderSynced } = setupRouter()
    const handler = getHandler('/dsh-clinebot/accounts/active')
    const out = createRes()
    await handler(createReq({ method: 'POST', body: { account: 'CLINEBOT_API_KEY_WORK' } }), out.res)
    assert.equal(out.read().status, 200)
    assert.equal(out.read().body.activeAccount, 'CLINEBOT_API_KEY_WORK')
    assert.equal(plainConfig(getReplacedConfig()).activeAccount, 'CLINEBOT_API_KEY_WORK')
    assert.equal(isProviderSynced(), true)
  }

  // 7. Successful write execution: /accounts (POST) and /accounts/delete (POST)
  {
    const { getHandler, getReplacedConfig, isProviderSynced } = setupRouter()
    const addHandler = getHandler('/dsh-clinebot/accounts')
    const outAdd = createRes()
    await addHandler(createReq({
      method: 'POST',
      body: { label: 'Backup Account', apiKeyEnv: 'CLINEBOT_API_KEY_3', apiKey: 'test-key-3' },
    }), outAdd.res)
    assert.equal(outAdd.read().status, 200)
    assert.equal(outAdd.read().body.ok, true)
    assert.equal(outAdd.read().body.account.apiKeyEnv, 'CLINEBOT_API_KEY_3')
    const cfgAfterAdd = plainConfig(getReplacedConfig())
    assert.ok(cfgAfterAdd.accounts.some((a) => a.apiKeyEnv === 'CLINEBOT_API_KEY_3'))
    assert.equal(isProviderSynced(), true)

    // Cannot delete primary account
    const delHandler = getHandler('/dsh-clinebot/accounts/delete')
    const outDelPrimary = createRes()
    await delHandler(createReq({ method: 'POST', body: { apiKeyEnv: 'CLINEBOT_API_KEY' } }), outDelPrimary.res)
    assert.equal(outDelPrimary.read().status, 400)

    // Can delete secondary account
    const outDel = createRes()
    await delHandler(createReq({ method: 'POST', body: { apiKeyEnv: 'CLINEBOT_API_KEY_WORK' } }), outDel.res)
    assert.equal(outDel.read().status, 200)
    assert.equal(outDel.read().body.ok, true)
    assert.equal(outDel.read().body.removed, 'CLINEBOT_API_KEY_WORK')
    const cfgAfterDel = plainConfig(getReplacedConfig())
    assert.equal(cfgAfterDel.accounts.some((a) => a.apiKeyEnv === 'CLINEBOT_API_KEY_WORK'), false)
  }

  // 8. Successful write execution: /unregister and /register
  {
    const { getHandler } = setupRouter()
    const unregHandler = getHandler('/dsh-clinebot/unregister')
    const outUnreg = createRes()
    await unregHandler(createReq({ method: 'POST' }), outUnreg.res)
    assert.equal(outUnreg.read().status, 200)
    assert.equal(outUnreg.read().body.ok, true)

    const regHandler = getHandler('/dsh-clinebot/register')
    const outReg = createRes()
    await regHandler(createReq({ method: 'POST', body: { models: ['cline-pass/deepseek-v4-flash'] } }), outReg.res)
    assert.equal(outReg.read().status, 200)
    assert.equal(outReg.read().body.ok, true)
  }
})

test('routes: client.js bundle executes and exports valid DSH plugin module', () => {
  const clientSource = readFileSync(path.join(root, 'lib', 'client.js'), 'utf8')
  let loadedExports = null
  const context = {
    window: {
      __ModuleLoader__: {
        load: ({ id, factory }) => {
          assert.equal(id, '@goodandready/dsh-clinebot')
          const mockReact = {
            createElement: (type, props, ...children) => ({ type, props, children }),
            useMemo: (fn) => fn(),
            useCallback: (fn) => fn,
            useState: (init) => [init, () => {}],
            useEffect: () => {},
            useSyncExternalStore: () => 'ready',
          }
          loadedExports = factory((dep) => (dep === 'react' ? mockReact : {}))
        },
      },
    },
    document: { head: { appendChild: () => {} }, createElement: () => ({ setAttribute: () => {} }), getElementById: () => null },
    console,
  }
  vm.runInNewContext(clientSource, context)
  assert.ok(loadedExports, 'lib/client.js must register with window.__ModuleLoader__')
  assert.equal(typeof loadedExports.apply, 'function', 'Client module must export apply')
})

test('commands: behavioral execution of /cline slash command and subcommands', async () => {
  let registeredCmd = null
  const mockCommands = {
    register: (cmd) => {
      registeredCmd = cmd
      return () => {}
    },
  }

  const mockCreds = {
    resolve: async () => ({ value: 'test-key' }),
  }

  const ctx = {
    inject: (deps, fn) => fn({ commands: mockCommands }),
    effect: (fn) => fn(),
    credentials: mockCreds,
    get: (name) => name === 'credentials' ? mockCreds : null,
  }

  const liveConfig = {
    enabled: true,
    baseUrl: 'https://api.cline.bot/api/v1',
    apiKeyEnv: 'CLINEBOT_API_KEY',
    defaultModel: 'cline-pass/deepseek-v4-flash',
    accounts: [{ label: 'Work', apiKeyEnv: 'CLINEBOT_API_KEY_WORK' }],
    activeAccount: '',
    disabledModels: [],
    dynamicModels: [
      { id: 'cline-pass/deepseek-v4-flash', name: 'DeepSeek Flash', contextLength: 200000 },
      { id: 'cline-pass/kimi-k3', name: 'Kimi K3', contextLength: 200000 },
    ],
  }

  registerSlashCommand(ctx, {
    live: () => liveConfig,
    getSettingsApi: () => null,
    syncProviderState: async () => {},
  })

  assert.ok(registeredCmd, '/cline command must be registered via commands.register')
  assert.equal(registeredCmd.name, 'cline')
  assert.equal(typeof registeredCmd.execute, 'function')

  // 1. Behavioral test: /cline models
  const modelsOutput = await registeredCmd.execute('models')
  assert.ok(typeof modelsOutput === 'string')
  assert.ok(modelsOutput.includes('ClinePass Models Catalog'))
  assert.ok(modelsOutput.includes('Total models'))
  assert.ok(modelsOutput.includes('DeepSeek Flash'))

  // 2. Behavioral test: /cline accounts
  const accountsOutput = await registeredCmd.execute('accounts')
  assert.ok(typeof accountsOutput === 'string')
  assert.ok(accountsOutput.includes('ClinePass Accounts Pool') || accountsOutput.includes('Active Account'))

  // 3. Behavioral test: /cline stats
  const statsOutput = await registeredCmd.execute('stats')
  assert.ok(typeof statsOutput === 'string')
  assert.ok(statsOutput.includes('Stream Telemetry') || statsOutput.includes('Requests'))

  // 4. Behavioral test: /cline switch (missing parameter)
  const switchOutput = await registeredCmd.execute('switch')
  assert.ok(typeof switchOutput === 'string')
  assert.ok(switchOutput.includes('Please specify account'))

  // 5. Behavioral test: DSH command handler contract
  assert.equal(typeof registeredCmd.handler, 'function')
  const handlerResult = await registeredCmd.handler({ rawInput: 'models' })
  assert.equal(handlerResult.kind, 'success')
  assert.ok(typeof handlerResult.text === 'string')
  assert.ok(handlerResult.text.includes('ClinePass Models Catalog'))
})
