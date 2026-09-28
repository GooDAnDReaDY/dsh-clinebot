import test from 'node:test'
import assert from 'node:assert/strict'
import { rotateToNextAccount, isAccountQuotaExhausted } from '../lib/account-pool.js'
import { usageCache, probeCache } from '../lib/cline-client.js'

test('failover: isAccountQuotaExhausted logic and auto-recovery', () => {
  // 1. Under 95% is not exhausted
  assert.equal(isAccountQuotaExhausted({ windows: { fiveHour: { percentUsed: 50 } } }), false)
  assert.equal(isAccountQuotaExhausted({ windows: { fiveHour: { percentUsed: 94.9 } } }), false)

  // 2. >= 95% with future resetsAt is exhausted
  const future = new Date(Date.now() + 3600_000).toISOString()
  assert.equal(isAccountQuotaExhausted({ windows: { fiveHour: { percentUsed: 98, resetsAt: future } } }), true)

  // 3. >= 95% with past resetsAt is recovered (not exhausted)
  const past = new Date(Date.now() - 60_000).toISOString()
  assert.equal(isAccountQuotaExhausted({ windows: { fiveHour: { percentUsed: 99, resetsAt: past } } }), false)

  // 4. Missing window or null
  assert.equal(isAccountQuotaExhausted(null), false)
  assert.equal(isAccountQuotaExhausted({}), false)
})

test('failover: rotateToNextAccount switches between multiple configured accounts', async () => {
  const env = {
    CLINEBOT_API_KEY: 'key-one-111',
    CLINEBOT_API_KEY_2: 'key-two-222',
  }

  const mockCreds = {
    resolve: async (ref) => ({ value: env[typeof ref === "string" ? ref : ref?.name] || '' }),
  }

  const mutated = []
  const mockSettings = {
    mutate: async (ns, ops) => {
      mutated.push({ ns, ops })
    },
  }

  const ctx = {
    get: (name) => {
      if (name === 'credentials') return mockCreds
      if (name === 'settings') return mockSettings
      return null
    },
    credentials: mockCreds,
    settings: mockSettings,
  }

  const cfg = ({
    proxyMode: false,
    apiKeyEnv: 'CLINEBOT_API_KEY',
    accounts: [
      { label: 'Work', apiKeyEnv: 'CLINEBOT_API_KEY_2' },
    ],
    activeAccount: 'CLINEBOT_API_KEY',
  })

  const { upsertPiAiProvider } = await import('../lib/provider-sync.js')

  // 1. Initial rotation from default (CLINEBOT_API_KEY) to Account 2
  const res1 = await rotateToNextAccount(ctx, cfg, 'rate_limit')
  assert.equal(res1.rotated, true)
  assert.equal(res1.previousAccount, 'CLINEBOT_API_KEY')
  assert.equal(res1.activeAccount, 'CLINEBOT_API_KEY_2')
  assert.equal(res1.updatedSettings, true)
  assert.equal(mutated.length, 1)
  assert.equal(mutated[0].ns, 'dsh-clinebot')
  assert.equal(mutated[0].ops[0].value, 'CLINEBOT_API_KEY_2')

  // Verify provider registered with rotated account apiKeyEnv
  const rotatedCfg1 = { ...cfg, activeAccount: res1.activeAccount }
  await upsertPiAiProvider(ctx, rotatedCfg1)
  assert.equal(mutated.length, 2)
  assert.equal(mutated[1].ns, 'llm-pi-ai')
  assert.equal(mutated[1].ops[0].value.apiKeyEnv, 'CLINEBOT_API_KEY_2', 'Provider must be registered with CLINEBOT_API_KEY_2')

  // 2. Next rotation from Account 2 back to default (round-robin)
  const cfg2 = ({ ...cfg, activeAccount: 'CLINEBOT_API_KEY_2' })
  const res2 = await rotateToNextAccount(ctx, cfg2, 'quota_exhausted')
  assert.equal(res2.rotated, true)
  assert.equal(res2.previousAccount, 'CLINEBOT_API_KEY_2')
  assert.equal(res2.activeAccount, 'CLINEBOT_API_KEY')
  assert.equal(mutated.length, 3)
  assert.equal(mutated[2].ns, 'dsh-clinebot')
  assert.equal(mutated[2].ops[0].value, 'CLINEBOT_API_KEY')

  // Verify provider registered with Default apiKeyEnv upon rotating back
  const rotatedCfg2 = { ...cfg, activeAccount: res2.activeAccount }
  await upsertPiAiProvider(ctx, rotatedCfg2)
  assert.equal(mutated.length, 4)
  assert.equal(mutated[3].ns, 'llm-pi-ai')
  assert.equal(mutated[3].ops[0].value.apiKeyEnv, 'CLINEBOT_API_KEY', 'Provider must revert to CLINEBOT_API_KEY')

  // 3. Single account pool does not rotate
  const singleCfg = ({
    apiKeyEnv: 'CLINEBOT_API_KEY',
    accounts: [],
  })
  const resSingle = await rotateToNextAccount(ctx, singleCfg, 'rate_limit')
  assert.equal(resSingle.rotated, false)
  assert.match(resSingle.message, /only 1 configured account/i)
})

