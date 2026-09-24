import test from "node:test"
import assert from "node:assert/strict"
import { Readable } from "node:stream"

test("host: apply registers settings namespace via ctx.inject(['settings']) and watches updates", async () => {
  const { apply, NS } = await import("../lib/index.js")
  const injectCalls = []
  let registeredNs = null
  let registeredSchema = null
  let registeredOptions = null
  let watchHandler = null
  let watchRegistered = false

  const dummyScope = {
    get: () => ({ enabled: true, baseUrl: "https://api.cline.bot/api/v1", apiKeyEnv: "CLINEBOT_API_KEY", enabledModels: [] }),
    watch: (cb) => {
      watchRegistered = true
      watchHandler = cb
      return () => {}
    },
    replace: async () => {},
  }

  let syncProviderCalled = false
  const mockSettingsService = {
    register: (ns, schema, opts) => {
      registeredNs = ns
      registeredSchema = schema
      registeredOptions = opts
      return dummyScope
    },
    mutate: async (ns, ops) => {
      if (ns === 'llm-pi-ai') {
        syncProviderCalled = true
      }
    },
  }

  let synchronousSettingsGetCalled = false
  const mockCtx = {
    inject: (deps, cb) => {
      injectCalls.push(deps)
      if (deps.includes('settings')) {
        cb({
          settings: mockSettingsService,
          effect: (fn) => fn(),
        })
      }
    },
    get: (name) => {
      if (name === 'settings') {
        synchronousSettingsGetCalled = true
      }
      return null
    },
    effect: (fn) => fn(),
  }

  const baseConfig = { enabled: true, baseUrl: "https://api.cline.bot/api/v1", apiKeyEnv: "CLINEBOT_API_KEY" }
  apply(mockCtx, baseConfig)

  // 1. ctx.inject must be called with ['settings']
  assert.ok(injectCalls.some((d) => d.includes('settings')), "apply must inject 'settings' service dependency")

  // 2. Must register NS, schema, with { base: config }
  assert.equal(registeredNs, NS, "sctx.settings.register must be called with NS")
  assert.equal(typeof registeredSchema, "function", "sctx.settings.register must receive schema function")
  assert.deepEqual(registeredOptions, { base: baseConfig }, "sctx.settings.register must pass base config")

  // 3. Must not perform bare synchronous ctx.get('settings') during apply()
  assert.equal(synchronousSettingsGetCalled, false, "apply must not call bare ctx.get('settings') synchronously")

  // 4. Must register scope.watch and trigger sync on change
  assert.equal(watchRegistered, true, "scope.watch must be registered to observe settings changes")
  assert.equal(typeof watchHandler, "function")
})

test("host: resolveKeyValue safely resolves via ctx.get('credentials') without unsafe property access", async () => {
  const { resolveKeyValue } = await import("../lib/cline-client.js")

  // 1. Standard context with ctx.get('credentials')
  let getCredentialsCalled = false
  const ctxWithGet = {
    get: (name) => {
      if (name === 'credentials') {
        getCredentialsCalled = true
        return {
          resolve: async (ref) => ({ value: 'secret-from-get' }),
        }
      }
      return null
    },
  }

  const res1 = await resolveKeyValue(ctxWithGet, 'SOME_ENV_KEY')
  assert.equal(getCredentialsCalled, true, "resolveKeyValue must call ctx.get('credentials')")
  assert.equal(res1.value, 'secret-from-get')
  assert.equal(res1.source, 'credentials')

  // 2. Context with Proxy where bare credentials property access is checked
  let proxyGetCalled = false
  const trappingCtx = {
    get: (name) => {
      if (name === 'credentials') {
        proxyGetCalled = true
        return {
          resolve: async () => ({ value: 'proxy-key' }),
        }
      }
      return null
    },
  }
  Object.defineProperty(trappingCtx, 'credentials', {
    get() {
      return {
        resolve: async () => ({ value: 'direct-prop-key' }),
      }
    },
  })

  const res2 = await resolveKeyValue(trappingCtx, 'PROXY_ENV_KEY')
  assert.equal(proxyGetCalled, true)
  assert.equal(res2.value, 'proxy-key')

  // 3. Fallback context with only bare ctx.credentials (legacy)
  const legacyCtx = {
    credentials: {
      resolve: async () => ({ value: 'legacy-key' }),
    },
  }
  const res3 = await resolveKeyValue(legacyCtx, 'LEGACY_ENV_KEY')
  assert.equal(res3.value, 'legacy-key')
  assert.equal(res3.source, 'credentials')

  // 4. Context with neither credentials service falls back to env or empty
  const emptyCtx = { get: () => null }
  const res4 = await resolveKeyValue(emptyCtx, 'NON_EXISTENT_ENV_KEY_12345')
  assert.equal(res4.value, '')
  assert.equal(res4.source, 'none')
})

