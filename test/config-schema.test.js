import assert from 'node:assert/strict'
import test from 'node:test'
import { Config, plainConfig, volatileConfig } from '../lib/config.js'

test('user settings fields are volatile so the host namespace is published', () => {
  const keys = ['enabled', 'baseUrl', 'apiKeyEnv', 'defaultModel', 'disabledModels', 'accounts', 'activeAccount']
  for (const key of keys) {
    assert.equal(Config.dict[key].meta.volatile, true, key)
  }
  // Internal/derived fields must remain non-volatile
  assert.equal(Config.dict.dynamicModels.meta.volatile, undefined)
  assert.equal(Config.dict.enabledModels.meta.volatile, undefined)
  assert.equal(Config.dict.planSyncedAt.meta.volatile, undefined)
  assert.equal(Config.dict.accounts.inner.dict.label.meta.volatile, undefined)
})

test('plainConfig copies volatile field references and resolves function getters before structuredClone', () => {
  const enabled = Object.freeze({ get: () => true })
  const dynamicModels = Object.freeze({ get: () => [{ id: 'm', name: 'M' }] })
  const plain = plainConfig({ enabled, dynamicModels, baseUrl: 'https://example.test' })
  assert.equal(plain.enabled, true)
  assert.deepEqual(plain.dynamicModels, [{ id: 'm', name: 'M' }])
  assert.equal(plain.baseUrl, 'https://example.test')
  assert.deepEqual(structuredClone(plain), plain)
  const root = Object.freeze({ get: () => ({ enabled: false, baseUrl: 'https://api.example.test' }) })
  assert.equal(plainConfig(root).enabled, false)

  // Function getters (e.g. () => current) produced by Cordis / DSH loader
  const fnGetterConfig = () => ({
    enabled: () => true,
    baseUrl: () => 'https://api.cline.bot/api/v1',
    accounts: [
      { label: () => 'Account 1', apiKeyEnv: () => 'CLINEBOT_API_KEY_1' },
      { label: { get: () => 'Account 2' }, apiKeyEnv: 'CLINEBOT_API_KEY_2' },
    ],
    dynamicModels: [
      {
        id: 'cline-pass/deepseek-v41-flash',
        name: () => 'DeepSeek V41 Flash',
        description: () => 'Plan model description',
        contextLength: 200000,
        maxTokens: 8192,
      },
    ],
  })

  const unwrapped = plainConfig(fnGetterConfig)
  assert.equal(unwrapped.enabled, true)
  assert.equal(unwrapped.baseUrl, 'https://api.cline.bot/api/v1')
  assert.equal(unwrapped.accounts[0].label, 'Account 1')
  assert.equal(unwrapped.accounts[0].apiKeyEnv, 'CLINEBOT_API_KEY_1')
  assert.equal(unwrapped.accounts[1].label, 'Account 2')
  assert.equal(unwrapped.dynamicModels[0].name, 'DeepSeek V41 Flash')
  assert.equal(unwrapped.dynamicModels[0].description, 'Plan model description')

  // structuredClone must succeed without DataCloneError: () => current could not be cloned
  const cloned = structuredClone(unwrapped)
  assert.deepEqual(cloned, unwrapped)

  // Config validation must succeed with the normalized object
  const validated = Config(cloned)
  const plainValidated = plainConfig(validated)
  assert.equal(plainValidated.enabled, true)
  assert.equal(plainValidated.dynamicModels.length, 1)
  assert.equal(plainValidated.dynamicModels[0].id, 'cline-pass/deepseek-v41-flash')
})

test('volatileConfig filters out non-volatile fields before persistence to DSH settings', () => {
  const full = {
    enabled: true,
    baseUrl: 'https://api.cline.bot/api/v1',
    dynamicModels: [{ id: 'custom-model' }],
    enabledModels: ['custom-model'],
    planSyncedAt: 123456789,
    activeAccount: 'MY_KEY',
  }
  const vol = volatileConfig(full)
  assert.equal(vol.enabled, true)
  assert.equal(vol.baseUrl, 'https://api.cline.bot/api/v1')
  assert.equal(vol.activeAccount, 'MY_KEY')
  assert.equal(vol.dynamicModels, undefined)
  assert.equal(vol.enabledModels, undefined)
  assert.equal(vol.planSyncedAt, undefined)
})
