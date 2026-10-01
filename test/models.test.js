import test from 'node:test'
import assert from 'node:assert/strict'
import {
  isCatalogDifferent,
  CLINE_MODELS,
  PROVIDER_ID,
  DEFAULT_MODEL_ID,
  isSupportedModel,
  findModel,
  getDefaultModelIds,
  getAllModels,
  getActiveModelIds,
  parsePlanIncludedModels,
  formatModelContext,
  formatModelDescription,
  isVisionModel,
  migrateModelEntry,
  OBSOLETE_MODEL_ID_MAP,
  saveModelsDiskCache,
  loadModelsDiskCache,
  getOriginalModelContext,
} from '../lib/models.js'
import os from 'node:os'
import path from 'node:path'
import fs from 'node:fs'
import {
  publicConfig } from '../lib/config.js'

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
  const all = getAllModels()
  const defaultModel = all.find(m => m.id === DEFAULT_MODEL_ID)
  assert.ok(defaultModel)
  assert.equal(defaultModel.name, 'DeepSeek V4 Flash')

  assert.equal(all.find(m => m.id === 'unknown-model') || null, null)
  assert.equal(isSupportedModel('cline-pass/kimi-k3'), true)
  assert.equal(isSupportedModel('gpt-4o'), false)

  assert.equal(all.length, CLINE_MODELS.length)

  const defaultIds = all.map(m => m.id)
  assert.equal(defaultIds.length, CLINE_MODELS.length)
  assert.ok(defaultIds.includes(DEFAULT_MODEL_ID))
})

test('models: parsePlanIncludedModels parsing and dynamic merging', () => {
  const sampleIncluded =
    'Includes Kimi K3, GLM 5.2, Kimi K2.6, Kimi K2.7 Code, Mimo v2.5, Mimo v2.5 Pro, Minimax M3, Qwen3.7 Plus, Qwen3.7 Max, DeepSeek V4 Pro, and DeepSeek V4 Flash'

  const parsed = parsePlanIncludedModels(sampleIncluded)
  assert.ok(parsed.length >= 10, 'Should parse all models in list')
  assert.ok(parsed.some((m) => m.id === 'cline-pass/deepseek-v4-flash'))
  assert.ok(parsed.some((m) => m.id === 'cline-pass/kimi-k3'))
  assert.ok(parsed.some((m) => m.id === 'cline-pass/qwen3.7-max'))

  // Handles new unseen models gracefully
  const newModelText = 'Includes NewSuperModel V1, and DeepSeek V4 Flash'
  const withNew = parsePlanIncludedModels(newModelText)
  assert.equal(withNew.length, 2)
  assert.equal(withNew[0].id, 'cline-pass/newsupermodel-v1')
  assert.equal(withNew[0].name, 'NewSuperModel V1')

  // Handles array input from plan.features.included
  const featuresArray = [
    'Low cost subscription pricing',
    'Generous limits and reliable access',
    'Includes Kimi K3, GLM 5.2, Kimi K2.6, Kimi K2.7 Code, Mimo v2.5, Mimo v2.5 Pro, Minimax M3, Qwen3.7 Plus, Qwen3.7 Max, DeepSeek V4 Pro, and DeepSeek V4 Flash'
  ]
  const parsedFromArray = parsePlanIncludedModels(featuresArray)
  assert.equal(parsedFromArray.length, 11)
  assert.ok(parsedFromArray.some((m) => m.id === 'cline-pass/deepseek-v4-flash'))
  assert.ok(parsedFromArray.some((m) => m.id === 'cline-pass/glm-5.2'))

  // Issue #103: preserve dots in model names and IDs
  const dottedPlanText = 'Includes DeepSeek V4.1 Flash, Qwen3.8 Max, and GLM 5.3.'
  const parsedDotted = parsePlanIncludedModels(dottedPlanText)
  assert.equal(parsedDotted.length, 3)
  assert.equal(parsedDotted[0].id, 'cline-pass/deepseek-v4.1-flash')
  assert.equal(parsedDotted[0].name, 'DeepSeek V4.1 Flash')
  assert.equal(parsedDotted[1].id, 'cline-pass/qwen3.8-max')
  assert.equal(parsedDotted[1].name, 'Qwen3.8 Max')
  assert.equal(parsedDotted[2].id, 'cline-pass/glm-5.3')
  assert.equal(parsedDotted[2].name, 'GLM 5.3')

  // When plan models exist, getAllModels returns strictly plan models with enriched properties
  const dynamicList = [withNew[0]]
  const planModelsOnly = getAllModels(dynamicList)
  assert.equal(planModelsOnly.length, 1)
  assert.equal(planModelsOnly[0].id, 'cline-pass/newsupermodel-v1')
  assert.equal(planModelsOnly[0].unverified, false)
  assert.ok(planModelsOnly.some(m => m.id === 'cline-pass/newsupermodel-v1'))
  assert.ok(isSupportedModel('cline-pass/newsupermodel-v1', dynamicList))
})