test("host: apply adapts modern SettingsForms without sctx.settings.register", async () => {
  const { apply, NS } = await import("../lib/index.js")
  let replacedNs = null
  let replacedPayload = null
  let replacedRev = null

  const mockSettingsService = {
    describe: () => [{ ns: NS, revision: 42 }],
    replace: async (ns, payload, rev) => {
      replacedNs = ns
      replacedPayload = payload
      replacedRev = rev
    },
    update: async () => {},
  }

  const registeredRoutes = {}
  const mockCtx = {
    inject: (deps, cb) => {
      cb({
        settings: mockSettingsService,
        effect: () => () => {},
      })
    },
    webServer: {
      register: (r) => {
        registeredRoutes[r.path] = r.handler
        return () => {}
      },
    },
    effect: (fn) => fn(),
  }

  apply(mockCtx, { enabled: true, baseUrl: "https://api.cline.bot/api/v1" })

  // Route /dsh-clinebot/config should be registered and working
  assert.ok(registeredRoutes["/dsh-clinebot/config"], "config route must be registered")

  const { Readable } = await import("node:stream")
  const payloadStr = JSON.stringify({ config: { timeoutMs: 25000, dynamicModels: [{ id: "temp", name: "Temp" }] } })
  const putReq = Readable.from([Buffer.from(payloadStr)])
  putReq.method = "PUT"
  putReq.headers = { "sec-fetch-site": "same-origin" }
  putReq.socket = { remoteAddress: "127.0.0.1" }

  let resStatus = 0
  let resBody = ""
  const res = {
    writeHead: (code) => { resStatus = code },
    end: (data) => { resBody = data },
  }

  await registeredRoutes["/dsh-clinebot/config"](putReq, res)
  assert.equal(resStatus, 200, "PUT /dsh-clinebot/config must return 200")
  assert.equal(replacedNs, NS, "SettingsForms.replace must be called with NS")
  assert.equal(replacedRev, 42, "SettingsForms.replace must be called with revision 42")
  assert.equal(replacedPayload.timeoutMs, 25000, "Volatile timeoutMs must be passed")
  assert.equal(replacedPayload.dynamicModels, undefined, "Non-volatile dynamicModels must be stripped from SettingsForms payload")
})

