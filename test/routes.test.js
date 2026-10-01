import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { Readable } from 'node:stream'
import path from 'node:path'
import vm from 'node:vm'

import { registerSettingsRoutes } from '../lib/routes/settings.js'
import { registerAccountsRoutes } from '../lib/routes/accounts.js'
import { Config } from '../lib/config.js'
import { registerModelsRoutes } from '../lib/routes/models.js'
import { registerAuthRoutes } from '../lib/routes/auth.js'
import { registerSlashCommand } from '../lib/slash-command.js'
import { plainConfig } from '../lib/config.js'

const root = fileURLToPath(new URL('../', import.meta.url))

function createReq({ method = 'POST', url = '/', body = null, remote = '127.0.0.1', untrusted = false } = {}) {
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

function setupRouter({ settingsAvailable = true, activeKey = 'valid-key' } = {}) {
  const routes = []
  let replacedConfig = null
  let providerSynced = false
  let replaceShouldFail = false

  const mockSettingsApi = {
    replace: async (val) => {
      if (replaceShouldFail) throw new Error("Mock settings replace failed");
      replacedConfig = val;
      Object.assign(liveConfig, val);
    },
    mutate: async () => {},
  }

  let unsetCalledWith = null
  let unsetShouldFail = false
  const mockCreds = {
    set: async () => true,
    resolve: async () => ({ value: activeKey }),
    unset: async (ref) => {
      if (unsetShouldFail) throw new Error("Mock credential unset failed");
      unsetCalledWith = ref;
      return true;
    },
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
    getUnsetCalledWith: () => unsetCalledWith,
    setUnsetShouldFail: (val) => { unsetShouldFail = val },
    setReplaceShouldFail: (val) => { replaceShouldFail = val },
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
    { path: '/dsh-clinebot/models/context', allowedMethod: 'POST', badBody: {}, goodBody: { modelId: 'cline-pass/kimi-k3', contextLength: 2000000 } },
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
  const settingsDependent = ['/dsh-clinebot/models/toggle', '/dsh-clinebot/models/context', '/dsh-clinebot/accounts/active', '/dsh-clinebot/accounts', '/dsh-clinebot/accounts/delete', '/dsh-clinebot/config']
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
    const { getHandler, getReplacedConfig, isProviderSynced, setUnsetShouldFail, setReplaceShouldFail, getUnsetCalledWith } = setupRouter()
    const handler = getHandler('/dsh-clinebot/models/toggle')
    const out = createRes()
    await handler(createReq({ method: 'POST', body: { disabledModels: ['cline-pass/kimi-k3'] } }), out.res)
    assert.equal(out.read().status, 200)
    assert.equal(out.read().body.ok, true)
    assert.deepEqual(plainConfig(getReplacedConfig()).disabledModels, ['cline-pass/kimi-k3'])
    assert.equal(isProviderSynced(), true)
  }

  // 5b. Successful write execution: /models/context
  {
    const { getHandler, getReplacedConfig, isProviderSynced } = setupRouter()
    const handler = getHandler('/dsh-clinebot/models/context')

    // Single model override
    const outSingle = createRes()
    await handler(createReq({ method: 'POST', body: { modelId: 'cline-pass/kimi-k3', contextLength: 2000000, maxTokens: 16384 } }), outSingle.res)
    assert.equal(outSingle.read().status, 200)
    assert.equal(outSingle.read().body.ok, true)
    const replacedSingle = plainConfig(getReplacedConfig())
    assert.ok(Array.isArray(replacedSingle.modelContextOverrides))
    assert.equal(replacedSingle.modelContextOverrides.length, 1)
    assert.equal(replacedSingle.modelContextOverrides[0].modelId, 'cline-pass/kimi-k3')
    assert.equal(replacedSingle.modelContextOverrides[0].contextLength, 2000000)
    assert.equal(isProviderSynced(), true)

    // mode: 'all-original'
    const outAllOrig = createRes()
    await handler(createReq({ method: 'POST', body: { mode: 'all-original' } }), outAllOrig.res)
    assert.equal(outAllOrig.read().status, 200)
    const replacedAllOrig = plainConfig(getReplacedConfig())
    assert.ok(replacedAllOrig.modelContextOverrides.length >= 2)
    const kimiOrig = replacedAllOrig.modelContextOverrides.find((o) => o.modelId === 'cline-pass/kimi-k3')
    assert.equal(kimiOrig.contextLength, 2000000)
    const dsOrig = replacedAllOrig.modelContextOverrides.find((o) => o.modelId === 'cline-pass/deepseek-v4-flash')
    assert.equal(dsOrig.contextLength, 128000)

    // mode: 'all-default'
    const outReset = createRes()
    await handler(createReq({ method: 'POST', body: { mode: 'all-default' } }), outReset.res)
    assert.equal(outReset.read().status, 200)
    const replacedReset = plainConfig(getReplacedConfig())
    assert.deepEqual(replacedReset.modelContextOverrides, [])

    // Single model reset
    await handler(createReq({ method: 'POST', body: { modelId: 'cline-pass/kimi-k3', contextLength: 2000000 } }), createRes().res)
    const outSingleReset = createRes()
    await handler(createReq({ method: 'POST', body: { modelId: 'cline-pass/kimi-k3', reset: true } }), outSingleReset.res)
    assert.equal(outSingleReset.read().status, 200)
    const replacedAfterReset = plainConfig(getReplacedConfig())
    assert.deepEqual(replacedAfterReset.modelContextOverrides, [])
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
    const { getHandler, getReplacedConfig, isProviderSynced, setUnsetShouldFail, setReplaceShouldFail, getUnsetCalledWith } = setupRouter()
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

    const delHandler = getHandler('/dsh-clinebot/accounts/delete')

    // Disallowed apiKeyEnv format (Issue #155)
    const outDelBadFormat = createRes()
    await delHandler(createReq({ method: 'POST', body: { apiKeyEnv: 'OTHER_PROVIDER_API_KEY' } }), outDelBadFormat.res)
    assert.equal(outDelBadFormat.read().status, 400)
    assert.match(outDelBadFormat.read().body.error, /Disallowed apiKeyEnv/)

    // Non-existent account in pool (Issue #155)
    const outDelNotFound = createRes()
    await delHandler(createReq({ method: 'POST', body: { apiKeyEnv: 'CLINEBOT_API_KEY_NONEXISTENT' } }), outDelNotFound.res)
    assert.equal(outDelNotFound.read().status, 404)
    assert.match(outDelNotFound.read().body.error, /not found in accounts pool/)

    // Cannot delete primary account
    const outDelPrimary = createRes()
    await delHandler(createReq({ method: 'POST', body: { apiKeyEnv: 'CLINEBOT_API_KEY' } }), outDelPrimary.res)
    assert.equal(outDelPrimary.read().status, 400)

    // Failure on settings replace does not unset credentials (#184)
    setReplaceShouldFail(true)
    const outDelFailSettings = createRes()
    await delHandler(createReq({ method: 'POST', body: { apiKeyEnv: 'CLINEBOT_API_KEY_WORK', deleteSecret: true } }), outDelFailSettings.res)
    assert.equal(outDelFailSettings.read().status, 500)
    assert.equal(getUnsetCalledWith(), null, "credentials.unset must NOT be called if settings replace fails (#184)")
    setReplaceShouldFail(false)

    // Failure on deleteSecret when credentials unset fails (Issue #155)
    setUnsetShouldFail(true)
    const outDelFailSecret = createRes()
    await delHandler(createReq({ method: 'POST', body: { apiKeyEnv: 'CLINEBOT_API_KEY_WORK', deleteSecret: true } }), outDelFailSecret.res)
    assert.equal(outDelFailSecret.read().status, 500)
    assert.match(outDelFailSecret.read().body.error, /Failed to delete secret/)
    setUnsetShouldFail(false)

    // Successful delete with deleteSecret: true unsets credential (Issue #155)
    const outDel = createRes()
    await delHandler(createReq({ method: 'POST', body: { apiKeyEnv: 'CLINEBOT_API_KEY_WORK', deleteSecret: true } }), outDel.res)
    assert.equal(outDel.read().status, 200)
    assert.equal(outDel.read().body.ok, true)
    assert.equal(outDel.read().body.removed, 'CLINEBOT_API_KEY_WORK')
    assert.ok(getUnsetCalledWith(), "credentials.unset must be called when deleteSecret is true")
    const cfgAfterDel = plainConfig(getReplacedConfig())
    assert.equal(cfgAfterDel.accounts.some((a) => a.apiKeyEnv === 'CLINEBOT_API_KEY_WORK'), false)

    // DELETE /dsh-clinebot/accounts also succeeds via query param
    const accountsHandler = getHandler('/dsh-clinebot/accounts')
    const outDelViaDeleteMethod = createRes()
    await accountsHandler(createReq({ method: 'DELETE', url: '/dsh-clinebot/accounts?apiKeyEnv=CLINEBOT_API_KEY_3' }), outDelViaDeleteMethod.res)
    assert.equal(outDelViaDeleteMethod.read().status, 200)
    assert.equal(outDelViaDeleteMethod.read().body.removed, 'CLINEBOT_API_KEY_3')
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
  assert.ok(modelsOutput.includes('ClinePass Models'))
  assert.ok(modelsOutput.includes('Active Models'))
  assert.ok(modelsOutput.includes('DeepSeek Flash'))
  assert.equal(modelsOutput.includes('###'), false, 'Output must not contain markdown headers')
  assert.equal(modelsOutput.includes('**'), false, 'Output must not contain markdown bold syntax')
  assert.equal(modelsOutput.includes('`'), false, 'Output must not contain markdown backticks')
  assert.ok(modelsOutput.split('\n')[0].length <= 120, 'First line summary must be <= 120 characters')

  // 2. Behavioral test: /cline accounts
  const accountsOutput = await registeredCmd.execute('accounts')
  assert.ok(typeof accountsOutput === 'string')
  assert.ok(accountsOutput.includes('ClinePass Accounts'))
  assert.ok(accountsOutput.includes('Active Account: CLINEBOT_API_KEY'))
  assert.equal(accountsOutput.includes('###'), false)
  assert.equal(accountsOutput.includes('**'), false)
  assert.equal(accountsOutput.includes('`'), false)
  assert.ok(accountsOutput.split('\n')[0].length <= 120)

  // 3. Behavioral test: /cline stats
  const statsOutput = await registeredCmd.execute('stats')
  assert.ok(typeof statsOutput === 'string')
  assert.ok(statsOutput.includes('ClineBot Telemetry'))
  assert.ok(statsOutput.includes('Requests:'))
  assert.equal(statsOutput.includes('###'), false)
  assert.equal(statsOutput.includes('**'), false)
  assert.equal(statsOutput.includes('`'), false)
  assert.ok(statsOutput.split('\n')[0].length <= 120)

  // 4. Behavioral test: /cline switch (missing parameter)
  const switchOutput = await registeredCmd.execute('switch')
  assert.ok(typeof switchOutput === 'string')
  assert.ok(switchOutput.includes('Please specify account'))
  assert.equal(switchOutput.includes('`'), false)

  // 5. Behavioral test: /cline quota (default) with accounts pool resolution (Issue #107)
  const quotaOutput = await registeredCmd.execute('')
  assert.ok(typeof quotaOutput === 'string')
  assert.equal(quotaOutput.includes('###'), false, 'Quota output must not contain markdown headers')
  assert.equal(quotaOutput.includes('**'), false, 'Quota output must not contain markdown bold syntax')
  assert.equal(quotaOutput.includes('`'), false, 'Quota output must not contain markdown backticks')
  assert.equal(quotaOutput.includes('undefined'), false, 'Active Key must not be undefined')
  assert.match(quotaOutput, /Active Key:\s+CLINEBOT_API_KEY/, 'Active Key must be CLINEBOT_API_KEY')
  const quotaFirstLine = quotaOutput.split('\n')[0]
  assert.ok(quotaFirstLine.length <= 120, 'Quota first line summary must be <= 120 characters')

  // 6. Behavioral test: /cline quota when activeAccount is pinned to account from pool
  const poolCfg = { ...liveConfig, activeAccount: 'CLINEBOT_API_KEY_WORK' }
  registerSlashCommand(ctx, {
    live: () => poolCfg,
    getSettingsApi: () => null,
    syncProviderState: async () => {},
  })
  const pinnedQuotaOutput = await registeredCmd.execute('')
  assert.match(pinnedQuotaOutput, /Active Key:\s+CLINEBOT_API_KEY_WORK/, 'Active Key must resolve to pinned pool account')
  assert.equal(pinnedQuotaOutput.includes('undefined'), false)

  // 7. Behavioral test: DSH command handler contract
  assert.equal(typeof registeredCmd.handler, 'function')
  const handlerResult = await registeredCmd.handler({ rawInput: 'models' })
  assert.equal(handlerResult.kind, 'success')
  assert.ok(typeof handlerResult.text === 'string')
  assert.ok(handlerResult.text.includes('ClinePass Models'))
})

test('commands & routes: custom models are preserved in slash command test/models and context routes (#170)', async () => {
  const originalFetch = globalThis.fetch
  try {
    let smokeChatModel = null
    globalThis.fetch = async (url, init) => {
      if (url.includes('/chat/completions')) {
        const body = JSON.parse(init.body || '{}')
        smokeChatModel = body.model
        return new Response(JSON.stringify({
          choices: [{ message: { content: 'pong' } }]
        }), { status: 200, headers: { 'content-type': 'application/json' } })
      }
      return new Response('Not Found', { status: 404 })
    }

    const customModels = [
      {
        id: 'custom/specialized-coder',
        name: 'Specialized Coder',
        contextLength: 64000,
        maxTokens: 4096,
      }
    ]

    let currentConfig = {
      apiKeyEnv: 'CLINEBOT_API_KEY',
      baseUrl: 'https://api.cline.bot/api/v1',
      defaultModel: 'cline-pass/deepseek-v4-flash',
      customModels,
      dynamicModels: [],
      modelContextOverrides: [],
      disabledModels: [],
    }

    let registeredCmd = null
    const registeredRoutes = []
    const mockCommands = {
      register: (cmd) => { registeredCmd = cmd },
    }
    const ctx = {
      commands: mockCommands,
      inject: (deps, fn) => fn({ commands: mockCommands }),
      webServer: {
        port: 3080,
        register: (route) => { registeredRoutes.push(route) },
      },
      effect: (fn) => fn(),
      credentials: {
        resolve: async () => ({ value: 'test-cline-key-123' })
      },
      get: (name) => {
        if (name === 'credentials') {
          return {
            resolve: async () => ({ value: 'test-cline-key-123' })
          }
        }
        return null
      }
    }

    let savedConfig = null
    const settingsApi = {
      replace: async (next) => {
        savedConfig = next
        currentConfig = next
        return { ok: true }
      }
    }

    registerSlashCommand(ctx, {
      live: () => currentConfig,
      getSettingsApi: () => settingsApi,
      syncProviderState: async () => {},
    })

    registerModelsRoutes(ctx, {
      live: () => currentConfig,
      getSettingsApi: () => settingsApi,
      syncProviderState: async () => {},
    })

    // 1. /cline test with custom model succeeds without 'not recognized' error
    const testCustomOutput = await registeredCmd.execute('test custom/specialized-coder')
    assert.equal(testCustomOutput.includes('not recognized'), false, 'Custom model must be recognized')
    assert.equal(smokeChatModel, 'custom/specialized-coder', 'Smoke test must be invoked with custom model ID')

    // 2. /cline test with unknown model is rejected
    const testUnknownOutput = await registeredCmd.execute('test non-existent-model')
    assert.ok(testUnknownOutput.includes('is not recognized'), 'Unknown model must be rejected')

    // 3. /cline models lists custom model
    const modelsOutput = await registeredCmd.execute('models')
    assert.ok(modelsOutput.includes('Specialized Coder'), 'Custom model must be listed in /cline models')

    // 4. POST /dsh-clinebot/models/context with mode=all-original preserves custom model
    const contextHandler = registeredRoutes.find((r) => r.path === '/dsh-clinebot/models/context')?.handler
    assert.ok(contextHandler, 'Context handler must be registered')

    const createMockReqRes = (body) => {
      let statusCode = 200
      let responseData = null
      const req = {
        method: 'POST',
        headers: { host: '127.0.0.1:3080' },
        socket: { remoteAddress: '127.0.0.1' },
        on: (event, handler) => {
          if (event === 'data') handler(Buffer.from(JSON.stringify(body)))
          if (event === 'end') handler()
          return req
        }
      }
      const res = {
        writeHead: (code) => { statusCode = code },
        setHeader: () => {},
        end: (data) => {
          if (data) {
            try { responseData = JSON.parse(data) } catch { responseData = data }
          }
        }
      }
      return { req, res, getStatus: () => statusCode, getData: () => responseData }
    }

    const { req: req1, res: res1, getData: getData1 } = createMockReqRes({ mode: 'all-original' })
    await contextHandler(req1, res1)
    const data1 = getData1()
    assert.ok(data1.ok)
    const customInUpdated = data1.models.find((m) => m.id === 'custom/specialized-coder')
    assert.ok(customInUpdated, 'Custom model must be included in updated models')

    // 5. POST /dsh-clinebot/models/toggle with enabledModels preserves custom model
    const toggleHandler = registeredRoutes.find((r) => r.path === '/dsh-clinebot/models/toggle')?.handler
    assert.ok(toggleHandler, 'Toggle handler must be registered')

    const { req: req2, res: res2, getData: getData2 } = createMockReqRes({ enabledModels: ['custom/specialized-coder'] })
    await toggleHandler(req2, res2)
    const data2 = getData2()
    assert.ok(data2.ok)
    assert.deepEqual(data2.enabledModels, ['custom/specialized-coder'])
    assert.ok(data2.disabledModels.includes('cline-pass/deepseek-v4-flash'), 'Non-enabled curated models must be disabled')
    assert.equal(data2.disabledModels.includes('custom/specialized-coder'), false, 'Enabled custom model must not be disabled')
  } finally {
    globalThis.fetch = originalFetch
  }
})


test('routes: accounts/delete returns honest partial state and allows secret retry (#184, #187)', async () => {
  const routes = []
  let cfg = Config({
    enabled: false,
    timeoutMs: 15000,
    accounts: [{ apiKeyEnv: 'CLINEBOT_API_KEY_2', label: 'Owned' }],
  })

  const mockCtx = {
    get: (name) => {
      if (name === 'credentials') {
        return {
          resolve: async () => ({ value: 'test-secret' }),
          unset: async () => {
            throw new Error('Credential store temporarily unavailable')
          },
        }
      }
      return null
    },
    logger: { warn() {} },
    webServer: { register: (r) => { routes.push(r); return () => {} } },
    effect: (fn) => fn(),
  }

  const mockApi = {
    replace: async (next) => { cfg = next },
  }

  registerAccountsRoutes(mockCtx, {
    live: () => cfg,
    getSettingsApi: () => mockApi,
    syncProviderState: async () => {},
  })

  const deleteHandler = routes.find((r) => r.path === '/dsh-clinebot/accounts/delete')?.handler
  assert.ok(deleteHandler, 'delete handler must exist')

  function createReq(body) {
    const r = Readable.from([Buffer.from(JSON.stringify(body))])
    r.method = 'POST'
    r.socket = { remoteAddress: '127.0.0.1' }
    r.headers = { 'sec-fetch-site': 'same-origin' }
    return r
  }
  function createRes() {
    let status = 0
    let body = null
    return {
      writeHead: (s) => { status = s },
      end: (data) => { body = JSON.parse(data) },
      getStatus: () => status,
      getBody: () => body,
    }
  }

  // 1. Initial attempt fails credentials unset, returns 500 with partial state
  const res1 = createRes()
  await deleteHandler(createReq({ apiKeyEnv: 'CLINEBOT_API_KEY_2', deleteSecret: true }), res1)
  assert.equal(res1.getStatus(), 500)
  assert.equal(res1.getBody().ok, false)

  // 2. Retry of secret deletion for account already removed from pool returns 500 (since credential store still fails) rather than 404
  const res2 = createRes()
  await deleteHandler(createReq({ apiKeyEnv: 'CLINEBOT_API_KEY_2', deleteSecret: true }), res2)
  assert.equal(res2.getStatus(), 500, 'Retry must not return 404 when secret cleanup is pending')
})
