import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import path from "node:path"

const root = fileURLToPath(new URL("../", import.meta.url))

test("host: lib/index.js registers settings namespace via ctx.inject(['settings'])", () => {
  const indexSource = readFileSync(path.join(root, "lib", "index.js"), "utf8")

  // 1. Must use ctx.inject(['settings'], ...)
  assert.ok(
    indexSource.includes("ctx.inject(['settings']") || indexSource.includes('ctx.inject(["settings"]'),
    "lib/index.js must register settings inside ctx.inject(['settings'], (sctx) => ...)"
  )

  // 2. Must register NS, Config with base options
  assert.ok(
    indexSource.includes("sctx.settings.register(NS, Config, { base: config })"),
    "sctx.settings.register must be called with NS, Config, { base: config }"
  )

  // 3. Must not call bare ctx.get('settings') synchronously in apply
  assert.ok(
    !indexSource.includes("const settingsService = ctx.get('settings')"),
    "Synchronous ctx.get('settings') must not be used in apply"
  )

  // 4. Must use scope.watch to sync live provider state
  assert.ok(
    indexSource.includes("scope.watch"),
    "scope.watch must be used to observe settings changes"
  )
})

test("host: resolveKeyValue uses ctx.get('credentials') safely without bare property access", () => {
  const clineClientSource = readFileSync(path.join(root, "lib", "cline-client.js"), "utf8")

  // Check safe credentials resolution:
  assert.ok(
    clineClientSource.includes("(ctx?.get && ctx.get('credentials')) || ctx?.credentials"),
    "resolveKeyValue must check ctx.get('credentials')"
  )
  assert.ok(
    !clineClientSource.includes("if (ctx?.credentials && typeof ctx.credentials.resolve"),
    "Unsafe bare ctx.credentials property access must not be used"
  )
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
