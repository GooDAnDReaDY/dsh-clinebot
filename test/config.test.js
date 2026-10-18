/**
 * The config read model.
 *
 * `lib/config.js` is the host half's contract with DSH in both directions: the
 * `Config` schema decides which fields the settings page can even show (DSH's
 * `settings.describe` publishes volatile fields only), and `publicConfig` is what
 * the client and the model registration actually read. A field that stops being
 * volatile disappears from the UI with no error — so the volatile set is pinned
 * here, and so is the projection built on top of it.
 *
 * `@deepseek-ai/schemastery` is supplied by DSH at runtime; the suite maps it to a
 * local stand-in (see test/stubs/schemastery.mjs), so this file skips itself if the
 * resolver hook is unavailable instead of failing the run.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { CLINE_MODELS, DEFAULT_MODEL_ID } from '../lib/models.js'

const configModule = await import('../lib/config.js').catch(() => null)
const skip = configModule
  ? false
  : 'lib/config.js needs the @deepseek-ai/schemastery stand-in (Node >= 20.6 for module.register)'

const {
  Config,
  NS,
  LLM_PI_AI_NS,
  isVolatileRef,
  plainConfig,
  publicConfig,
  volatileConfig,
} = configModule ?? {}

test('the config namespaces are the ones the rest of the plugin assumes', { skip }, () => {
  assert.equal(NS, 'dsh-clinebot')
  assert.equal(LLM_PI_AI_NS, 'llm-pi-ai')
})

test('exactly the documented fields are volatile, and the rest are not', { skip }, () => {
  const volatile = []
  const hidden = []
  for (const [key, field] of Object.entries(Config.dict)) {
    ;(field?.meta?.volatile ? volatile : hidden).push(key)
  }

  // Volatile fields are published to the browser; the three that are not are host-only.
  assert.deepEqual(hidden.sort(), ['dynamicModels', 'enabledModels', 'planSyncedAt'])
  assert.ok(volatile.length > 0)
  for (const key of ['enabled', 'baseUrl', 'apiKeyEnv', 'defaultModel', 'showSidebarQuota', 'proxyMode', 'accounts']) {
    assert.ok(volatile.includes(key), `${key} must be volatile or the settings page drops it`)
  }
})

test('showSidebarQuota stays volatile, since the sidebar meter reads it from the published config', { skip }, () => {
  assert.equal(Config.dict.showSidebarQuota?.meta?.volatile, true)
})

test('every field carries a description for the settings form', { skip }, () => {
  for (const [key, field] of Object.entries(Config.dict)) {
    assert.equal(typeof field?.meta?.description, 'string', `${key} needs a description`)
    assert.ok(field.meta.description.length > 0)
  }
})

test('isVolatileRef recognises the { get } wrapper DSH stores volatile fields as', { skip }, () => {
  assert.equal(isVolatileRef({ get: () => 1 }), true)
  assert.equal(isVolatileRef({ get: 1 }), false, 'the property must be callable')
  assert.equal(isVolatileRef([1, 2]), false)
  assert.equal(isVolatileRef('x'), false)
  assert.equal(isVolatileRef(null), false)
  assert.equal(isVolatileRef(undefined), false)
})

test('plainConfig unwraps getters, thunks and nested { get } wrappers', { skip }, () => {
  const config = {
    enabled: () => true,
    nested: { value: { get: () => 'deep' } },
    list: [{ get: () => 'a' }, 'b'],
    count: 3,
    nothing: null,
  }
  assert.deepEqual(plainConfig(config), {
    enabled: true,
    nested: { value: 'deep' },
    list: ['a', 'b'],
    count: 3,
    nothing: null,
  })
})

test('plainConfig is a copy, not a mutation of the input', { skip }, () => {
  const inner = { get: () => 1 }
  const input = { inner }
  const out = plainConfig(input)
  assert.deepEqual(out, { inner: 1 })
  assert.equal(typeof input.inner.get, 'function')
})

test('volatileConfig keeps only the volatile fields actually present', { skip }, () => {
  const out = volatileConfig({ showSidebarQuota: false, proxyMode: true, dynamicModels: [{ id: 'x' }], planSyncedAt: 5 })
  assert.deepEqual(Object.keys(out).sort(), ['proxyMode', 'showSidebarQuota'])
  assert.equal(out.showSidebarQuota, false)
})

test('volatileConfig sees through the volatile wrappers before filtering', { skip }, () => {
  const out = volatileConfig({ showSidebarQuota: { get: () => false }, enabled: () => true })
  assert.deepEqual(out, { showSidebarQuota: false, enabled: true })
})

test('an empty config falls back to the documented defaults', { skip }, () => {
  const out = publicConfig({})
  assert.equal(out.enabled, false, 'enabled mirrors the config flag exactly')
  assert.equal(out.baseUrl, 'https://api.cline.bot/api/v1')
  assert.equal(out.apiKeyEnv, 'CLINEBOT_API_KEY')
  assert.equal(out.defaultModel, DEFAULT_MODEL_ID)
  assert.equal(out.defaultModelWarning, null)
  assert.equal(out.planSynced, false)
  assert.equal(out.showSidebarQuota, true)
  assert.equal(out.proxyMode, true)
  assert.equal(out.accountMode, 'least_used')
  assert.equal(out.timeoutMs, 15000)
  assert.equal(out.enabledModels.length > 0, true, 'the picker always has something to offer')
})

test('the base URL is normalized for every consumer', { skip }, () => {
  assert.equal(publicConfig({ baseUrl: 'https://api.cline.bot/' }).baseUrl, 'https://api.cline.bot/api/v1')
  assert.equal(publicConfig({ baseUrl: 'https://api.cline.bot/api/v1/chat/completions' }).baseUrl, 'https://api.cline.bot/api/v1')
})

test('a default model missing from the active plan falls back and warns', { skip }, () => {
  const dynamic = [{ id: 'cline-pass/kimi-k3', name: 'Kimi K3', description: '', contextLength: 200000, maxTokens: 8192 }]
  const out = publicConfig({ defaultModel: 'cline-pass/not-in-plan', dynamicModels: dynamic, planSyncedAt: 1 })

  assert.equal(out.planSynced, true)
  assert.equal(out.defaultModel, 'cline-pass/kimi-k3')
  assert.match(out.defaultModelWarning, /not available in your active plan/)
})

test('the legacy enabledModels list is translated into disabledModels', { skip }, () => {
  const out = publicConfig({ enabledModels: ['cline-pass/kimi-k3'] })
  assert.ok(out.disabledModels.includes('cline-pass/deepseek-v4.1-flash'))
  assert.ok(!out.disabledModels.includes('cline-pass/kimi-k3'))
  assert.deepEqual(out.enabledModels, ['cline-pass/kimi-k3'])
})

test('a synced plan makes the plan models the whole universe the picker sees', { skip }, () => {
  const dynamic = [{ id: 'cline-pass/kimi-k3', name: 'Kimi K3', description: '', contextLength: 200000, maxTokens: 8192 }]
  const synced = { dynamicModels: dynamic, planSyncedAt: 1 }

  const out = publicConfig(synced)
  assert.equal(out.planSynced, true)
  assert.deepEqual(out.enabledModels, ['cline-pass/kimi-k3'])
  assert.deepEqual(out.dynamicModels, dynamic, 'the plan rows are projected through')

  // The toggle is projected for the client; the active set is already plan-only
  // because an unsynced catalogue is not part of this projection.
  assert.equal(publicConfig({ ...synced, filterModelsByPlan: true }).filterModelsByPlan, true)
  assert.equal(publicConfig({ ...synced, filterModelsByPlan: false }).filterModelsByPlan, false)
  assert.equal(publicConfig(synced).filterModelsByPlan, true, 'defaults to on')
})

test('an unsynced plan offers the whole catalogue', { skip }, () => {
  const out = publicConfig({})
  assert.equal(out.planSynced, false)
  assert.equal(out.enabledModels.length, CLINE_MODELS.length)
})

test('visibleModels narrows the picker to the selected subset', { skip }, () => {
  const out = publicConfig({ visibleModels: ['cline-pass/kimi-k3'] })
  assert.deepEqual(out.visibleModels, ['cline-pass/kimi-k3'])
  assert.deepEqual(out.enabledModels, ['cline-pass/kimi-k3'])
})

test('obsolete ids in the config are migrated on the way out', { skip }, () => {
  const out = publicConfig({
    defaultModel: 'cline-pass/deepseek-v4-flash',
    disabledModels: ['cline-pass/glm-53'],
    visibleModels: ['cline-pass/qwen38-max'],
  })
  assert.equal(out.defaultModel, 'cline-pass/deepseek-v4.1-flash')
  assert.deepEqual(out.disabledModels, ['cline-pass/glm-5.3'])
  assert.deepEqual(out.visibleModels, ['cline-pass/qwen3.8-max'])
})

test('the projection is a plain object, safe to structuredClone', { skip }, () => {
  const out = publicConfig({ enabled: () => true, showSidebarQuota: { get: () => false } })
  assert.doesNotThrow(() => structuredClone(out))
  assert.equal(out.showSidebarQuota, false)
})

test('accounts and routing maps pass through with sane fallbacks', { skip }, () => {
  const out = publicConfig({
    accounts: [{ label: 'work', apiKeyEnv: 'KEY_2' }],
    activeAccount: 'KEY_2',
    accountMode: 'round_robin',
    modelRoutes: { 'cline-pass/kimi-k3': 'KEY_2' },
  })
  assert.deepEqual(out.accounts, [{ label: 'work', apiKeyEnv: 'KEY_2' }])
  assert.equal(out.activeAccount, 'KEY_2')
  assert.equal(out.accountMode, 'round_robin')
  assert.deepEqual(out.modelRoutes, { 'cline-pass/kimi-k3': 'KEY_2' })

  const fallback = publicConfig({ accountMode: 'nonsense' })
  assert.equal(fallback.accountMode, 'least_used')
  assert.deepEqual(fallback.accounts, [])
})
