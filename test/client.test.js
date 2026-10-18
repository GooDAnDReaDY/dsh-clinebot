/**
 * The browser half's activation contract, exercised against the real bundle.
 *
 * `lib/client.js` is loaded the way the shell loads it — a script that calls
 * `window.__ModuleLoader__.load` and hands back a factory — and then `apply` is
 * driven with a recording context. That is enough to cover the class of bug that
 * actually shipped twice in this file:
 *
 *  - the stylesheet used to be injected from a React mount effect, so the sidebar
 *    meter and the dashboard rendered unstyled until the plugin page was opened;
 *  - the configuration page used to be registered on the Plugins page seats.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const NS = 'dsh-clinebot'
const STYLE_ID = 'dsh-clinebot-full-css'

/** Seats the plugin must occupy, and the ones it must no longer. */
const EXPECTED_SLOTS = [
  'settings.section',
  'sidebar.footer.action',
  'conversation.composer.dock',
]
const RETIRED_SLOTS = [
  'plugins.item',
  'plugins.row.config',
  'settings.plugin.item',
  // Dispatched on every provider row regardless of whether it is open, with no
  // open state in its props, so anything here reads as an editor that opened itself.
  'settings.models.provider-card',
  // The quota read-out is a window opened from the meter; taking the centre
  // column for it threw the conversation out of the way.
  'main',
]

/** React stand-in: the factory only needs the module to exist at load time. */
const reactStub = {
  createElement: () => null,
  memo: (x) => x,
  useMemo: (fn) => fn(),
  useCallback: (fn) => fn,
  useState: (value) => [value, () => {}],
  useEffect: () => {},
  useRef: (value) => ({ current: value }),
  useSyncExternalStore: () => ({ status: 'ready', view: null }),
}

const primitivesStub = {
  Switch: () => null,
  Button: () => null,
  IconChevronDownOutlineRegular: () => null,
}

/**
 * Evaluate the bundle and drive `apply` with a recording context.
 * @returns the recorded slots, registrations, style elements and locale dictionaries.
 */
function activate() {
  const styles = []
  const document = {
    head: { appendChild: (el) => styles.push(el) },
    getElementById: () => null,
    querySelector: () => null,
    createElement: () => ({ dataset: {}, textContent: '' }),
  }
  let factory = null
  const window = { __ModuleLoader__: { load: (def) => { factory = def.factory } } }

  const sandbox = { window, document, console, setTimeout, clearTimeout }
  sandbox.globalThis = sandbox
  vm.runInNewContext(fs.readFileSync(path.join(root, 'lib/client.js'), 'utf8'), sandbox, { filename: 'lib/client.js' })

  assert.equal(typeof factory, 'function', 'bundle must register a factory with the shell')
  const exported = factory((id) => {
    if (id === 'react') return reactStub
    if (id === '@deepseek-ai/dsh-client-ui-primitives') return primitivesStub
    throw new Error(`bundle required an unexpected module: ${id}`)
  })
  assert.equal(typeof exported.apply, 'function')
  assert.ok(Array.isArray(exported.inject))

  const injected = []
  const registrations = []
  const dictionaries = []
  const effects = []

  const ctx = {
    slots: {
      inject: (name, register) => { injected.push({ name, register }) },
      register: (options, render) => { registrations.push({ options, render }) },
    },
    locale: {
      register: (ns, locale, dict) => { dictionaries.push({ ns, locale, dict }); return () => {} },
      bind: () => (key) => key,
    },
    effect: (fn) => { effects.push(fn()); return () => {} },
    get: () => undefined,
  }

  exported.apply(ctx)

  return { exported, injected, registrations, dictionaries, styles, effects }
}

/** Run every deferred `slots.inject` callback, which is what performs registration. */
function settle(injected) {
  for (const entry of injected) entry.register()
}