test('models: getActiveModelIds respects disabled models and auto-enables new models', () => {
  const dynamicList = [
    { id: 'cline-pass/brand-new-ai', name: 'Brand New AI', contextLength: 128000, input: ['text'] },
    { id: DEFAULT_MODEL_ID, name: 'DeepSeek V4 Flash' },
    { id: 'cline-pass/kimi-k3', name: 'Kimi K3' },
  ]
  const all = getAllModels(dynamicList)
  const disabled = ['cline-pass/kimi-k3']

  const activeIds = getActiveModelIds(all, disabled)

  // Explicitly disabled model is excluded
  assert.ok(!activeIds.includes('cline-pass/kimi-k3'))

  // Newly discovered model is automatically included without user intervention
  assert.ok(activeIds.includes('cline-pass/brand-new-ai'))

  // Default models not in disabled list are included
  assert.ok(activeIds.includes(DEFAULT_MODEL_ID))
})

test('models: plan with 3 models registers strictly 3 models with curated catalog properties mixed in', () => {
  const planModels = [
    { id: 'cline-pass/deepseek-v4-flash' },
    { id: 'cline-pass/deepseek-v4-pro' },
    { id: 'cline-pass/glm-5.2' },
  ]
  const result = getAllModels(planModels)
  assert.equal(result.length, 3)
  assert.deepEqual(result.map((m) => m.id), [
    'cline-pass/deepseek-v4-flash',
    'cline-pass/deepseek-v4-pro',
    'cline-pass/glm-5.2',
  ])
  const flash = result.find((m) => m.id === 'cline-pass/deepseek-v4-flash')
  assert.equal(flash.name, 'DeepSeek V4 Flash')
  assert.equal(flash.contextLength, 128000)
  assert.deepEqual(flash.input, ['text', 'image'])
  assert.deepEqual(flash.reasoningEfforts, ['low', 'medium', 'high'])
  assert.equal(flash.unverified, false)
})

test('models: when plan is unavailable and cache is empty, returns full catalog marked unverified', () => {
  const result = getAllModels([])
  assert.equal(result.length, CLINE_MODELS.length)
  for (const m of result) {
    assert.equal(m.unverified, true)
  }
})

test('models: defaultModel missing from plan triggers warning and fallback replacement', () => {
  const planModels = [
    { id: 'cline-pass/glm-5.2', name: 'GLM 5.2' },
    { id: 'cline-pass/kimi-k3', name: 'Kimi K3' },
  ]
  const cfg = {
    defaultModel: 'cline-pass/deepseek-v4-flash',
    dynamicModels: planModels,
  }
  const pub = publicConfig(cfg)
  assert.equal(pub.defaultModel, 'cline-pass/glm-5.2', 'Should fall back to first available plan model')
  assert.ok(pub.defaultModelWarning, 'Should produce a defaultModelWarning')
  assert.match(pub.defaultModelWarning, /cline-pass\/deepseek-v4-flash/)
  assert.match(pub.defaultModelWarning, /cline-pass\/glm-5.2/)
})

