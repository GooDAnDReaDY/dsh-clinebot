import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync, existsSync, readdirSync } from "node:fs"
import path from "node:path"
import os from "node:os"
import { pathToFileURL } from "node:url"
import { Readable } from "node:stream"
import { apply, configReader, inject, NS } from "../lib/index.js"
import { Config } from "../lib/config.js"

const indexSource = readFileSync(new URL("../lib/index.js", import.meta.url), "utf8")

test("#119 — the host declares only services that exist in DSH 0.1.7", () => {
  assert.ok(!inject.includes("settings"), `inject still asks for the removed settings service: ${inject}`)
  assert.ok(inject.includes("webServer"), "inject must include webServer")
})

test("#119 — lib/index.js never calls the removed settings.register", () => {
  assert.ok(!/settings\s*\.\s*register\s*\(/.test(indexSource), "lib/index.js still calls settings.register")
})

test("#119 — lib/index.js never reads a service property it did not declare in inject", () => {
  const declared = new Set(inject)
  const code = indexSource.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")
  const used = new Set([...code.matchAll(/ctx\.([A-Za-z_][A-Za-z0-9_]*)/g)].map((m) => m[1]))
  const builtin = new Set([
    "logger", "inject", "effect", "on", "off", "setInterval", "setTimeout", "clearInterval",
    "webServer", "tools", "locale", "slots", "configForms", "settingsScope", "api", "console", "get",
  ])
  for (const name of used) {
    if (builtin.has(name) || declared.has(name)) continue
    assert.fail(`lib/index.js reads ctx.${name}, which the plugin does not declare in inject`)
  }
})

test("#119 — the config reader returns the config the service was applied with", () => {
  const boot = { enabled: true, baseUrl: "https://api.cline.bot/api/v1" }
  assert.equal(configReader(boot)().baseUrl, "https://api.cline.bot/api/v1")
  const next = { enabled: false, baseUrl: "https://other.api/v1" }
  assert.equal(configReader(next)().baseUrl, "https://other.api/v1")
})

test("#119 — the host boots on a strict proxy context without the removed settings service", () => {
  const registeredRoutes = {}
  const strictCtx = new Proxy(
    {
      logger: { info() {}, warn() {}, error() {} },
      effect(fn) { return fn() },
      on() { return () => {} },
      inject(deps, cb) { return () => {} },
      webServer: {
        register(route) {
          registeredRoutes[route.path] = route.handler
          return () => {}
        },
      },
    },
    {
      get(target, name) {
        if (name in target) return target[name]
        throw new Error(`cannot get property "${String(name)}" without inject`)
      },
    }
  )

  assert.doesNotThrow(() => {
    apply(strictCtx, { enabled: true, baseUrl: "https://api.cline.bot/api/v1" })
  })
  assert.ok(Object.keys(registeredRoutes).length > 0, "host routes must be registered")
  assert.ok(registeredRoutes["/dsh-clinebot/status"], "/dsh-clinebot/status must be registered")
})

test("host: resolveKeyValue safely resolves via ctx.get( credentials) without unsafe property access", async () => {
  const { resolveKeyValue } = await import("../lib/credential-refs.js")

  let getCredentialsCalled = false
  const ctxWithGet = {
    get: (name) => {
      if (name === "credentials") {
        getCredentialsCalled = true
        return {
          resolve: async (ref) => ({ value: "secret-from-get" }),
        }
      }
      return null
    },
  }

  const res1 = await resolveKeyValue(ctxWithGet, "SOME_ENV_KEY")
  assert.equal(getCredentialsCalled, true, "resolveKeyValue must call ctx.get(credentials)")
  assert.equal(res1.value, "secret-from-get")
  assert.equal(res1.source, "credentials")
})

test("host: settingsApi persists to SettingsForms via ctx.get(settings) when available", async () => {
  let replacedNs = null
  let replacedPayload = null
  let replacedRev = null

  const mockSettingsForms = {
    describe: () => [{ ns: NS, revision: "rev-42" }],
    replace: async (ns, payload, rev) => {
      replacedNs = ns
      replacedPayload = payload
      replacedRev = rev
    },
    update: async () => {},
  }

  const registeredRoutes = {}
  const mockCtx = {
    get: (name) => (name === "settings" ? mockSettingsForms : null),
    webServer: {
      register: (r) => {
        registeredRoutes[r.path] = r.handler
        return () => {}
      },
    },
    effect: (fn) => fn(),
  }

  apply(mockCtx, { enabled: true, baseUrl: "https://api.cline.bot/api/v1", accounts: [{ label: "Old", apiKeyEnv: "CLINEBOT_API_KEY" }] })

  const makeReq = (method, body = {}) => {
    const req = Readable.from([Buffer.from(JSON.stringify(body))])
    req.method = method
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

  // Update via PUT /config
  await registeredRoutes["/dsh-clinebot/config"](makeReq("PUT", {
    config: { enabled: false }
  }), res)

  assert.equal(status, 200, "PUT /config must succeed 200")
  assert.equal(replacedNs, NS, "SettingsForms.replace must be called with NS")
  assert.equal(replacedPayload.enabled, false)
  assert.equal(replacedRev, "rev-42", "SettingsForms.replace must pass revision")
})

test("routes: /models/toggle and /accounts/active unwrap volatile live getters without throwing $.enabled expected boolean", async () => {
  const registeredRoutes = {}
  const mockSettingsForms = {
    describe: () => [{ ns: "dsh-clinebot", revision: "rev-1" }],
    replace: async () => {},
    update: async () => {},
  }
  const mockCtx = {
    get: (name) => (name === "settings" ? mockSettingsForms : null),
    webServer: {
      register: (r) => {
        registeredRoutes[r.path] = r.handler
        return () => {}
      },
    },
    effect: (fn) => fn(),
  }

  apply(mockCtx, { enabled: true, accounts: [{ label: "Two", apiKeyEnv: "CLINEBOT_API_KEY_2" }] })

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
  assert.equal(res.ok, true, "removePiAiProvider must safely absorb not found errors")
})

test("host: boot and reload survives functional getters and profile-shaped dynamicModels without DataCloneError", async () => {
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

  const registeredRoutes = {}
  const mockCtx = {
    get: () => null,
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
})

test("host: settingsApi.replace rejects when settings service is unavailable or non-writable (#157)", async () => {
  const registeredRoutes = {}
  const mockCtxWithoutSettings = {
    get: () => null,
    webServer: {
      register: (r) => {
        registeredRoutes[r.path] = r.handler
        return () => {}
      },
    },
    effect: (fn) => fn(),
  }

  const initialConfig = { enabled: false, baseUrl: "https://api.cline.bot/api/v1" }
  apply(mockCtxWithoutSettings, initialConfig)

  const makeReq = (method, body = {}) => {
    const req = Readable.from([Buffer.from(JSON.stringify(body))])
    req.method = method
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

  await registeredRoutes["/dsh-clinebot/config"](makeReq("PUT", {
    config: { enabled: true }
  }), res)

  assert.equal(status, 400, "PUT /config must reject 400 when settings service is missing")
  const parsed = JSON.parse(body || "{}")
  assert.match(parsed.error, /unavailable or non-writable/i)

  // Verify live() config did NOT mutate to true
  let getStatus = 0
  let getBody = ""
  const getRes = {
    writeHead: (code) => { getStatus = code },
    end: (data) => { getBody = data },
  }
  await registeredRoutes["/dsh-clinebot/config"](makeReq("GET"), getRes)
  assert.equal(getStatus, 200)
  assert.equal(JSON.parse(getBody).config.enabled, false, "live config must remain false after failed write")
})

test("host: settingsApi.replace fails atomically on revision conflict without mutating live config (#157)", async () => {
  let replaceAttempted = false
  const mockSettingsForms = {
    describe: () => [{ ns: "dsh-clinebot", revision: "rev-conflict-1" }],
    replace: async () => {
      replaceAttempted = true
      throw new Error("Revision conflict: document updated by another process")
    },
    update: async () => {},
  }

  const registeredRoutes = {}
  const mockCtx = {
    get: (name) => (name === "settings" ? mockSettingsForms : null),
    webServer: {
      register: (r) => {
        registeredRoutes[r.path] = r.handler
        return () => {}
      },
    },
    effect: (fn) => fn(),
  }

  const initialConfig = { enabled: true, baseUrl: "https://api.cline.bot/api/v1" }
  apply(mockCtx, initialConfig)

  const makeReq = (method, body = {}) => {
    const req = Readable.from([Buffer.from(JSON.stringify(body))])
    req.method = method
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

  await registeredRoutes["/dsh-clinebot/config"](makeReq("PUT", {
    config: { enabled: false }
  }), res)

  assert.equal(replaceAttempted, true, "Persistence must be attempted")
  assert.equal(status, 400, "PUT /config must fail with 400 on conflict")
  assert.match(JSON.parse(body).error, /Revision conflict/)

  // Live config must NOT be mutated to false
  let getStatus = 0
  let getBody = ""
  const getRes = {
    writeHead: (code) => { getStatus = code },
    end: (data) => { getBody = data },
  }
  await registeredRoutes["/dsh-clinebot/config"](makeReq("GET"), getRes)
  assert.equal(getStatus, 200)
  assert.equal(JSON.parse(getBody).config.enabled, true, "live config must remain true after failed persistence")
})

test("host: live config retains Volatile getters and reflects external updates after settings write (#157)", async () => {
  let volatileFlag = true
  const volatileConfigObj = {
    get enabled() { return volatileFlag },
    baseUrl: "https://api.cline.bot/api/v1",
    timeoutMs: 15000,
  }

  let persistedPayload = null
  const mockSettingsForms = {
    describe: () => [{ ns: "dsh-clinebot", revision: "rev-ok" }],
    replace: async (ns, payload) => {
      persistedPayload = payload
    },
    update: async () => {},
  }

  const registeredRoutes = {}
  const mockCtx = {
    get: (name) => (name === "settings" ? mockSettingsForms : null),
    webServer: {
      register: (r) => {
        registeredRoutes[r.path] = r.handler
        return () => {}
      },
    },
    effect: (fn) => fn(),
  }

  apply(mockCtx, volatileConfigObj)

  const makeReq = (method, body = {}) => {
    const req = Readable.from([Buffer.from(JSON.stringify(body))])
    req.method = method
    req.headers = { "sec-fetch-site": "same-origin" }
    req.socket = { remoteAddress: "127.0.0.1" }
    return req
  }

  // 1. Initial GET reflects volatileFlag = true
  let getRes1 = { writeHead: () => {}, end: (d) => { getRes1.body = d } }
  await registeredRoutes["/dsh-clinebot/config"](makeReq("GET"), getRes1)
  assert.equal(JSON.parse(getRes1.body).config.enabled, true)

  // 2. Successful PUT /config updates a non-volatile setting (timeoutMs)
  let putRes = { writeHead: () => {}, end: (d) => { putRes.body = d } }
  await registeredRoutes["/dsh-clinebot/config"](makeReq("PUT", {
    config: { timeoutMs: 20000 }
  }), putRes)
  assert.ok(persistedPayload)

  // 3. External change to Volatile (simulating native DSH card toggle)
  volatileFlag = false

  // 4. Subsequent GET /config must immediately reflect external Volatile change to false
  let getRes2 = { writeHead: () => {}, end: (d) => { getRes2.body = d } }
  await registeredRoutes["/dsh-clinebot/config"](makeReq("GET"), getRes2)
  assert.equal(JSON.parse(getRes2.body).config.enabled, false, "live config must reflect external volatile change, not stale snapshot")
})

test("host: live config retains native cosmokit volatile references without setter (#157, #173)", async () => {
  let flag = true
  const volatileRef = { get: () => flag }
  const cfg = {
    enabled: volatileRef,
    baseUrl: "https://api.cline.bot/api/v1",
    timeoutMs: 15000,
  }

  let persistedPayload = null
  const mockSettingsForms = {
    describe: () => [{ ns: "dsh-clinebot", revision: "rev-ok" }],
    replace: async (ns, payload) => {
      persistedPayload = payload
    },
    update: async () => {},
  }

  const registeredRoutes = {}
  const mockCtx = {
    get: (name) => (name === "settings" ? mockSettingsForms : null),
    webServer: {
      register: (r) => {
        registeredRoutes[r.path] = r.handler
        return () => {}
      },
    },
    effect: (fn) => fn(),
  }

  apply(mockCtx, cfg)

  const makeReq = (method, body = {}) => {
    const req = Readable.from([Buffer.from(JSON.stringify(body))])
    req.method = method
    req.headers = { "sec-fetch-site": "same-origin" }
    req.socket = { remoteAddress: "127.0.0.1" }
    return req
  }

  let getRes1 = { writeHead: () => {}, end: (d) => { getRes1.body = d } }
  await registeredRoutes["/dsh-clinebot/config"](makeReq("GET"), getRes1)
  assert.equal(JSON.parse(getRes1.body).config.enabled, true)

  let putRes = { writeHead: () => {}, end: (d) => { putRes.body = d } }
  await registeredRoutes["/dsh-clinebot/config"](makeReq("PUT", {
    config: { enabled: true }
  }), putRes)
  assert.ok(persistedPayload)
  assert.equal(cfg.enabled, volatileRef, "native volatile reference must remain intact on config object")

  flag = false

  let getRes2 = { writeHead: () => {}, end: (d) => { getRes2.body = d } }
  await registeredRoutes["/dsh-clinebot/config"](makeReq("GET"), getRes2)
  assert.equal(JSON.parse(getRes2.body).config.enabled, false, "live config must reflect updated volatile getter")
})


test("host: frozen config with native volatile references preserves reactivity through proxy overlay (#157, #173)", async () => {
  let enabled = false
  const config = Object.freeze({
    enabled: Object.freeze({ get: () => enabled }),
    statsPath: "/tmp/frozen-test.json",
  })

  let persisted = null
  const mockSettingsForms = {
    describe: () => [{ ns: "dsh-clinebot", revision: 1 }],
    replace: async (ns, payload) => {
      persisted = payload
      enabled = true
    },
    update: async () => {},
  }

  const registeredRoutes = {}
  const mockCtx = {
    get: (name) => (name === "settings" ? mockSettingsForms : null),
    webServer: {
      register: (r) => {
        registeredRoutes[r.path] = r.handler
        return () => {}
      },
    },
    effect: (fn) => fn(),
  }

  apply(mockCtx, config)

  const makeReq = (method, body = {}) => {
    const req = Readable.from([Buffer.from(JSON.stringify(body))])
    req.method = method
    req.headers = { "sec-fetch-site": "same-origin" }
    req.socket = { remoteAddress: "127.0.0.1" }
    return req
  }

  let putRes = { writeHead: () => {}, end: (d) => { putRes.body = d } }
  await registeredRoutes["/dsh-clinebot/config"](makeReq("PUT", {
    config: { enabled: true }
  }), putRes)

  enabled = false

  let getRes = { writeHead: () => {}, end: (d) => { getRes.body = d } }
  await registeredRoutes["/dsh-clinebot/config"](makeReq("GET"), getRes)
  const json = JSON.parse(getRes.body)
  assert.equal(json.config.enabled, false, "Dynamic volatile getter on frozen config must remain reactive")
})

async function loadNativeDshPiAi() {
  const candidates = [
    path.resolve(path.dirname(process.execPath), "../lib/node_modules/@deepseek-ai/dsh/node_modules/@deepseek-ai/dsh-llm-pi-ai/lib/index.js"),
    "/usr/local/lib/node_modules/@deepseek-ai/dsh/node_modules/@deepseek-ai/dsh-llm-pi-ai/lib/index.js",
    "/usr/lib/node_modules/@deepseek-ai/dsh/node_modules/@deepseek-ai/dsh-llm-pi-ai/lib/index.js",
  ]
  let home = null
  try {
    home = os.userInfo().homedir
  } catch {
    home = os.homedir() || process.env.HOME
  }
  if (home) {
    const nvmDir = path.join(home, ".nvm/versions/node")
    if (existsSync(nvmDir)) {
      try {
        const versions = readdirSync(nvmDir)
        for (const v of versions) {
          candidates.push(path.join(nvmDir, v, "lib/node_modules/@deepseek-ai/dsh/node_modules/@deepseek-ai/dsh-llm-pi-ai/lib/index.js"))
        }
      } catch {}
    }
  }

  for (const c of candidates) {
    if (existsSync(c)) {
      try {
        return await import(pathToFileURL(c).href)
      } catch {}
    }
  }
  return null
}

test("host: native DSH llm-pi-ai adapter accepts provider and populates model catalog (#173)", async (t) => {
  const { buildPiAiProvider } = await import("../lib/cline-client.js")
  const provider = buildPiAiProvider({
    baseUrl: "http://127.0.0.1:12345/v1",
    models: [{ id: "synthetic-model", name: "Synthetic" }],
  })

  // Compat flags must NOT contain rejected affinity flags
  assert.equal(provider.compat?.sendSessionAffinityHeaders, undefined)
  assert.equal(provider.compat?.sessionAffinityFormat, undefined)

  const mod = await loadNativeDshPiAi()
  if (!mod?.apply) {
    t.skip("native DSH adapter not found")
    return
  }
  const applyNative = mod.apply

  let adapter = null
  const ctx = {
    fiber: { entry: { options: { id: "llm-pi-ai" } } },
    inject() {},
    on() {},
    get() { return undefined },
    logger: { warn() {}, error() {} },
    llm: {
      registerConfigurableProviders() { return { replace() {} } },
      registerModelDiscovery() {},
      registerAdapter(routes, registered) {
        adapter = registered
        return { replace() {} }
      },
    },
  }

  applyNative(ctx, { providers: { get: () => ({ clinebot: provider }) } })
  const snapshot = adapter.current()
  const profile = snapshot.profiles.get("clinebot")
  assert.equal(profile.catalogError, undefined, "Native DSH llm-pi-ai must not report catalogError")
  const models = await adapter.listModels("clinebot")
  assert.ok(models.some((m) => m.id === "synthetic-model"))

  let modelError = null
  try {
    adapter.modelOf(snapshot, "clinebot", "synthetic-model")
  } catch (e) {
    modelError = e
  }
  assert.equal(modelError, null, "modelOf must resolve model without throwing")
})
