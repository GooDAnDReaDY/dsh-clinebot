import test from 'node:test'
import assert from 'node:assert/strict'
import { ClineBotSearchProvider, CLINEBOT_SEARCH_PROVIDER_ID } from '../lib/web-search.js'

test('web-search: provider availability and configuration', () => {
  assert.equal(CLINEBOT_SEARCH_PROVIDER_ID, 'clinebot')
  const provider = new ClineBotSearchProvider({
    getBaseUrl: () => 'https://api.cline.bot/api/v1',
    getApiKey: () => 'test_key',
  })
  assert.equal(provider.available(), true)
  assert.equal(provider.id, 'clinebot')
})

test('web-search: search maps upstream results into WebSearchResult shape', async () => {
  const mockFetch = async (url, opts) => {
    assert.ok(url.includes('/alpha/web-search'))
    assert.equal(opts.method, 'POST')
    assert.ok(opts.headers.Authorization.includes('test_key'))
    return {
      ok: true,
      json: async () => ({
        results: [
          { title: 'Test 1', url: 'https://example.com/1', snippet: 'Snippet 1' },
          { title: 'Test 2', url: 'https://example.com/2', snippet: 'Snippet 2' },
        ],
      }),
    }
  }

  const provider = new ClineBotSearchProvider({
    getBaseUrl: () => 'https://api.cline.bot/api/v1',
    getApiKey: () => 'test_key',
    fetchImpl: mockFetch,
  })

  const res = await provider.search({ query: 'hello world', maxResults: 5 })
  assert.equal(res.sources.length, 2)
  assert.equal(res.sources[0].url, 'https://example.com/1')
  assert.equal(res.sources[0].title, 'Test 1')
  assert.equal(res.sources[0].snippet, 'Snippet 1')
})

test('web-search: respects AbortSignal', async () => {
  const provider = new ClineBotSearchProvider()
  const ctrl = new AbortController()
  ctrl.abort()
  await assert.rejects(async () => {
    await provider.search({ query: 'test' }, ctrl.signal)
  }, { name: 'AbortError' })
})
