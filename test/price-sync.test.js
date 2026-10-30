import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import {
  buildPublicCatalog,
  syncPublicPrices,
  loadPublicPriceCache,
  ensurePublicPricesForModels,
  isAllowedPriceCatalogUrl,
} from '../lib/price-sync.js'
import { setPublicPriceCatalog } from '../lib/model-prices.js'

const sample = {
  opencode: {
    id: 'opencode',
    models: {
      'deepseek/deepseek-v4.1-flash': {
        id: 'deepseek/deepseek-v4.1-flash',
        cost: { input: 0.3, output: 1.2, cache_read: 0.006 },
      },
      'glm-5.2': { id: 'glm-5.2', cost: { input: 0.7, output: 2.1 } },
    },
  },
  kilo: {
    id: 'kilo',
    models: {
      'deepseek/deepseek-v4.1-flash': {
        id: 'deepseek/deepseek-v4.1-flash',
        cost: { input: 9, output: 9 },
      },
    },
  },
}

test('price-sync: flattens provider catalogs and prefers the public provider', () => {
  const catalog = buildPublicCatalog(sample)
  assert.equal(catalog['deepseek-v4.1-flash'].input, 0.3)
  assert.equal(catalog['deepseek-v4.1-flash'].output, 1.2)
  assert.equal(catalog['deepseek-v4.1-flash'].cacheRead, 0.006)
  assert.equal(catalog['glm-5.2'].input, 0.7)
})

test('price-sync: auto-refreshes only for missing models and throttles repeats', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'clinebot-prices-auto-'))
  const cachePath = path.join(dir, 'prices.json')
  let calls = 0
  const fetchImpl = async () => {
    calls += 1
    return { ok: true, status: 200, json: async () => sample }
  }
  try {
    setPublicPriceCatalog({ 'glm-5.2': { input: 0.7, output: 2.1 } })
    const covered = await ensurePublicPricesForModels(['cline-pass/glm-5.2'], { cachePath, fetchImpl })
    assert.equal(covered.synced, false)
    assert.equal(calls, 0)

    const disabled = await ensurePublicPricesForModels(['cline-pass/unknown-model-disabled'], {
      cachePath,
      fetchImpl,
      enabled: false,
    })
    assert.equal(disabled.skipped, true)
    assert.equal(calls, 0)

    const missing = await ensurePublicPricesForModels(['cline-pass/unknown-model-xyz'], { cachePath, fetchImpl })
    assert.equal(missing.synced, true)
    assert.equal(calls, 1)
    assert.equal(missing.missing.length, 1)

    const repeated = await ensurePublicPricesForModels(['cline-pass/unknown-model-xyz'], { cachePath, fetchImpl })
    assert.equal(repeated.skipped, true)
    assert.equal(calls, 1)
  } finally {
    setPublicPriceCatalog({})
    rmSync(dir, { recursive: true, force: true })
  }
})

test('price-sync: price catalog URL is https models.dev only', () => {
  assert.equal(isAllowedPriceCatalogUrl('https://models.dev/api.json'), true)
  assert.equal(isAllowedPriceCatalogUrl('https://cdn.models.dev/api.json'), true)
  assert.equal(isAllowedPriceCatalogUrl('http://models.dev/api.json'), false)
  assert.equal(isAllowedPriceCatalogUrl('https://127.0.0.1/api.json'), false)
  assert.equal(isAllowedPriceCatalogUrl('https://169.254.169.254/latest/meta-data'), false)
  assert.equal(isAllowedPriceCatalogUrl('https://evil.example/api.json'), false)
})

test('price-sync: fetches, caches and reloads the public catalog', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'clinebot-prices-'))
  const cachePath = path.join(dir, 'prices.json')
  try {
    const result = await syncPublicPrices({
      url: 'https://models.dev/api.json',
      cachePath,
      fetchImpl: async () => ({ ok: true, status: 200, json: async () => sample }),
    })
    assert.equal(result.count, 2)
    assert.equal(result.catalog['deepseek-v4.1-flash'].input, 0.3)
    const saved = JSON.parse(readFileSync(cachePath, 'utf8'))
    assert.equal(saved.models['deepseek-v4.1-flash'].output, 1.2)
    assert.equal(loadPublicPriceCache(cachePath)['glm-5.2'].input, 0.7)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
