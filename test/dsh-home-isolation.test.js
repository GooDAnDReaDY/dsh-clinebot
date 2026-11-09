import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { apply } from '../lib/index.js'
import { Config } from '../lib/config.js'
import { recordUsage, saveStatsSync } from '../lib/stats-storage.js'
import {
  dshHome,
  defaultStatsPath,
  defaultEventLogPath,
  defaultPriceCatalogPath,
  defaultModelsCachePath,
  resolveDataPath,
} from '../lib/path-safety.js'

test('dsh-home-isolation: profile isolation with custom DSH_HOME (#299)', () => {
  const synthHome = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-isolation-home-'))
  const synthDshHome = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-isolation-dsh-'))

  const origHome = process.env.HOME
  const origDshHome = process.env.DSH_HOME

  process.env.HOME = synthHome
  process.env.DSH_HOME = synthDshHome

  try {
    assert.equal(dshHome(), synthDshHome)
    assert.equal(defaultStatsPath(), path.join(synthDshHome, 'clinebot-stats.json'))
    assert.equal(defaultEventLogPath(), path.join(synthDshHome, 'clinebot-events.json'))
    assert.equal(defaultPriceCatalogPath(), path.join(synthDshHome, 'clinebot-prices.json'))
    assert.equal(defaultModelsCachePath(), path.join(synthDshHome, 'clinebot-models-cache.json'))

    assert.equal(resolveDataPath('~/.dsh/custom-stats.json'), path.join(synthDshHome, 'custom-stats.json'))

    const cleanups = []
    const services = {
      router: {
        get() {},
        post() {},
        put() {},
        delete() {},
      },
    }
    const child = {
      get: (name) => services[name],
      logger: { warn() {}, info() {}, error() {} },
      on() {},
      effect(fn) {
        const cleanup = fn()
        if (typeof cleanup === 'function') cleanups.push(cleanup)
        return cleanup
      },
    }
    const ctx = {
      ...child,
      inject(_names, callback) {
        callback(child)
      },
    }

    apply(ctx, Config({
      enabled: true,
      baseUrl: 'http://127.0.0.1:9',
      apiKeyEnv: 'CLINEBOT_API_KEY',
      defaultModel: 'cline-pass/deepseek-v4.1-flash',
      dynamicModels: [],
    }))

    recordUsage({
      model: 'cline-pass/deepseek-v4.1-flash',
      promptTokens: 42,
      completionTokens: 24,
      totalTokens: 66,
    })
    saveStatsSync()

    for (const cleanup of cleanups) {
      cleanup()
    }

    const expectedStatsPath = path.join(synthDshHome, 'clinebot-stats.json')
    assert.equal(fs.existsSync(expectedStatsPath), true, 'Stats must be written into active DSH_HOME')

    const statsContent = JSON.parse(fs.readFileSync(expectedStatsPath, 'utf8'))
    assert.ok(statsContent.totals.requests >= 1)

    const leakedHomeDsh = path.join(synthHome, '.dsh')
    assert.equal(fs.existsSync(leakedHomeDsh), false, 'HOME/.dsh must NOT be created when DSH_HOME is isolated')
  } finally {
    if (origHome === undefined) delete process.env.HOME
    else process.env.HOME = origHome

    if (origDshHome === undefined) delete process.env.DSH_HOME
    else process.env.DSH_HOME = origDshHome

    fs.rmSync(synthHome, { recursive: true, force: true })
    fs.rmSync(synthDshHome, { recursive: true, force: true })
  }
})

test('dsh-home-isolation: updater respects DSH_HOME (#308)', async () => {
  const synthDshHome = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-isolation-upd-'))
  const origDshHome = process.env.DSH_HOME
  const origProfileDir = process.env.DSH_PROFILE_DIR

  delete process.env.DSH_PROFILE_DIR
  process.env.DSH_HOME = synthDshHome

  try {
    const { detectRuntime } = await import('../lib/updater.js')
    const runtime = detectRuntime()
    assert.equal(runtime.profileDir, path.join(synthDshHome, 'profiles', 'web'))
  } finally {
    if (origDshHome === undefined) delete process.env.DSH_HOME
    else process.env.DSH_HOME = origDshHome

    if (origProfileDir === undefined) delete process.env.DSH_PROFILE_DIR
    else process.env.DSH_PROFILE_DIR = origProfileDir

    fs.rmSync(synthDshHome, { recursive: true, force: true })
  }
})