test('models: formatModelContext and formatModelDescription', () => {
  assert.equal(formatModelContext(200000), '200K')
  assert.equal(formatModelContext(128000), '128K')
  assert.equal(formatModelContext(1000000), '1M')

  const sampleModel = {
    id: 'cline-pass/deepseek-v4-pro',
    name: 'DeepSeek V4 Pro',
    contextLength: 200000,
    category: 'coding',
    input: ['text', 'image'],
  }
  const desc = formatModelDescription(sampleModel)
  assert.ok(desc.includes('200K'))
  assert.ok(desc.includes('Vision'))
  assert.ok(desc.includes('Coding'))

  assert.equal(isVisionModel('cline-pass/qwen3.7-max'), true)
  assert.equal(isVisionModel('cline-pass/kimi-k2.7-code'), false)
})

test('models: saveModelsDiskCache and loadModelsDiskCache', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'clinebot-test-'))
  const cacheFile = path.join(tmpDir, 'cache.json')

  try {
    const testModels = [
      { id: 'cline-pass/cached-test', name: 'Cached Test', contextLength: 128000 },
    ]
    const saved = await saveModelsDiskCache(cacheFile, testModels)
    assert.equal(saved, true)

    const loaded = await loadModelsDiskCache(cacheFile)
    assert.ok(Array.isArray(loaded))
    assert.equal(loaded.length, 1)
    assert.equal(loaded[0].id, 'cline-pass/cached-test')

    // Non-existent path returns null
    const empty = await loadModelsDiskCache(path.join(tmpDir, 'nonexistent.json'))
    assert.equal(empty, null)

    // Isolation by account and endpoint (#168)
    const accAFile = path.join(tmpDir, 'cache-acc-a.json')
    await saveModelsDiskCache(accAFile, testModels, Date.now(), {
      endpoint: 'https://endpoint-a.example/v1',
      accountRef: 'CLINEBOT_API_KEY_A',
    })

    // Same endpoint and account loads successfully
    const match = await loadModelsDiskCache(accAFile, {
      endpoint: 'https://endpoint-a.example/v1',
      accountRef: 'CLINEBOT_API_KEY_A',
    })
    assert.ok(match)
    assert.equal(match.length, 1)

    // Mismatched account returns null
    const diffAcc = await loadModelsDiskCache(accAFile, {
      endpoint: 'https://endpoint-a.example/v1',
      accountRef: 'CLINEBOT_API_KEY_B',
    })
    assert.equal(diffAcc, null)

    // Mismatched endpoint returns null
    const diffEndpoint = await loadModelsDiskCache(accAFile, {
      endpoint: 'https://endpoint-b.example/v1',
      accountRef: 'CLINEBOT_API_KEY_A',
    })
    assert.equal(diffEndpoint, null)

    // Legacy unkeyed cache is rejected when account identity is expected
    const legacyReject = await loadModelsDiskCache(cacheFile, {
      endpoint: 'https://endpoint-a.example/v1',
      accountRef: 'CLINEBOT_API_KEY_A',
    })
    assert.equal(legacyReject, null)
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  }
})

test('models: reasoning efforts catalog coverage and dynamic assignment', () => {
  const reasoningIds = [
    'cline-pass/deepseek-v4-flash',
    'cline-pass/deepseek-v4-pro',
    'cline-pass/glm-5.2',
    'cline-pass/kimi-k3',
    'cline-pass/qwen3.7-max',
    'cline-pass/qwen3.7-plus',
    'cline-pass/minimax-m3',
    'cline-pass/mimo-v2.5',
    'cline-pass/mimo-v2.5-pro',
  ]
  const allCatalog = getAllModels()
  for (const id of reasoningIds) {
    const m = allCatalog.find(item => item.id === id)
    assert.ok(m, 'Model must exist: ' + id)
    assert.ok(Array.isArray(m.reasoningEfforts) && m.reasoningEfforts.length > 0, 'Model must have reasoningEfforts: ' + id)
    assert.ok(m.reasoningEfforts.includes('low') && m.reasoningEfforts.includes('high'), 'Model must include low and high: ' + id)
  }

  // Dynamic plan model gets reasoning if name matches
  const parsed = parsePlanIncludedModels('Includes Future DeepSeek Reasoning Model')
  assert.equal(parsed.length, 1)
  assert.ok(Array.isArray(parsed[0].reasoningEfforts) && parsed[0].reasoningEfforts.length > 0)
})

