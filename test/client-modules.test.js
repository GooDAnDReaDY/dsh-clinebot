import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import vm from "node:vm"
import { fileURLToPath } from "node:url"
import path from "node:path"

const root = fileURLToPath(new URL("../", import.meta.url))

const ReactStub = { createElement: () => null }

function loadClientRecord() {
  const source = readFileSync(path.join(root, "lib", "client.js"), "utf8")
  const records = []
  const sandbox = {
    window: {
      __ModuleLoader__: {
        load(record) {
          records.push(record)
        },
      },
    },
  }
  vm.createContext(sandbox)
  vm.runInContext(source, sandbox, { filename: "lib/client.js" })
  assert.equal(records.length, 1)
  return records[0]
}

function strictRequire(seen) {
  return (spec) => {
    if (spec === "react") {
      seen.push(spec)
      return ReactStub
    }
    throw new Error("client-modules: require(" + JSON.stringify(spec) + ") missed the module table")
  }
}

test("client: bundle registers under the kernel module loader id", () => {
  const record = loadClientRecord()
  assert.equal(record.id, "@goodandready/dsh-clinebot")
})

test("client: factory materializes with a strict module table", () => {
  const record = loadClientRecord()
  const seen = []
  const exports = record.factory(strictRequire(seen))
  assert.deepEqual(Array.from(exports.inject).sort(), ["locale", "settingsScope", "slots"])
  assert.equal(typeof exports.apply, "function")
  assert.equal(seen.includes("@deepseek-ai/dsh-client-ui-primitives"), false)
})

test("client: apply registers settings.plugin.item exclusively without settings.section", () => {
  const record = loadClientRecord()
  const exports = record.factory(strictRequire([]))

  const primaryRegistrations = []
  const primaryInjected = []
  const ctxPrimary = {
    effect: (fn) => fn(),
    locale: { register() {}, bind: () => (k) => k },
    slots: {
      inject(name, cb) {
        primaryInjected.push(name)
        return cb()
      },
      register(decl) {
        primaryRegistrations.push(decl)
        return decl
      },
    },
    settingsScope: {
      describe: () => ({
        getSnapshot: () => ({ view: { namespaces: [{ ns: "dsh-clinebot" }] } }),
        load() {},
      }),
    },
  }
  exports.apply(ctxPrimary)
  assert.deepEqual(primaryInjected, ["settings.plugin.item"])
  assert.equal(primaryRegistrations.length, 1)
  assert.equal(primaryRegistrations[0].name, "settings.plugin.item")
  assert.equal(primaryRegistrations[0].key, "dsh-clinebot")
  assert.equal(primaryRegistrations[0].locale, "dsh-clinebot")
  assert.ok(!primaryRegistrations.some((r) => r.name === "settings.section"), "settings.section must not be registered")
})

test("client: dsh.client.inject names only modules the factory resolves", () => {
  const pkg = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8"))
  const source = readFileSync(path.join(root, "lib", "client.js"), "utf8")
  const specifiers = Array.from(source.matchAll(/require\((\x22)(.+?)\1\)/g), (m) => m[2])
  for (const spec of specifiers) {
    assert.equal(spec.startsWith("@deepseek-ai/"), false, "client.js requires a module missing from the kernel table: " + spec)
  }
  const inject = (pkg.dsh && pkg.dsh.client && pkg.dsh.client.inject) || []
  for (const name of inject) {
    assert.equal(name.startsWith("@deepseek-ai/"), false, "dsh.client.inject names a module missing from the kernel table: " + name)
    assert.ok(specifiers.includes(name), "dsh.client.inject names a module the factory never requires: " + name)
  }
})