test('failover: rotateToNextAccount updates settings via settingsApi.replace when available', async () => {
  const env = {
    CLINEBOT_API_KEY: 'key-1',
    CLINEBOT_API_KEY_2: 'key-2',
  }

  const ctx = {
    get: (name) => {
      if (name === 'credentials') return { resolve: async (r) => ({ value: env[typeof r === "string" ? r : r?.name] }) }
      return null
    },
  }

  let replacedConfig = null
  const mockSettingsApi = {
    replace: async (next) => {
      replacedConfig = next
    },
  }

  const cfg = ({
    apiKeyEnv: 'CLINEBOT_API_KEY',
    accounts: [{ label: 'Secondary', apiKeyEnv: 'CLINEBOT_API_KEY_2' }],
    activeAccount: 'CLINEBOT_API_KEY',
  })

  const res = await rotateToNextAccount(ctx, cfg, 'smoke_429', mockSettingsApi)
  assert.equal(res.rotated, true)
  assert.equal(res.activeAccount, 'CLINEBOT_API_KEY_2')
  assert.ok(replacedConfig)
  assert.equal(replacedConfig.activeAccount, 'CLINEBOT_API_KEY_2')
})

test('failover: rotateToNextAccount clears usageCache and probeCache', async () => {
  // Populate dummy item in usageCache
  usageCache.set('test-key', { data: { percentUsed: 50 }, expiresAt: Date.now() + 60000 })
  assert.ok(usageCache.has('test-key'))

  const env = { CLINEBOT_API_KEY: 'k1', CLINEBOT_API_KEY_2: 'k2' }
  const ctx = {
    get: () => ({ resolve: async (r) => ({ value: env[typeof r === "string" ? r : r?.name] }) }),
  }
  const cfg = {
    apiKeyEnv: 'CLINEBOT_API_KEY',
    accounts: [{ label: 'Secondary', apiKeyEnv: 'CLINEBOT_API_KEY_2' }],
    activeAccount: 'CLINEBOT_API_KEY',
  }

  const res = await rotateToNextAccount(ctx, cfg, 'rate_limit', { replace: async () => {} })
  assert.equal(res.rotated, true)
  // Verify cache is cleared on account switch
  assert.equal(usageCache.has('test-key'), false, 'usageCache must be cleared after account rotation')
})