test('the stylesheet is in the document as soon as apply returns', () => {
  const { styles } = activate()
  assert.equal(styles.length, 1, 'apply must inject the stylesheet itself, not a React effect')
  assert.equal(styles[0].id, STYLE_ID)
  assert.equal(styles[0].dataset.dshPlugin, NS)
  assert.match(styles[0].textContent, /\.cb-foot\{/)
})

test('the stylesheet carries the DSH design tokens', () => {
  const css = activate().styles[0].textContent
  for (const token of ['--dsw-alias-settings-card-stroke', '--dsw-alias-settings-card-fill', '--dsw-radius-xl', '--dsw-radius-md']) {
    assert.ok(css.includes(token), `stylesheet should use ${token}`)
  }
  // The host's footer *container* is off limits; the action list is the one
  // exception and it is scoped (see the stacking test below).
  assert.ok(!/class\*="_footArea"/.test(css), 'must not reach into the host sidebar footer container')
})

test('the configuration page is a settings section, not a Plugins-page seat', () => {
  const { injected } = activate()
  const names = [...new Set(injected.map((entry) => entry.name))]

  for (const slot of EXPECTED_SLOTS) {
    assert.ok(names.includes(slot), `expected a registration on ${slot}`)
  }
  for (const slot of RETIRED_SLOTS) {
    assert.ok(!names.includes(slot), `${slot} is retired; configuration lives in Settings`)
  }
  assert.deepEqual([...names].sort(), [...EXPECTED_SLOTS].sort())
})

test('settings.section is registered with the id, order and localized label the shell needs', () => {
  const { injected, registrations } = activate()
  settle(injected)

  const sections = registrations.filter((entry) => entry.options.name === 'settings.section')
  assert.equal(sections.length, 1)
  const { options } = sections[0]
  assert.equal(options.id, NS)
  assert.equal(options.order, 30)
  assert.equal(typeof options.label, 'function', 'label must be a thunk so it follows the active locale')
  assert.equal(options.label(), 'ClineBot')
  assert.equal(typeof sections[0].render, 'function')
})

test('the footer action list is stacked, but only where this meter is in it', () => {
  const css = activate().styles[0].textContent

  // The shell renders the list as a row, which a full-width meter cannot share
  // with another plugin's entry — so the list is stacked while the meter is there.
  assert.match(css, /\[class\*="_footerActions"\]:has\(\.cb-foot\)/)
  assert.match(css, /\[class\*="_footerActions"\]:has\(\.cb-railButton\)/)

  // Scoping matters: a bare descendant selector would reach into every plugin's
  // footer, which is what this rule used to do.
  for (const rule of css.match(/[^\n{]*_footerActions[^\n{]*\{/g) || []) {
    assert.ok(rule.includes(':has('), `unscoped host override: ${rule.trim()}`)
  }
})

test('the sidebar meter and composer dock renderers are registered on their seats', () => {
  const { injected, registrations } = activate()
  settle(injected)

  const byName = (name) => registrations.filter((entry) => entry.options.name === name)
  assert.equal(byName('sidebar.footer.action').length, 1)
  assert.equal(byName('sidebar.footer.action')[0].options.id, 'clinebot-quota')
  assert.equal(byName('conversation.composer.dock').length, 1)
  for (const entry of registrations) {
    assert.equal(typeof entry.render, 'function', `${entry.options.name} needs a renderer`)
  }
})

test('the quota read-out is a window, not a panel', () => {
  const source = fs.readFileSync(path.join(root, 'src/client/components/sidebar-quota.js'), 'utf8')
  const dialog = fs.readFileSync(path.join(root, 'src/client/components/dashboard-dialog.js'), 'utf8')

  // The meter opens a dialog and never navigates the centre column.
  assert.match(source, /DashboardDialog/)
  assert.ok(!/selectPanel/.test(source), 'the meter must not select a panel')

  // And the dialog is the shell's own window when the primitive is there.
  assert.match(dialog, /if \(Modal\)/)
  assert.match(dialog, /React\.createElement\(Modal, \{/)
  assert.ok(!/cb-mainOverlay/.test(dialog), 'the old full-bleed panel is gone')
})

test('the plugin declares the services its client half reads', () => {
  const { exported } = activate()
  // Copy into this realm: the array is built inside the vm context, so a strict
  // deep-equal would fail on the prototype alone.
  assert.deepEqual(Array.from(exported.inject), ['slots', 'locale', 'configForms'])
})

test('both locale dictionaries are registered and cover the same keys', () => {
  const { dictionaries } = activate()
  const locales = dictionaries.filter((entry) => entry.ns === NS).map((entry) => entry.locale)
  assert.deepEqual(locales, ['en', 'zh'])

  const byLocale = Object.fromEntries(dictionaries.filter((entry) => entry.ns === NS).map((entry) => [entry.locale, entry.dict]))
  const en = Object.keys(byLocale.en).sort()
  const zh = Object.keys(byLocale.zh).sort()
  assert.ok(en.length > 0)
  assert.deepEqual(zh, en, 'zh must define exactly the keys en defines')
  assert.ok(en.includes('nav'), 'the settings section label reads the nav key')
})