test("routes: /accounts/active, /models/toggle, /models/sync return 503 when settings service is unavailable", async () => {
  const { apply } = await import("../lib/index.js")
  const registeredRoutes = {}
  const mockCtx = {
    inject: (deps, cb) => {
      // Empty settings service without replace or register
      cb({
        settings: {},
        effect: () => () => {},
      })
    },
    webServer: {
      register: (r) => {
        registeredRoutes[r.path] = r.handler
        return () => {}
      },
    },
    effect: (fn) => fn(),
  }

  apply(mockCtx, { enabled: true })

  const makeReq = (method, body = {}) => {
    const req = Readable.from([Buffer.from(JSON.stringify(body))])
    req.method = method
    req.headers = { "sec-fetch-site": "same-origin" }
    req.socket = { remoteAddress: "127.0.0.1" }
    return req
  }

  const makeRes = () => {
    let status = 0
    let body = ""
    return {
      res: {
        writeHead: (code) => { status = code },
        end: (data) => { body = data },
      },
      get: () => ({ status, data: JSON.parse(body || "{}") }),
    }
  }

  // 1. /accounts/active returns 503
  const activeHelper = makeRes()
  await registeredRoutes["/dsh-clinebot/accounts/active"](makeReq("POST", { account: "CLINEBOT_API_KEY_2" }), activeHelper.res)
  assert.equal(activeHelper.get().status, 503, "/accounts/active must return 503 when settings cannot be persisted")
  assert.equal(activeHelper.get().data.ok, false)

  // 2. /models/toggle returns 503
  const toggleHelper = makeRes()
  await registeredRoutes["/dsh-clinebot/models/toggle"](makeReq("POST", { disabledModels: ["some-model"] }), toggleHelper.res)
  assert.equal(toggleHelper.get().status, 503, "/models/toggle must return 503 when settings cannot be persisted")
  assert.equal(toggleHelper.get().data.ok, false)
})

test("routes: /models/toggle and /accounts/active unwrap volatile live getters without throwing $.enabled expected boolean", async () => {
  const { apply, NS } = await import("../lib/index.js")
  const { Config } = await import("../lib/config.js")

  let replacedPayload = null
  const mockScope = {
    get: () => Config({ enabled: true, baseUrl: "https://api.cline.bot/api/v1", accounts: [{ label: "Two", apiKeyEnv: "CLINEBOT_API_KEY_2" }] }),
    replace: async (next) => {
      replacedPayload = next
    },
    watch: () => () => {},
  }

  const registeredRoutes = {}
  const mockCtx = {
    inject: (deps, cb) => {
      cb({
        settings: {
          register: () => mockScope,
        },
        effect: () => () => {},
      })
    },
    webServer: {
      register: (r) => {
        registeredRoutes[r.path] = r.handler
        return () => {}
      },
    },
    effect: (fn) => fn(),
  }

  apply(mockCtx, { enabled: true })

  const makeReq = (method, body = {}) => {
    const req = Readable.from([Buffer.from(JSON.stringify(body))])
    req.method = method
    req.headers = { "sec-fetch-site": "same-origin" }
    req.socket = { remoteAddress: "127.0.0.1" }
    return req
  }

  const makeRes = () => {
    let status = 0
    let body = ""
    return {
      res: {
        writeHead: (code) => { status = code },
        end: (data) => { body = data },
      },
      get: () => ({ status, data: JSON.parse(body || "{}") }),
    }
  }

  // 1. /accounts/active with volatile live config should succeed (200) and NOT throw $.enabled error
  const activeRes = makeRes()
  await registeredRoutes["/dsh-clinebot/accounts/active"](makeReq("POST", { account: "CLINEBOT_API_KEY_2" }), activeRes.res)
  assert.equal(activeRes.get().status, 200, "/accounts/active must return 200")
  assert.equal(activeRes.get().data.ok, true)
  assert.equal(activeRes.get().data.activeAccount, "CLINEBOT_API_KEY_2")

  // 2. /models/toggle with volatile live config should succeed (200) and NOT throw $.enabled error
  const toggleRes = makeRes()
  await registeredRoutes["/dsh-clinebot/models/toggle"](makeReq("POST", { disabledModels: ["some-model"] }), toggleRes.res)
  assert.equal(toggleRes.get().status, 200, "/models/toggle must return 200")
  assert.equal(toggleRes.get().data.ok, true)
})