test('failover: rotateToNextAccount returns rotated: false and preserves cache if settingsApi.replace throws', async () => {
  usageCache.set('persist-test-key-1', { data: { percentUsed: 40 }, expiresAt: Date.now() + 60000 })
  probeCache.set('probe-test-key-1', { status: 'healthy' })

  const env = {
    CLINEBOT_API_KEY: 'key-1',
    CLINEBOT_API_KEY_2: 'key-2',
  }

  let warnLogged = null
  const ctx = {
    get: (name) => {
      if (name === 'credentials') return { resolve: async (r) => ({ value: env[typeof r === "string" ? r : r?.name] }) }
      return null
    },
    logger: {
      warn: (msg) => {
        warnLogged = msg
      },
    },
  }

  const failingSettingsApi = {
    replace: async () => {
      throw new Error('settings disk full')
    },
  }

  const cfg = {
    apiKeyEnv: 'CLINEBOT_API_KEY',
    accounts: [{ label: 'Secondary', apiKeyEnv: 'CLINEBOT_API_KEY_2' }],
    activeAccount: 'CLINEBOT_API_KEY',
  }

  const res = await rotateToNextAccount(ctx, cfg, 'rate_limit', failingSettingsApi)

  assert.equal(res.rotated, false)
  assert.equal(res.activeAccount, 'CLINEBOT_API_KEY')
  assert.equal(res.previousAccount, 'CLINEBOT_API_KEY')
  assert.equal(res.reason, 'failed_to_persist')
  assert.equal(res.updatedSettings, false)
  assert.ok(warnLogged && warnLogged.includes('settings disk full'))

  // Verify caches were NOT cleared
  assert.equal(usageCache.has('persist-test-key-1'), true, 'usageCache must not be wiped on persist failure')
  assert.equal(probeCache.has('probe-test-key-1'), true, 'probeCache must not be wiped on persist failure')

  // Clean up
  usageCache.clear()
  probeCache.clear()
})

test('failover: rotateToNextAccount returns rotated: false and preserves cache if settings.mutate throws', async () => {
  usageCache.set('persist-test-key-2', { data: { percentUsed: 50 }, expiresAt: Date.now() + 60000 })
  probeCache.set('probe-test-key-2', { status: 'healthy' })

  const env = {
    CLINEBOT_API_KEY: 'key-1',
    CLINEBOT_API_KEY_2: 'key-2',
  }

  let warnLogged = null
  const mockSettings = {
    mutate: async () => {
      throw new Error('database locked')
    },
  }

  const ctx = {
    get: (name) => {
      if (name === 'credentials') return { resolve: async (r) => ({ value: env[typeof r === "string" ? r : r?.name] }) }
      if (name === 'settings') return mockSettings
      return null
    },
    settings: mockSettings,
    logger: {
      warn: (msg) => {
        warnLogged = msg
      },
    },
  }

  const cfg = {
    apiKeyEnv: 'CLINEBOT_API_KEY',
    accounts: [{ label: 'Secondary', apiKeyEnv: 'CLINEBOT_API_KEY_2' }],
    activeAccount: 'CLINEBOT_API_KEY',
  }

  const res = await rotateToNextAccount(ctx, cfg, 'rate_limit')

  assert.equal(res.rotated, false)
  assert.equal(res.activeAccount, 'CLINEBOT_API_KEY')
  assert.equal(res.previousAccount, 'CLINEBOT_API_KEY')
  assert.equal(res.reason, 'failed_to_persist')
  assert.equal(res.updatedSettings, false)
  assert.ok(warnLogged && warnLogged.includes('database locked'))

  // Verify caches were NOT cleared
  assert.equal(usageCache.has('persist-test-key-2'), true, 'usageCache must not be wiped on persist failure')
  assert.equal(probeCache.has('probe-test-key-2'), true, 'probeCache must not be wiped on persist failure')

  // Clean up
  usageCache.clear()
  probeCache.clear()
})

test('account pool reads a volatile credential name as text', async () => {
  const { resolveAccountPool } = await import('../lib/account-pool.js')
  const ctx = { get: () => ({ resolve: async () => ({ value: '' }) }) }
  const pool = await resolveAccountPool(ctx, {
    apiKeyEnv: Object.freeze({ get: () => 'CLINEBOT_API_KEY' }),
    accounts: [],
    activeAccount: Object.freeze({ get: () => '' }),
  })
  assert.equal(pool[0].apiKeyEnv, 'CLINEBOT_API_KEY')
  assert.equal(pool[0].label, 'Default')
})

