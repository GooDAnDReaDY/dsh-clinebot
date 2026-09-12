import test from 'node:test'
import assert from 'node:assert/strict'
import { rotateToNextAccount } from '../lib/cline-client.js'

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
