/**
 * The model catalogue and the config projection: the two places where this plugin
 * decides what DSH is told about models and preferences.
 *
 * `publicConfig` is the host's read model for the whole settings page and for the
 * model picker registration, and `volatileConfig` decides which fields DSH
 * publishes to the browser at all — a field missing from that set is silently
 * invisible in the UI. Both are pure, so they are tested directly.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  CLINE_MODELS,
  DEFAULT_MODEL_ID,
  PROVIDER_ID,
  PROVIDER_DISPLAY_NAME,
  findModel,
  formatModelContext,
  formatModelDescription,
  getActiveModelIds,
  getAllModels,
  getOriginalModelContext,
  getOriginalModelMaxTokens,
  getOriginalModelProvider,
  isSupportedModel,
  isVisionModel,
  migrateModelEntry,
  migrateModelId,
  parsePlanIncludedModels,
} from '../lib/models.js'

test('the provider identity is stable', () => {
  assert.equal(PROVIDER_ID, 'clinebot')
  assert.equal(PROVIDER_DISPLAY_NAME, 'ClineBot (ClinePass)')
  assert.equal(DEFAULT_MODEL_ID, 'cline-pass/deepseek-v4.1-flash')
})

test('obsolete model ids migrate to their canonical spelling', () => {
  assert.equal(migrateModelId('cline-pass/deepseek-v4-flash'), 'cline-pass/deepseek-v4.1-flash')
  assert.equal(migrateModelId('cline-pass/qwen38-max'), 'cline-pass/qwen3.8-max')
  assert.equal(migrateModelId('cline-pass/glm-53'), 'cline-pass/glm-5.3')
  assert.equal(migrateModelId('cline-pass/kimi-k3'), 'cline-pass/kimi-k3', 'canonical ids pass through')
  assert.equal(migrateModelId(undefined), undefined)
  assert.equal(migrateModelId(null), null)
})

test('migrateModelEntry rewrites only the id and keeps the entry otherwise intact', () => {
  const legacy = { id: 'cline-pass/glm-53', name: 'GLM', contextLength: 123 }
  assert.deepEqual(migrateModelEntry(legacy), { id: 'cline-pass/glm-5.3', name: 'GLM', contextLength: 123 })
  const canonical = { id: 'cline-pass/kimi-k3' }
  assert.equal(migrateModelEntry(canonical), canonical, 'an already-canonical entry is returned as-is')
  assert.equal(migrateModelEntry(null), null)
})

test('original creator specs come from the vendor, not from the ClinePass gateway cap', () => {
  // The gateway caps every subscription route at 200k, so the curated specs keep
  // the vendor's own numbers separately.
  assert.equal(getOriginalModelContext('cline-pass/kimi-k3'), 2000000)
  assert.equal(getOriginalModelContext('cline-pass/qwen3.7-max'), 1000000)
  assert.equal(getOriginalModelContext('cline-pass/deepseek-v4.1-flash'), 1000000)
  assert.equal(getOriginalModelContext('unknown-model'), 200000)

  assert.equal(getOriginalModelMaxTokens('cline-pass/deepseek-v4.1-flash'), 384000)
  assert.equal(getOriginalModelMaxTokens('cline-pass/kimi-k3'), 65536)

  assert.equal(getOriginalModelProvider('cline-pass/kimi-k3'), 'Moonshot AI')
  assert.equal(getOriginalModelProvider('cline-pass/qwen3.7-plus'), 'Alibaba Cloud')
  assert.equal(getOriginalModelProvider('cline-pass/mimo-v2.5'), 'Xiaomi')
  assert.equal(getOriginalModelProvider('cline-pass/minimax-m3'), 'MiniMax')
})

test('every curated model carries both the gateway cap and the vendor spec', () => {
  assert.ok(CLINE_MODELS.length > 0)
  for (const model of CLINE_MODELS) {
    assert.ok(model.id.startsWith('cline-pass/'), `${model.id} must be namespaced`)
    assert.equal(typeof model.name, 'string')
    assert.equal(model.isCustom, false)
    assert.ok(model.originalContextLength > 0, `${model.id} needs an original context length`)
    assert.ok(model.originalMaxTokens > 0, `${model.id} needs an original max tokens`)
    assert.equal(typeof model.originalProvider, 'string')
    assert.ok(Array.isArray(model.input) && model.input.length > 0)
    // The row's active limits start out equal to its defaults; only an override moves them.
    assert.equal(model.contextLength, model.clineContextLength)
    assert.equal(model.maxTokens, model.defaultMaxTokens)
  }
})

test('the plan feature string is parsed into the curated models it names', () => {
  const plan = 'Includes Kimi K3, GLM 5.2, Kimi K2.6, Kimi K2.7 Code, Mimo v2.5, Mimo v2.5 Pro, Minimax M3, Qwen3.7 Plus, Qwen3.7 Max, DeepSeek V4 Pro, and DeepSeek V4 Flash'
  const ids = parsePlanIncludedModels(plan).map((m) => m.id)

  assert.ok(ids.includes('cline-pass/kimi-k3'))
  assert.ok(ids.includes('cline-pass/glm-5.2'))
  assert.ok(ids.includes('cline-pass/minimax-m3'))
  // "DeepSeek V4 Flash" is not a curated id; it falls back to the migrated id.
  assert.ok(ids.includes('cline-pass/deepseek-v4.1-flash'))
  assert.equal(new Set(ids).size, ids.length, 'no duplicates')
})

test('plan parsing tolerates arrays, blank input and unknown models', () => {
  assert.deepEqual(parsePlanIncludedModels(''), [])
  assert.deepEqual(parsePlanIncludedModels(null), [])
  assert.deepEqual(parsePlanIncludedModels(undefined), [])
  assert.deepEqual(parsePlanIncludedModels(42), [])

  const fromArray = parsePlanIncludedModels(['Kimi K3', 'Minimax M3'])
  assert.deepEqual(fromArray.map((m) => m.id), ['cline-pass/kimi-k3', 'cline-pass/minimax-m3'])

  // The first element carrying "includes" wins, as the upstream payload is a feature list.
  const withFeature = parsePlanIncludedModels(['Unlimited requests', 'Includes Kimi K3'])
  assert.deepEqual(withFeature.map((m) => m.id), ['cline-pass/kimi-k3'])

  // A model the catalogue has never heard of still becomes usable, with vendor specs inferred.
  const [unknown] = parsePlanIncludedModels('Includes Brand New Vision Model')
  assert.equal(unknown.id, 'cline-pass/brand-new-vision-model')
  assert.ok(unknown.input.includes('image'))
  assert.equal(unknown.clineContextLength, 200000)
})

test('an unsynced plan falls back to the full curated catalogue, marked unverified', () => {
  const models = getAllModels()
  assert.equal(models.length, CLINE_MODELS.length)
  for (const model of models) {
    assert.equal(model.unverified, true)
    assert.equal(model.inPlan, true)
  }
})

test('a synced plan registers only the plan models, enriched from the catalogue', () => {
  const dynamic = [{ id: 'cline-pass/kimi-k3', name: 'Kimi K3', description: '', contextLength: 200000, maxTokens: 8192 }]
  const models = getAllModels(dynamic)

  assert.equal(models.length, 1)
  const [kimi] = models
  assert.equal(kimi.id, 'cline-pass/kimi-k3')
  assert.equal(kimi.unverified, false)
  assert.equal(kimi.inPlan, true)
  // The curated row supplies the vendor specs the plan payload lacks.
  assert.equal(kimi.originalContextLength, 2000000)
  assert.equal(kimi.originalMaxTokens, 65536)
  assert.equal(kimi.originalProvider, 'Moonshot AI')
  assert.equal(kimi.category, 'reasoning')
})

test('includeOutOfPlan appends the catalogue models the plan omits', () => {
  const dynamic = [{ id: 'cline-pass/kimi-k3', name: 'Kimi K3', description: '', contextLength: 200000, maxTokens: 8192 }]
  const models = getAllModels(dynamic, [], [], { includeOutOfPlan: true })

  assert.equal(models.length, CLINE_MODELS.length)
  const inPlan = models.filter((m) => m.inPlan)
  const outOfPlan = models.filter((m) => !m.inPlan)
  assert.deepEqual(inPlan.map((m) => m.id), ['cline-pass/kimi-k3'])
  assert.equal(outOfPlan.length, CLINE_MODELS.length - 1)
})

test('modelContextOverrides win over the defaults and flag the row as overridden', () => {
  const dynamic = [{ id: 'cline-pass/kimi-k3', name: 'Kimi K3', description: '', contextLength: 200000, maxTokens: 8192 }]
  const [model] = getAllModels(dynamic, [{ modelId: 'cline-pass/kimi-k3', contextLength: 500000, maxTokens: 40000 }])

  assert.equal(model.contextLength, 500000)
  assert.equal(model.maxTokens, 40000)
  // The reset target stays visible: for a plan model that is the curated row's own
  // value, which for Kimi is the vendor's 2M rather than the 200k gateway cap.
  assert.equal(model.defaultContextLength, 2000000)
  assert.equal(model.isContextOverridden, true)
})

test('a wildcard override applies to every model', () => {
  const models = getAllModels([], [{ modelId: '*', contextLength: 7777, maxTokens: 999 }])
  for (const model of models) {
    assert.equal(model.contextLength, 7777)
    assert.equal(model.maxTokens, 999)
  }
})

test('an override keyed by an obsolete id still lands on the canonical model', () => {
  const models = getAllModels([], [{ modelId: 'cline-pass/deepseek-v4-flash', contextLength: 111111, maxTokens: 111 }])
  const flash = models.find((m) => m.id === 'cline-pass/deepseek-v4.1-flash')

  assert.ok(flash, 'the canonical model is in the catalogue')
  assert.equal(flash.contextLength, 111111)
  assert.equal(flash.maxTokens, 111)
  assert.equal(flash.isContextOverridden, true)
})

test('custom models are appended and marked', () => {
  const models = getAllModels([], [], [{ id: 'local/llama', name: 'Local Llama', contextLength: 32000, maxTokens: 2048 }])
  const custom = models.find((m) => m.id === 'local/llama')
  assert.ok(custom)
  assert.equal(custom.isCustom, true)
  assert.equal(custom.contextLength, 32000)
  assert.equal(custom.maxTokens, 2048)
  assert.deepEqual(custom.input, ['text'])
})

test('a custom model never duplicates an existing id', () => {
  const models = getAllModels([], [], [{ id: 'cline-pass/kimi-k3', name: 'Shadow' }])
  assert.equal(models.filter((m) => m.id === 'cline-pass/kimi-k3').length, 1)
})

test('findModel and isSupportedModel see plan, custom and catalogue models alike', () => {
  assert.ok(findModel('cline-pass/kimi-k3'))
  assert.equal(findModel('nope/does-not-exist'), null)
  assert.equal(isSupportedModel('cline-pass/kimi-k3'), true)
  assert.equal(isSupportedModel('nope/does-not-exist'), false)

  const custom = [{ id: 'local/llama', name: 'Local Llama' }]
  assert.ok(findModel('local/llama', [], [], custom))
  assert.equal(isSupportedModel('local/llama', [], [], custom), true)
})

test('disabled models are filtered out of the active set', () => {
  const all = ['a', 'b', 'c']
  assert.deepEqual(getActiveModelIds(all, ['b']), ['a', 'c'])
  assert.deepEqual(getActiveModelIds([{ id: 'a' }, { id: 'b' }], ['a']), ['b'])
  assert.deepEqual(getActiveModelIds([], []), [])
  assert.deepEqual(getActiveModelIds(undefined, undefined), [])
})

test('context lengths render in the picker’s compact form', () => {
  assert.equal(formatModelContext(2000000), '2M')
  assert.equal(formatModelContext(1000000), '1M')
  assert.equal(formatModelContext(200000), '200K')
  assert.equal(formatModelContext(131072), '131.1K')
  assert.equal(formatModelContext(999), '999')
  assert.equal(formatModelContext(undefined), '200K', 'falls back to the gateway cap')
})

test('the picker description leads with context, modality and category', () => {
  const [flash] = CLINE_MODELS.filter((m) => m.id === 'cline-pass/deepseek-v4.1-flash')
  const text = formatModelDescription(flash)
  assert.ok(text.startsWith('[1M · Vision · Coding] '), text)
  assert.ok(text.includes('High-speed reasoning'))
})

test('vision support is read from the model’s input modalities', () => {
  assert.equal(isVisionModel('cline-pass/deepseek-v4.1-flash'), true)
  assert.equal(isVisionModel('cline-pass/kimi-k3'), false)
  assert.equal(isVisionModel('nope/does-not-exist'), false)
})
