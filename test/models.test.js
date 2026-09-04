import test from 'node:test'
import assert from 'node:assert/strict'
import {
  CLINE_MODELS,
  PROVIDER_ID,
  DEFAULT_MODEL_ID,
  findModel,
  isSupportedModel,
  getAllModels,
  getDefaultModelIds,
} from '../lib/models.js'

test('models: catalog integrity', () => {
  assert.equal(PROVIDER_ID, 'clinebot')
  assert.equal(DEFAULT_MODEL_ID, 'cline-pass/deepseek-v4-flash')
  assert.ok(CLINE_MODELS.length >= 10, 'Catalog should contain at least 10 official models')

  const ids = new Set()
  for (const m of CLINE_MODELS) {
    assert.ok(m.id.startsWith('cline-pass/'), `Model id ${m.id} must have prefix cline-pass/`)
    assert.ok(!ids.has(m.id), `Duplicate model id: ${m.id}`)
    ids.add(m.id)

    assert.ok(typeof m.name === 'string' && m.name.length > 0, `Missing name for ${m.id}`)
    assert.ok(m.contextLength >= 128000, `Context length should be at least 128k for ${m.id}`)
    assert.ok(Array.isArray(m.input) && m.input.includes('text'), `Input must include 'text' for ${m.id}`)
  }
})

test('models: lookup functions', () => {
  const defaultModel = findModel(DEFAULT_MODEL_ID)
  assert.ok(defaultModel)
  assert.equal(defaultModel.name, 'DeepSeek V4 Flash')

  assert.equal(findModel('unknown-model'), null)
  assert.equal(isSupportedModel('cline-pass/kimi-k3'), true)
  assert.equal(isSupportedModel('gpt-4o'), false)

  const all = getAllModels()
  assert.equal(all.length, CLINE_MODELS.length)

  const defaultIds = getDefaultModelIds()
  assert.equal(defaultIds.length, CLINE_MODELS.length)
  assert.ok(defaultIds.includes(DEFAULT_MODEL_ID))
})