test('models: model context customization and authentic original provider specs', () => {
  // 1. Verify original specs via catalog
  const catalog = getAllModels([])
  const findOriginal = (id) => catalog.find(m => m.id === id || m.id === `cline-pass/${id}`)
  assert.equal(getOriginalModelContext('cline-pass/kimi-k3'), 2000000)
  assert.equal(findOriginal('cline-pass/kimi-k3')?.originalProvider, 'Moonshot AI')
  assert.equal(getOriginalModelContext('qwen3.7-max'), 1000000)
  assert.equal(findOriginal('qwen3.7-max')?.originalProvider, 'Alibaba Cloud')
  assert.equal(getOriginalModelContext('minimax-m3'), 1000000)
  assert.equal(findOriginal('minimax-m3')?.originalProvider, 'MiniMax')
  assert.equal(getOriginalModelContext('mimo-v2.5'), 1000000)
  assert.equal(findOriginal('mimo-v2.5')?.originalProvider, 'Xiaomi')
  assert.equal(getOriginalModelContext('deepseek-v4-flash'), 128000)
  assert.equal(findOriginal('deepseek-v4-flash')?.originalProvider, 'DeepSeek')

  // 2. formatModelContext handles various units cleanly
  assert.equal(formatModelContext(2000000), '2M')
  assert.equal(formatModelContext(1000000), '1M')
  assert.equal(formatModelContext(1500000), '1.5M')
  assert.equal(formatModelContext(200000), '200K')
  assert.equal(formatModelContext(128000), '128K')

  // 3. Default models catalog has clineContextLength and original specs
  const allDefault = getAllModels([])
  const kimi = allDefault.find((m) => m.id === 'cline-pass/kimi-k3')
  assert.ok(kimi)
  assert.equal(kimi.contextLength, 200000)
  assert.equal(kimi.defaultContextLength, 200000)
  assert.equal(kimi.originalContextLength, 2000000)
  assert.equal(kimi.originalProvider, 'Moonshot AI')
  assert.equal(kimi.isContextOverridden, false)

  // 4. Overrides apply correctly
  const overrides = [
    { modelId: 'cline-pass/kimi-k3', contextLength: 2000000, maxTokens: 16384 },
    { modelId: 'cline-pass/qwen3.7-max', contextLength: 1000000 },
  ]
  const allOverridden = getAllModels([], overrides)
  const kimiOverridden = allOverridden.find((m) => m.id === 'cline-pass/kimi-k3')
  assert.equal(kimiOverridden.contextLength, 2000000)
  assert.equal(kimiOverridden.maxTokens, 16384)
  assert.equal(kimiOverridden.isContextOverridden, true)
  assert.equal(kimiOverridden.defaultContextLength, 200000)

  const qwenOverridden = allOverridden.find((m) => m.id === 'cline-pass/qwen3.7-max')
  assert.equal(qwenOverridden.contextLength, 1000000)
  assert.equal(qwenOverridden.isContextOverridden, true)

  const deepseek = allOverridden.find((m) => m.id === 'cline-pass/deepseek-v4-flash')
  assert.equal(deepseek.contextLength, 128000)
  assert.equal(deepseek.isContextOverridden, false)
})