test('failover: upsertPiAiProvider registers active account apiKeyEnv instead of hardcoded pub.apiKeyEnv', async () => {
  const env = {
    CLINEBOT_API_KEY: 'main-key',
    CLINEBOT_API_KEY_2: 'second-key',
  }
  const mockCreds = {
    resolve: async (r) => ({ value: env[typeof r === 'string' ? r : r?.name] || '' }),
  }
  const mutated = []
  const mockSettings = {
    mutate: async (ns, ops) => {
      mutated.push({ ns, ops })
    },
  }
  const ctx = {
    get: (name) => {
      if (name === 'credentials') return mockCreds
      if (name === 'settings') return mockSettings
      return null
    },
  }

  const { upsertPiAiProvider } = await import('../lib/provider-sync.js')
  const cfg = {
    proxyMode: false,
    apiKeyEnv: 'CLINEBOT_API_KEY',
    accounts: [{ label: 'Team', apiKeyEnv: 'CLINEBOT_API_KEY_2' }],
    activeAccount: 'CLINEBOT_API_KEY_2',
  }

  await upsertPiAiProvider(ctx, cfg)
  assert.equal(mutated.length, 1)
  assert.equal(mutated[0].ns, 'llm-pi-ai')
  assert.equal(mutated[0].ops[0].value.apiKeyEnv, 'CLINEBOT_API_KEY_2')
})

test('failover: llm/stream waterfall intercepts 429 error and rotates active account with storm protection', async () => {
  const env = {
    CLINEBOT_API_KEY: 'key-1',
    CLINEBOT_API_KEY_2: 'key-2',
  }
  const mockCreds = {
    resolve: async (r) => ({ value: env[typeof r === 'string' ? r : r?.name] || '' }),
  }
  let currentActive = 'CLINEBOT_API_KEY'
  const mockSettingsScope = {
    get: () => ({
      apiKeyEnv: 'CLINEBOT_API_KEY',
      accounts: [{ label: 'Two', apiKeyEnv: 'CLINEBOT_API_KEY_2' }],
      activeAccount: currentActive,
      dynamicModels: [],
      enabledModels: ['cline-pass/deepseek-v4-pro'],
      proxyMode: false,
    }),
    replace: async (next) => {
      currentActive = next.activeAccount
    },
    watch: () => () => {},
  }
  const mutated = []
  const mockSettings = {
    describe: () => [{ ns: "dsh-clinebot", revision: "1" }],
    replace: async (ns, payload) => {
      if (payload?.activeAccount) currentActive = payload.activeAccount
    },
    update: async (ns, payload) => {
      if (payload?.activeAccount) currentActive = payload.activeAccount
    },
    mutate: async (ns, ops) => mutated.push({ ns, ops }),
  }

  const listeners = []
  const ctx = {
    get: (name) => {
      if (name === 'credentials') return mockCreds
      if (name === 'settings') return mockSettings
      return null
    },
    inject: (deps, fn) => fn({ settings: mockSettings, effect: (fn) => fn() }),
    on: (evt, handler) => {
      listeners.push({ evt, handler })
      return () => {}
    },
    effect: (fn) => fn(),
  }

  const { apply } = await import('../lib/index.js')
  apply(ctx, mockSettingsScope.get())

  const streamListener = listeners.find((l) => l.evt === 'llm/stream')
  assert.ok(streamListener, 'llm/stream listener must be registered')

  // 1. Non-cline provider passes through without rotation
  async function* otherStream() {
    yield { type: 'chunk', text: 'hello' }
    yield { type: 'finish', reason: { kind: 'error', failure: { status: 429, message: 'Too many requests' } } }
  }
  const wrappedOther = streamListener.handler({ provider: 'other-provider' }, otherStream)
  const otherChunks = []
  for await (const c of wrappedOther) otherChunks.push(c)
  assert.equal(otherChunks.length, 2)
  assert.equal(currentActive, 'CLINEBOT_API_KEY', 'Non-cline stream must not rotate account')

  // 2. Clinebot provider encounters 429 -> triggers rotation to CLINEBOT_API_KEY_2
  async function* cline429Stream() {
    yield { type: 'usage', usage: { inputTokens: 10, outputTokens: 20 } }
    yield { type: 'finish', reason: { kind: 'error', failure: { status: 429, message: 'Rate limit reached' } } }
  }
  const wrappedCline = streamListener.handler({ provider: 'clinebot' }, cline429Stream)
  const clineChunks = []
  for await (const c of wrappedCline) clineChunks.push(c)
  assert.equal(clineChunks.length, 2)
  assert.equal(clineChunks[0].type, 'usage')

  // Wait a tick for async rotateToNextAccount
  await new Promise((r) => setTimeout(r, 60))
  assert.equal(currentActive, 'CLINEBOT_API_KEY_2', 'Active account must rotate to CLINEBOT_API_KEY_2 on 429')

  const piAiMutations = mutated.filter((m) => m.ns === 'llm-pi-ai')
  assert.ok(piAiMutations.length > 0, 'Provider settings must be synced on rotation')
  const lastPiAi = piAiMutations[piAiMutations.length - 1]
  assert.equal(lastPiAi.ops[0].value.apiKeyEnv, 'CLINEBOT_API_KEY_2', 'Provider settings must point to rotated account apiKeyEnv')

  // 3. Storm dampening: second 429 within 30s does not trigger another rotation
  async function* second429Stream() {
    yield { type: 'finish', reason: { kind: 'error', failure: { status: 429, message: 'Rate limit' } } }
  }
  const wrappedSecond = streamListener.handler({ provider: 'clinebot' }, second429Stream)
  for await (const _ of wrappedSecond) {}
  await new Promise((r) => setTimeout(r, 60))
  assert.equal(currentActive, 'CLINEBOT_API_KEY_2', 'Rapid 429 must be throttled within 30s storm window')

  // 4. Verify telemetry in getLastRotation
  const { getLastRotation } = await import('../lib/account-pool.js')
  const lastRot = getLastRotation()
  assert.ok(lastRot)
  assert.equal(lastRot.reason, 'stream_429')
  assert.equal(lastRot.from, 'CLINEBOT_API_KEY')
  assert.equal(lastRot.to, 'CLINEBOT_API_KEY_2')
})


