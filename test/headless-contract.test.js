import test from 'node:test'
import assert from 'node:assert/strict'
import os from 'node:os'
import path from 'node:path'
import { rmSync } from 'node:fs'
import { apply } from '../lib/index.js'
import { Config } from '../lib/config.js'

const statsPath = path.join(os.tmpdir(), `clinebot-headless-contract-${process.pid}-${Date.now()}.json`)

test('headless contract: adapter, routes and slash command register without the UI', async () => {
  const calls = { adapters: [], providers: [], routes: [], commands: [], cleanups: [] }
  const llm = {
    registerAdapter(routes, adapter) {
      calls.adapters.push({ routes, adapter })
      return { replace: () => {} }
    },
    registerConfigurableProviders(entries) {
      calls.providers.push(...entries)
      return () => {}
    },
    listProviders: async () => [{ id: 'clinebot' }],
  }
  const commands = {
    register(definition) {
      calls.commands.push(definition)
      return () => {}
    },
  }
  const webServer = {
    register(route) {
      calls.routes.push(route)
      return () => {}
    },
  }
  const settings = {
    describe: () => [{ ns: 'dsh-clinebot', revision: 1 }],
    replace: async () => {},
    mutate: async () => {},
  }
  const services = {
    llm,
    commands,
    webServer,
    settings,
    credentials: { resolve: async () => ({ value: 'test-key' }) },
  }
  const child = {
    ...services,
    get: (name) => services[name],
    logger: { warn() {}, info() {}, error() {} },
    on() {},
    effect(fn) {
      const cleanup = fn()
      if (typeof cleanup === 'function') calls.cleanups.push(cleanup)
      return cleanup
    },
  }
  const ctx = {
    ...child,
    inject(_names, callback) {
      callback(child)
    },
  }

  try {
    apply(ctx, Config({
      enabled: true,
      baseUrl: 'http://127.0.0.1:9',
      apiKeyEnv: 'CLINEBOT_API_KEY',
      defaultModel: 'cline-pass/deepseek-v4.1-flash',
      dynamicModels: [],
      statsPath,
    }))

    assert.equal(calls.adapters.length, 1, 'adapter must be registered once')
    assert.deepEqual(calls.adapters[0].routes, ['clinebot'])
    assert.equal(typeof calls.adapters[0].adapter.stream, 'function')
    assert.equal(typeof calls.adapters[0].adapter.listModels, 'function')
    assert.equal(calls.providers[0]?.provider, 'clinebot')

    assert.equal(calls.commands.length, 1)
    assert.equal(calls.commands[0].name, 'cline')
    assert.match(calls.commands[0].description, /cost/)

    const paths = calls.routes.map((route) => route.path)
    for (const expected of [
      '/dsh-clinebot/status',
      '/dsh-clinebot/analytics',
      '/dsh-clinebot/stats/session',
      '/dsh-clinebot/prices',
      '/dsh-clinebot/prices/sync',
      '/dsh-clinebot/models/sync',
      '/dsh-clinebot/accounts/usage',
    ]) {
      assert.ok(paths.includes(expected), `missing route ${expected}`)
    }
    assert.ok(!paths.some((route) => route.includes('/v1/')), 'removed proxy routes must not return')
    assert.ok(!paths.includes('/dsh-clinebot/register'), 'removed register route must not return')
  } finally {
    for (const cleanup of calls.cleanups.reverse()) {
      try { cleanup() } catch {}
    }
    rmSync(statsPath, { force: true })
  }
})
