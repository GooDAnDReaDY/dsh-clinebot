import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { buildPublicCatalog, syncPublicPrices, loadPublicPriceCache } from '../lib/price-sync.js'

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

test('price-sync: fetches, caches and reloads the public catalog', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'clinebot-prices-'))
  const cachePath = path.join(dir, 'prices.json')
  try {
    const result = await syncPublicPrices({
      url: 'https://example.invalid/api.json',
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
