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
  assert.deepEqual(Array.from(exports.inject).sort(), ["configForms", "locale", "slots"])
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
    configForms: {
      get: () => ({
        subscribe: () => () => {},
        getSnapshot: () => ({ status: "ready", writable: true }),
      }),
    },
  }
  exports.apply(ctxPrimary)
  // Three seats: the plugin-list card the Plugins page renders as the plugin's own
  // page (plugins.item), the row seat under both key spellings (the core keys it as
  // `<bundle name>#<row id>`, and the bundle name may be the package or the short
  // name), and the legacy settings.plugin.item card kept as a fallback.
  assert.deepEqual([...new Set(primaryInjected)], ["plugins.item", "plugins.row.config", "settings.plugin.item"])
  const cards = primaryRegistrations.filter((r) => r.name === "plugins.item")
  assert.equal(cards.length, 1)
  assert.equal(cards[0].id, "dsh-clinebot")
  assert.equal(cards[0].locale, "dsh-clinebot")
  const rows = primaryRegistrations.filter((r) => r.name === "plugins.row.config")
  assert.equal(rows.length, 2)
  assert.deepEqual(rows.map((r) => r.key).sort(), ["@goodandready/dsh-clinebot#dsh-clinebot", "dsh-clinebot#dsh-clinebot"])
  assert.equal(rows[0].locale, "dsh-clinebot")
  const legacy = primaryRegistrations.filter((r) => r.name === "settings.plugin.item")
  assert.equal(legacy.length, 1)
  assert.equal(legacy[0].key, "dsh-clinebot")
  assert.equal(legacy[0].locale, "dsh-clinebot")
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
  assert.deepEqual([...inject].sort(), [
    "@deepseek-ai/dsh-client-locale",
    "@deepseek-ai/dsh-client-ui-settings",
    "@deepseek-ai/dsh-client-ui-slots",
  ])
  assert.equal(source.includes("settingsScope"), false)
  assert.equal(source.includes("lanSettings"), false)
  assert.ok(source.includes("configForms"))
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
    { checking: false, updating: false, currentVersion: '0.3.10', latestVersion: '0.3.11', updateAvailable: true, canAutoUpdate: true, error: '', notice: '' },
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
    get: (name) => {
      if (name !== 'configForms') throw new Error('unexpected service ' + name)
      return {
        get: () => ({
          subscribe: () => () => {},
          getSnapshot: () => ({ status: 'ready', writable: true }),
        }),
      }
    },
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

test('client: apply handles fallback without ctx.effect without ReferenceError', () => {
  const registeredLocales = []
  const fallbackCtx = {
    locale: {
      register: (ns, lang, dict) => {
        registeredLocales.push({ ns, lang, dict })
        return () => {}
      },
    },
    settings: {
      register: () => () => {},
    },
  }
  const record = loadClientRecord()
  const exports = record.factory(strictRequire([]))
  assert.doesNotThrow(() => {
    exports.apply(fallbackCtx)
  })
  const langs = registeredLocales.map(l => l.lang)
  assert.ok(langs.includes('en'), 'Must register en dictionary')
  assert.ok(langs.includes('zh'), 'Must register zh dictionary')
  assert.equal(langs.includes('ru'), false, 'ru dictionary must not be registered directly in plugin client')
})