test("client: full component tree render and event handler integrity", () => {
  const record = loadClientRecord()
  const mockData = {
    config: { apiKeyEnv: 'CLINEBOT_API_KEY', enabledModels: ['cline-pass/deepseek-v4-flash'], defaultModel: 'cline-pass/deepseek-v4-flash' },
    accounts: [{ id: 'default', label: 'Default', apiKeyEnv: 'CLINEBOT_API_KEY', present: true, source: 'credentials' }],
    health: { ok: true, latencyMs: 35 },
    key: { present: true, source: 'credentials' },
    isRegistered: true,
    availableModels: [{ id: 'cline-pass/deepseek-v4-flash', name: 'DeepSeek V4 Flash', contextLength: 200000, category: 'coding', input: ['text', 'image'] }],
    usage: {
      user: { email: 'user@example.com' },
      windows: {
        fiveHour: { percentUsed: 15, remainingPercent: 85, resetsAt: '2026-09-09T22:00:00Z' },
        weekly: { percentUsed: 30, remainingPercent: 70, resetsAt: '2026-09-12T00:00:00Z' }
      }
    },
    sessionStats: { totalRequests: 10, successfulRequests: 10, totalTokensEst: 4500, lastLatencyMs: 35, lastRequestAt: Date.now() }
  }

  let hookIndex = 0
  const states = [
    true, // PluginCard open = true
    mockData,
    mockData.config,
    '',
    '',
    '',
    { latencyMs: 35, model: 'test', preview: 'hello' },
    '',
    false
  ]

  const ReactMock = {
    useState: (initial) => {
      const val = hookIndex < states.length ? states[hookIndex] : initial
      hookIndex++
      return [val, () => {}]
    },
    useEffect: (cb) => { cb() },
    useCallback: (cb) => cb,
    useMemo: (cb) => cb(),
    useSyncExternalStore: (sub, getSnap) => getSnap(),
    createElement: (tag, props, ...children) => {
      const finalProps = Object.assign({}, props, { children: children.length === 1 ? children[0] : (children.length > 1 ? children : undefined) })
      return { tag, props: finalProps, children }
    },
    Component: class Component {
      constructor(props) { this.props = props; this.state = {} }
    }
  }
  ReactMock.Component.prototype.isReactComponent = {}

  const exports = record.factory((spec) => {
    if (spec === 'react') return ReactMock
    throw new Error('Unexpected: ' + spec)
  })

  let registered = {}
  const ctx = {
    effect: (fn) => fn(),
    slots: {
      inject: (name, cb) => {
        if (name === 'settings.plugin.item') return cb()
        return null
      },
      register: (opts, comp) => { registered[opts.name] = comp; return opts }
    },
    locale: { register: () => {}, bind: () => (k) => k },
    settingsScope: {
      describe: () => ({
        getSnapshot: () => ({ view: { namespaces: [{ ns: 'dsh-clinebot' }] } }),
        load: () => {}
      }),
      bind: () => ({
        subscribe: () => () => {},
        getSnapshot: () => ({ status: 'ready', value: {} }),
        set: async () => {}
      })
    }
  }

  exports.apply(ctx)
  const pluginCardItem = registered['settings.plugin.item']
  assert.equal(typeof pluginCardItem, 'function')
  assert.equal(registered['settings.section'], undefined, 'settings.section must not be registered')

  hookIndex = 0
  const vdom = pluginCardItem({ ctx })

  let elementsFound = 0
  function traverse(node, depth = 0) {
    if (!node) return
    elementsFound++
    if (typeof node.tag === 'function') {
      if (node.tag.prototype && node.tag.prototype.isReactComponent) {
        const inst = new node.tag(node.props)
        traverse(inst.render(), depth + 1)
      } else {
        traverse(node.tag(node.props), depth + 1)
      }
    }
    if (node.children) {
      if (Array.isArray(node.children)) {
        node.children.forEach(c => {
          if (Array.isArray(c)) c.forEach(x => traverse(x, depth + 1))
          else traverse(c, depth + 1)
        })
      } else {
        traverse(node.children, depth + 1)
      }
    }
  }

  traverse(vdom)
  assert.ok(elementsFound > 100, `Expected full tree evaluation, found ${elementsFound}`)
})
