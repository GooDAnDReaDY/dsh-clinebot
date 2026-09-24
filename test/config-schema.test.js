import assert from 'node:assert/strict'
import test from 'node:test'
import { Config, plainConfig } from '../lib/config.js'

test('user settings fields are volatile so the host namespace is published', () => {
  const keys = ['enabled', 'baseUrl', 'apiKeyEnv', 'defaultModel', 'disabledModels', 'dynamicModels', 'accounts', 'activeAccount']
  for (const key of keys) {
    assert.equal(Config.dict[key].meta.volatile, true, key)
  }
  assert.equal(Config.dict.dynamicModels.inner.dict.description.meta.volatile, undefined)
  assert.equal(Config.dict.dynamicModels.inner.dict.category.meta.volatile, undefined)
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
