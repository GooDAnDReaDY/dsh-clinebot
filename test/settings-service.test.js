import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
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