test('models: obsolete model ID migration and normalization', async () => {
  // 1. Direct ID migration mapping via migrateModelEntry and OBSOLETE_MODEL_ID_MAP
  assert.equal(migrateModelEntry({ id: 'cline-pass/deepseek-v41-flash' }).id, 'cline-pass/deepseek-v4.1-flash')
  assert.equal(migrateModelEntry({ id: 'cline-pass/qwen38-max' }).id, 'cline-pass/qwen3.8-max')
  assert.equal(migrateModelEntry({ id: 'cline-pass/glm-53' }).id, 'cline-pass/glm-5.3')
  assert.equal(migrateModelEntry({ id: 'cline-pass/glm-53-flash' }).id, 'cline-pass/glm-5.3-flash')
  assert.equal(migrateModelEntry({ id: 'cline-pass/muse-spark-13-contributor' }).id, 'cline-pass/muse-spark-1.3-contributor')
  assert.equal(migrateModelEntry({ id: 'cline-pass/kimi-k3' }).id, 'cline-pass/kimi-k3')
  assert.equal(OBSOLETE_MODEL_ID_MAP['cline-pass/deepseek-v41-flash'], 'cline-pass/deepseek-v4.1-flash')

  // 2. getAllModels migrates obsolete IDs in dynamicModels
  const oldDynamic = [
    { id: 'cline-pass/deepseek-v41-flash', name: 'DeepSeek V41 Flash', contextLength: 200000 },
    { id: 'cline-pass/qwen38-max', name: 'Qwen38 Max', contextLength: 200000 },
    { id: 'cline-pass/glm-53', name: 'GLM 53', contextLength: 200000 },
  ]
  const normalized = getAllModels(oldDynamic)
  const ids = normalized.map((m) => m.id)
  assert.ok(ids.includes('cline-pass/deepseek-v4.1-flash'))
  assert.ok(ids.includes('cline-pass/qwen3.8-max'))
  assert.ok(ids.includes('cline-pass/glm-5.3'))
  assert.ok(!ids.includes('cline-pass/deepseek-v41-flash'))
})


test('models: isCatalogDifferent accurately detects deletions, additions, metadata changes (#168)', () => {
  const modelA = { id: 'cline-pass/model-a', name: 'Model A', contextLength: 128000, maxTokens: 8192, category: 'general' }
  const modelB = { id: 'cline-pass/model-b', name: 'Model B', contextLength: 200000, maxTokens: 8192, category: 'coding' }
  const modelC = { id: 'cline-pass/model-c', name: 'Model C', contextLength: 64000, maxTokens: 4096, category: 'reasoning' }

  // 1. Identical lists return false
  assert.equal(isCatalogDifferent([modelA, modelB], [modelA, modelB]), false)

  // 2. Removed model (B removed from plan) returns true
  assert.equal(isCatalogDifferent([modelA, modelB], [modelA]), true, 'Removing a model must be detected')

  // 3. Added model (C added to plan) returns true
  assert.equal(isCatalogDifferent([modelA], [modelA, modelC]), true, 'Adding a model must be detected')

  // 4. Metadata change (contextLength upgraded from 128k to 200k) returns true
  const modelAUpgraded = { ...modelA, contextLength: 200000 }
  assert.equal(isCatalogDifferent([modelA], [modelAUpgraded]), true, 'Metadata change must be detected')

  // 5. Empty authoritative plan returns true if current has models
  assert.equal(isCatalogDifferent([modelA], []), true, 'Empty authoritative plan must trigger update')

  // 6. Both empty returns false
  assert.equal(isCatalogDifferent([], []), false)
})