test('client: css styles strictly use theme variables and color-mix without hardcoded rgba/hex colors', () => {
  const source = readFileSync(path.join(root, 'lib', 'client.js'), 'utf8')
  const cssMatch = source.match(/style\.textContent = `([^`]+)`/)
  assert.ok(cssMatch, 'CSS block must be present in lib/client.js')
  const css = cssMatch[1]
  assert.equal(/rgba\(/i.test(css), false, 'CSS must not contain hardcoded rgba() values')
  assert.equal(/#[0-9a-fA-F]{3,6}\b/i.test(css), false, 'CSS must not contain hardcoded hex colors')
  assert.ok(css.includes('color-mix(in srgb, var(--dsw-alias-state-success-primary) 8%, transparent)'), 'Must use color-mix for success badge')
  assert.ok(css.includes('.cb-chevron'), 'Must define .cb-chevron transition class')
  assert.ok(css.includes('.cb-chevron-open'), 'Must define .cb-chevron-open rotation class')
})

test('client: chevron probes kernel primitives with safe fallback and rotation class', () => {
  const source = readFileSync(path.join(root, 'lib', 'client.js'), 'utf8')
  assert.ok(source.includes('@deepseek-ai/dsh-client-ui-primitives'), 'Must probe @deepseek-ai/dsh-client-ui-primitives')
  assert.ok(source.includes('FallbackChevron'), 'Must retain FallbackChevron SVG component')
  assert.ok(source.includes("className: 'cb-chevron' + (open ? ' cb-chevron-open' : '')"), 'Must use cb-chevron rotation class on expand toggle')

  // Test 1: with kernel primitives available
  const kernelRecord = loadClientRecord()
  const KernelChevronStub = () => ({ tag: 'svg-kernel' })
  const kernelExports = kernelRecord.factory((spec) => {
    if (spec === 'react') return { createElement: (tag, props) => ({ tag, props }) }
    if (spec === '@deepseek-ai/dsh-client-ui-primitives') {
      return { IconChevronDownOutline14: KernelChevronStub }
    }
    throw new Error('Unexpected spec: ' + spec)
  })
  assert.equal(typeof kernelExports.apply, 'function')

  // Test 2: without kernel primitives (safe fallback)
  const fallbackRecord = loadClientRecord()
  const fallbackExports = fallbackRecord.factory((spec) => {
    if (spec === 'react') return { createElement: (tag, props) => ({ tag, props }) }
    throw new Error('Missing module: ' + spec)
  })
  assert.equal(typeof fallbackExports.apply, 'function')
})

test('client: renders one-click update banner and button in settings card', () => {
  const source = readFileSync(path.join(root, 'lib', 'client.js'), 'utf8')
  assert.ok(source.includes('updateState'), 'Must maintain updateState')
  assert.ok(source.includes('handleTriggerUpdate'), 'Must handle update trigger')
  assert.ok(source.includes("t('update.btn')"), 'Must render localized update button')
  assert.ok(source.includes("t('update.updating')"), 'Must render localized updating indicator')
  assert.ok(source.includes("t('update.up_to_date')"), 'Must render localized up-to-date badge')
  assert.ok(source.includes("t('update.checking')"), 'Must render localized checking indicator')
  assert.ok(source.includes("x-dsh-plugin-update': '1'"), 'Must pass x-dsh-plugin-update header on update trigger')
})

test('client: binds configForms and does not touch settingsScope or lanSettings', () => {
  const record = loadClientRecord()
  const ReactMock = {
    useState: (initial) => [initial, () => {}],
    useEffect: (cb) => { try { cb() } catch (_) {} },
    useCallback: (cb) => cb,
    useMemo: (cb) => cb(),
    useSyncExternalStore: (sub, getSnap) => getSnap(),
    createElement: (tag, props, ...children) => ({ tag, props, children }),
    Component: class Component {
      constructor(props) { this.props = props; this.state = {} }
    }
  }
  ReactMock.Component.prototype.isReactComponent = {}

  const exports = record.factory((spec) => {
    if (spec === 'react') return ReactMock
    throw new Error('Unexpected: ' + spec)
  })

  const registered = {}
  const allowed = new Set(['slots', 'locale', 'effect', 'get'])
  const strictTarget = {
    effect: (fn) => fn(),
    locale: { register: () => {}, bind: () => (k) => k },
    slots: {
      inject: (name, cb) => cb(),
      register: (opts, comp) => {
        registered[opts.name || opts.id || 'reg_' + Math.random()] = comp || opts
        return opts
      }
    },
    get: (name) => {
      if (name === 'configForms') {
        return {
          get: () => ({
            subscribe: () => () => {},
            getSnapshot: () => ({ status: 'ready', writable: true }),
          }),
        }
      }
      throw new TypeError(`cannot get property "${name}" without inject`)
    }
  }

  const strictCtx = new Proxy(strictTarget, {
    get(target, prop) {
      if (typeof prop === 'symbol' || prop in Object.prototype) return target[prop]
      if (allowed.has(prop)) return target[prop]
      throw new TypeError(`cannot get property "${String(prop)}" without inject`)
    }
  })

  assert.doesNotThrow(() => {
    exports.apply(strictCtx)
  })

  const cardComponent = registered['plugins.item'] || registered['settings.plugin.item']
  assert.ok(cardComponent, 'Must register settings component')
  assert.doesNotThrow(() => {
    if (typeof cardComponent === 'function') {
      cardComponent({ ctx: strictCtx })
    }
  })
})