test("host: checkRegisteredInPiAi accurately detects provider via SettingsForms describe() without get", async () => {
  const { checkRegisteredInPiAi, removePiAiProvider } = await import("../lib/provider-sync.js")

  // 1. SettingsForms with describe() returning llm-pi-ai with clinebot provider, no get()
  const mockSettingsFormsRegistered = {
    describe: () => [
      {
        ns: "llm-pi-ai",
        value: {
          providers: {
            clinebot: { displayName: "ClineBot" }
          }
        }
      }
    ],
    mutate: async (ns, ops) => {}
  }

  const ctxRegistered = {
    get: (name) => (name === "settings" ? mockSettingsFormsRegistered : null)
  }

  const isReg = await checkRegisteredInPiAi(ctxRegistered)
  assert.equal(isReg, true, "checkRegisteredInPiAi must return true when describe() contains clinebot")

  // 2. SettingsForms with describe() without clinebot provider
  const mockSettingsFormsEmpty = {
    describe: () => [
      {
        ns: "llm-pi-ai",
        value: {
          providers: {}
        }
      }
    ]
  }

  const ctxEmpty = {
    get: (name) => (name === "settings" ? mockSettingsFormsEmpty : null)
  }

  const isNotReg = await checkRegisteredInPiAi(ctxEmpty)
  assert.equal(isNotReg, false, "checkRegisteredInPiAi must return false when describe() lacks clinebot")

  // 3. removePiAiProvider tolerates 'path not found' error during safe remove
  let mutateCalled = false
  const mockSettingsFormsNotFound = {
    mutate: async (ns, ops) => {
      mutateCalled = true
      throw new Error("Path not found: providers.clinebot")
    }
  }

  const ctxNotFound = {
    get: (name) => (name === "settings" ? mockSettingsFormsNotFound : null)
  }

  const res = await removePiAiProvider(ctxNotFound)
  assert.equal(mutateCalled, true)
  assert.equal(res.ok, true, "removePiAiProvider must safely absorb 'not found' errors")
})

test("host: boot and reload survives functional getters and profile-shaped dynamicModels without DataCloneError", async () => {
  const { apply } = await import("../lib/index.js")

  let watchCb = null
  let currentRawConfig = () => ({
    enabled: () => true,
    baseUrl: () => "https://api.cline.bot/api/v1",
    apiKeyEnv: () => "CLINEBOT_API_KEY",
    dynamicModels: [
      {
        id: "cline-pass/deepseek-v41-flash",
        name: () => "DeepSeek V41 Flash",
        description: () => "Official plan model",
        contextLength: 200000,
        maxTokens: 8192,
      },
    ],
    accounts: [
      { label: () => "Primary", apiKeyEnv: () => "CLINEBOT_API_KEY" },
    ],
  })

  const mockScope = {
    get: () => currentRawConfig,
    watch: (cb) => {
      watchCb = cb
      return () => {}
    },
    replace: async () => {},
  }

  const registeredRoutes = {}
  const mockCtx = {
    inject: (deps, cb) => {
      cb({
        settings: {
          register: () => mockScope,
        },
        effect: () => () => {},
      })
    },
    webServer: {
      register: (r) => {
        registeredRoutes[r.path] = r.handler
        return () => {}
      },
    },
    effect: (fn) => fn(),
  }

  assert.doesNotThrow(() => {
    apply(mockCtx, currentRawConfig)
  })

  const makeReq = () => {
    const req = Readable.from([])
    req.method = "GET"
    req.headers = { "sec-fetch-site": "same-origin" }
    req.socket = { remoteAddress: "127.0.0.1" }
    return req
  }

  let status = 0
  let body = ""
  const res = {
    writeHead: (code) => { status = code },
    end: (data) => { body = data },
  }

  await registeredRoutes["/dsh-clinebot/status"](makeReq(), res)
  assert.equal(status, 200)
  const parsed = JSON.parse(body)
  assert.equal(parsed.ok, true)
  assert.equal(parsed.config.dynamicModels[0].id, "cline-pass/deepseek-v41-flash")
  assert.equal(parsed.config.dynamicModels[0].name, "DeepSeek V41 Flash")

  assert.doesNotThrow(() => {
    if (watchCb) watchCb(currentRawConfig)
  })
})