test('provider-sync: autoDiscoverPlanModels reconciles removed models and metadata updates (#168)', async () => {
  const { autoDiscoverPlanModels } = await import('../lib/provider-sync.js')

  let replacedConfig = null
  let syncedConfig = null
  const mockSettingsApi = {
    replace: async (next) => {
      replacedConfig = next
    }
  }

  const modelFlash = { id: 'cline-pass/deepseek-v4-flash', name: 'DeepSeek V4 Flash', contextLength: 128000, maxTokens: 8192, category: 'general' }
  const modelPro = { id: 'cline-pass/deepseek-v4-pro', name: 'DeepSeek V4 Pro', contextLength: 200000, maxTokens: 8192, category: 'coding' }

  let currentConfig = {
    enabled: true,
    baseUrl: 'https://api.cline.bot/api/v1',
    apiKeyEnv: 'TEST_KEY_ENV_168',
    dynamicModels: [modelFlash, modelPro],
    planSyncedAt: 1000,
  }

  process.env.TEST_KEY_ENV_168 = 'valid-test-key-168'

  const mockCtx = {
    credentials: {
      resolve: async () => ({ value: 'valid-test-key-168' })
    },
    get: (n) => (n === 'credentials' ? mockCtx.credentials : null)
  }

  const originalFetch = globalThis.fetch
  try {
    // 1. Authoritative plan removes DeepSeek V4 Pro and retains only DeepSeek V4 Flash
    globalThis.fetch = async (url) => {
      if (url.includes('users/me/plan')) {
        return new Response(JSON.stringify({
          data: {
            plan: {
              name: 'Pro Plan',
              includedModels: ['Includes DeepSeek V4 Flash']
            }
          }
        }), { status: 200, headers: { 'content-type': 'application/json' } })
      }
      return new Response(JSON.stringify({ data: { limits: [] } }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      })
    }

    await autoDiscoverPlanModels(mockCtx, {
      live: () => currentConfig,
      getSettingsApi: () => mockSettingsApi,
      syncProviderState: async (next) => { syncedConfig = next }
    })

    assert.ok(replacedConfig, 'Settings must be replaced on catalog reconciliation')
    assert.equal(replacedConfig.dynamicModels.length, 1, 'Pro model must be removed from dynamicModels')
    assert.equal(replacedConfig.dynamicModels[0].id, 'cline-pass/deepseek-v4-flash')
    assert.ok(replacedConfig.planSyncedAt > 1000, 'planSyncedAt timestamp must be updated')

    // 2. Upstream API failure does NOT overwrite catalog with empty or bump planSyncedAt
    replacedConfig = null
    currentConfig = {
      ...currentConfig,
      dynamicModels: [modelFlash],
      planSyncedAt: 2000
    }

    globalThis.fetch = async () => {
      return new Response('Internal Server Error', { status: 500 })
    }

    await autoDiscoverPlanModels(mockCtx, {
      live: () => currentConfig,
      getSettingsApi: () => mockSettingsApi,
      syncProviderState: async () => {}
    })

    assert.equal(replacedConfig, null, 'Failed API request must not replace settings or advance planSyncedAt')
  } finally {
    globalThis.fetch = originalFetch
    delete process.env.TEST_KEY_ENV_168
  }
})

test('models: findModel and isSupportedModel resolve custom models (#170)', () => {
  const customModels = [
    {
      id: 'custom-internal-llm',
      name: 'Custom Internal LLM',
      contextLength: 64000,
      maxTokens: 4096,
      category: 'coding',
      isReasoning: true,
    },
    {
      id: 'custom-vision-agent',
      name: 'Custom Vision Agent',
      contextLength: 128000,
      input: ['text', 'vision'],
    },
  ]

  // 1. isSupportedModel
  assert.equal(isSupportedModel('custom-internal-llm', [], [], customModels), true)
  assert.equal(isSupportedModel('custom-vision-agent', [], [], customModels), true)
  assert.equal(isSupportedModel('unknown-nonexistent-model', [], [], customModels), false)

  // 2. findModel
  const m1 = findModel('custom-internal-llm', [], [], customModels)
  assert.ok(m1)
  assert.equal(m1.name, 'Custom Internal LLM')
  assert.equal(m1.contextLength, 64000)
  assert.equal(m1.maxTokens, 4096)
  assert.equal(m1.isCustom, true)
  assert.deepEqual(m1.reasoningEfforts, ['low', 'medium', 'high', 'max'])

  // 3. isVisionModel
  assert.equal(isVisionModel('custom-vision-agent', [], [], customModels), true)
  assert.equal(isVisionModel('custom-internal-llm', [], [], customModels), false)

  // 4. getDefaultModelIds
  const ids = getDefaultModelIds([], [], customModels)
  assert.ok(ids.includes('custom-internal-llm'))
  assert.ok(ids.includes('custom-vision-agent'))
})
