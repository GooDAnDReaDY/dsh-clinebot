import assert from 'node:assert/strict'
import test from 'node:test'
import { Config } from '../lib/config.js'

test('user settings fields are volatile so the host namespace is published', () => {
  const keys = ['enabled', 'baseUrl', 'apiKeyEnv', 'defaultModel', 'disabledModels', 'accounts', 'activeAccount']
  for (const key of keys) {
    assert.equal(Config.dict[key].meta.volatile, true, key)
  }
})
