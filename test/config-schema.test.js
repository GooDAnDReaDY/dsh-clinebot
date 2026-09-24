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
  assert.equal(Config.dict.accounts.inner.dict.label.meta.volatile, undefined)
})

test('plainConfig copies volatile field references before structuredClone', () => {
  const enabled = Object.freeze({ get: () => true })
  const dynamicModels = Object.freeze({ get: () => [{ id: 'm', name: 'M' }] })
  const plain = plainConfig({ enabled, dynamicModels, baseUrl: 'https://example.test' })
  assert.equal(plain.enabled, true)
  assert.deepEqual(plain.dynamicModels, [{ id: 'm', name: 'M' }])
  assert.equal(plain.baseUrl, 'https://example.test')
  assert.deepEqual(structuredClone(plain), plain)
  const root = Object.freeze({ get: () => ({ enabled: false, baseUrl: 'https://api.example.test' }) })
  assert.equal(plainConfig(root).enabled, false)
})

test('volatileConfig filters out non-volatile fields before persistence to DSH settings', () => {
  const full = {
    enabled: true,
    baseUrl: 'https://api.cline.bot/api/v1',
    dynamicModels: [{ id: 'custom-model' }],
    enabledModels: ['custom-model'],
    activeAccount: 'MY_KEY',
  }
  const vol = volatileConfig(full)
  assert.equal(vol.enabled, true)
  assert.equal(vol.baseUrl, 'https://api.cline.bot/api/v1')
  assert.equal(vol.activeAccount, 'MY_KEY')
  assert.equal(vol.dynamicModels, undefined)
  assert.equal(vol.enabledModels, undefined)
})