test('failover: upsertPiAiProvider registers LOCAL_PROXY_KEY_ENV when proxyMode is enabled (default) (#150, GH #11)', async () => {
  const env = {
    CLINEBOT_API_KEY: 'main-key',
    CLINEBOT_API_KEY_2: 'second-key',
  }
  const mockCreds = {
    resolve: async (r) => ({ value: env[typeof r === 'string' ? r : r?.name] || '' }),
    set: async () => {},
  }
  const mutated = []
  const mockSettings = {
    mutate: async (ns, ops) => {
      mutated.push({ ns, ops })
    },
  }
  const ctx = {
    get: (name) => {
      if (name === 'credentials') return mockCreds
      if (name === 'settings') return mockSettings
      return null
    },
  }

  const { upsertPiAiProvider } = await import('../lib/provider-sync.js')
  const { LOCAL_PROXY_KEY_ENV, getLocalProxyToken } = await import('../lib/proxy-token.js')
  const cfg = {
    proxyMode: true,
    apiKeyEnv: 'CLINEBOT_API_KEY',
    accounts: [{ label: 'Team', apiKeyEnv: 'CLINEBOT_API_KEY_2' }],
    activeAccount: 'CLINEBOT_API_KEY_2',
  }

  const providerObj = await upsertPiAiProvider(ctx, cfg)
  assert.equal(mutated.length, 1)
  assert.equal(mutated[0].ns, 'llm-pi-ai')
  assert.equal(mutated[0].ops[0].value.apiKeyEnv, LOCAL_PROXY_KEY_ENV)
  assert.equal(mutated[0].ops[0].value.apiKey, getLocalProxyToken())
  assert.equal(providerObj.apiKeyEnv, LOCAL_PROXY_KEY_ENV)
})
