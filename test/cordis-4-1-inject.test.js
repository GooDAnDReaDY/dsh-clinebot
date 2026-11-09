import test from 'node:test'
import assert from 'node:assert/strict'
import { apply } from '../lib/index.js'
import { Config } from '../lib/config.js'
import { registerPluginUpdater } from '../lib/updater.js'
import { rotateToNextAccount } from '../lib/account-pool.js'

function createStrictCordisMock({ withWebServer = true } = {}) {
  const routes = []
  const cleanups = []

  const services = {
    llm: {
      registerAdapter: () => ({ replace: () => {} }),
      registerConfigurableProviders: () => () => {},
      listProviders: async () => [{ id: 'clinebot' }],
    },
    settings: {
      describe: () => [{ ns: 'dsh-clinebot', revision: 1 }],
      replace: async () => {},
      mutate: async () => {},
    },
    credentials: {
      resolve: async () => ({ value: 'test-key' }),
    },
  }

  if (withWebServer) {
    services.webServer = {
      register: (route) => {
        routes.push(route)
        return () => {}
      },
    }
  }

  function makeContext(injectedList = []) {
    const raw = {
      get: (k) => services[k],
      inject: (deps, cb) => {
        const child = makeContext([...injectedList, ...deps])
        cb(child)
      },
      effect: (fn) => {
        const cleanup = fn()
        if (typeof cleanup === 'function') cleanups.push(cleanup)
        return cleanup
      },
      on: () => {},
      logger: { warn() {}, info() {}, error() {} },
    }

    return new Proxy(raw, {
      get(target, prop) {
        if (typeof prop === 'string' && ['webServer', 'credentials', 'settings', 'tools', 'web'].includes(prop)) {
          if (!injectedList.includes(prop)) {
            throw new Error(`cannot get property "${prop}" without inject`)
          }
          return services[prop]
        }
        return target[prop]
      },
    })
  }

  return {
    rootCtx: makeContext([]),
    routes,
    cleanups,
    services,
  }
}

test('cordis 4.1.0: apply() activates and mounts web routes without throwing', () => {
  const { rootCtx, routes, cleanups } = createStrictCordisMock({ withWebServer: true })
  try {
    apply(rootCtx, Config({
      enabled: true,
      baseUrl: 'http://127.0.0.1:9',
      apiKeyEnv: 'CLINEBOT_API_KEY',
      defaultModel: 'cline-pass/deepseek-v4.1-flash',
    }))

    assert.ok(routes.length >= 8, `Expected at least 8 routes, got ${routes.length}`)
    const paths = routes.map((r) => r.path)
    assert.ok(paths.includes('/dsh-clinebot/update'), 'update route must be registered')
    assert.ok(paths.includes('/dsh-clinebot/status'), 'status route must be registered')
    assert.ok(paths.includes('/dsh-clinebot/analytics'), 'analytics route must be registered')
  } finally {
    for (const c of cleanups.reverse()) {
      try { c() } catch {}
    }
  }
})

test('cordis 4.1.0: apply() succeeds in headless profile without webServer', () => {
  const { rootCtx, routes, cleanups } = createStrictCordisMock({ withWebServer: false })
  try {
    apply(rootCtx, Config({
      enabled: true,
      baseUrl: 'http://127.0.0.1:9',
      apiKeyEnv: 'CLINEBOT_API_KEY',
    }))

    assert.equal(routes.length, 0, 'No routes should be mounted when webServer is absent')
  } finally {
    for (const c of cleanups.reverse()) {
      try { c() } catch {}
    }
  }
})

test('cordis 4.1.0: registerPluginUpdater() succeeds on un-injected context', () => {
  const { rootCtx, routes } = createStrictCordisMock({ withWebServer: true })
  // Calling registerPluginUpdater directly with rootCtx (where webServer is not injected)
  const unregister = registerPluginUpdater(rootCtx, {
    endpoint: '/dsh-clinebot/test-update',
    packageName: '@goodandready/dsh-clinebot',
    manifestUrl: new URL('../package.json', import.meta.url),
  })
  assert.equal(typeof unregister, 'function')
  assert.ok(routes.some((r) => r.path === '/dsh-clinebot/test-update'))
})

test('cordis 4.1.0: rotateToNextAccount() handles un-injected context without throwing', async () => {
  const { rootCtx } = createStrictCordisMock({ withWebServer: true })
  const cfg = {
    apiKeyEnv: 'KEY_1',
    accounts: [
      { apiKeyEnv: 'KEY_1', label: 'Primary' },
      { apiKeyEnv: 'KEY_2', label: 'Secondary' },
    ],
  }
  // Should not throw even if rootCtx has not injected 'settings'
  const result = await rotateToNextAccount(rootCtx, cfg, 'rate_limit')
  assert.equal(typeof result, 'object')
})
