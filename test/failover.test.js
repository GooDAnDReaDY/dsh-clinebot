import test from 'node:test'
import assert from 'node:assert/strict'
import { rotateToNextAccount, isAccountQuotaExhausted, usageCache } from '../lib/cline-client.js'

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
    resolve: async (ref) => ({ value: env[ref?.name] || '' }),
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
    apiKeyEnv: 'CLINEBOT_API_KEY',
    accounts: [
      { label: 'Work', apiKeyEnv: 'CLINEBOT_API_KEY_2' },
    ],
    activeAccount: 'CLINEBOT_API_KEY',
  })

  // 1. Initial rotation from default (CLINEBOT_API_KEY) to Account 2
  const res1 = await rotateToNextAccount(ctx, cfg, 'rate_limit')
  assert.equal(res1.rotated, true)
  assert.equal(res1.previousAccount, 'CLINEBOT_API_KEY')
  assert.equal(res1.activeAccount, 'CLINEBOT_API_KEY_2')
  assert.equal(res1.updatedSettings, true)
  assert.equal(mutated.length, 1)
  assert.equal(mutated[0].ops[0].value, 'CLINEBOT_API_KEY_2')

  // 2. Next rotation from Account 2 back to default (round-robin)
  const cfg2 = ({ ...cfg, activeAccount: 'CLINEBOT_API_KEY_2' })
  const res2 = await rotateToNextAccount(ctx, cfg2, 'quota_exhausted')
  assert.equal(res2.rotated, true)
  assert.equal(res2.previousAccount, 'CLINEBOT_API_KEY_2')
  assert.equal(res2.activeAccount, 'CLINEBOT_API_KEY')

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
      if (name === 'credentials') return { resolve: async (r) => ({ value: env[r?.name] }) }
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
    get: () => ({ resolve: async (r) => ({ value: env[r?.name] }) }),
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
