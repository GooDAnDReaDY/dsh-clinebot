import test from 'node:test'
import assert from 'node:assert/strict'
import {
  normalizeBaseUrl,
  resolveApiKey,
  smokeChat,
  buildPiAiProvider,
  DEFAULT_BASE_URL,
  DEFAULT_API_KEY_ENV,
} from '../lib/cline-client.js'
import { PROVIDER_ID } from '../lib/models.js'

test('cline-client: normalizeBaseUrl', () => {
  assert.equal(normalizeBaseUrl(''), DEFAULT_BASE_URL)
  assert.equal(normalizeBaseUrl('https://api.cline.bot/api/v1/'), 'https://api.cline.bot/api/v1')
  assert.equal(normalizeBaseUrl('https://api.cline.bot'), 'https://api.cline.bot/api/v1')
  assert.equal(
    normalizeBaseUrl('https://api.cline.bot/api/v1/chat/completions'),
    'https://api.cline.bot/api/v1'
  )
  assert.equal(normalizeBaseUrl('http://127.0.0.1:8080/v1/'), 'http://127.0.0.1:8080/v1')
})

test('cline-client: resolveApiKey', () => {
  const env = { CLINEBOT_API_KEY: 'test-key-12345' }
  const res = resolveApiKey('CLINEBOT_API_KEY', env)
  assert.equal(res.envName, 'CLINEBOT_API_KEY')
  assert.equal(res.value, 'test-key-12345')

  const fallback = resolveApiKey('', env)
  assert.equal(fallback.envName, DEFAULT_API_KEY_ENV)
  assert.equal(fallback.value, 'test-key-12345')

  const missing = resolveApiKey('OTHER_KEY', env)
  assert.equal(missing.value, '')
})

test('cline-client: buildPiAiProvider', () => {
  const provider = buildPiAiProvider({
    baseUrl: 'https://api.cline.bot/api/v1',
    apiKeyEnv: 'MY_KEY',
    models: ['cline-pass/deepseek-v4-flash', 'cline-pass/glm-5.2'],
  })

  assert.equal(provider.api, 'openai-completions')
  assert.equal(provider.baseURL, 'https://api.cline.bot/api/v1')
  assert.equal(provider.apiKeyEnv, 'MY_KEY')
  assert.equal(provider.models.length, 2)
  assert.equal(provider.models[0].id, 'cline-pass/deepseek-v4-flash')
  assert.equal(provider.models[0].provider, PROVIDER_ID)
})

test('cline-client: smokeChat validation and error handling', async () => {
  // Missing key
  const noKey = await smokeChat('https://api.cline.bot/api/v1', '')
  assert.equal(noKey.ok, false)
  assert.match(noKey.error, /Missing API key/i)

  // Mocked successful 200 response
  const mockFetchSuccess = async (url, opts) => {
    assert.ok(url.endsWith('/chat/completions'))
    assert.equal(opts.method, 'POST')
    assert.equal(opts.headers.Authorization, 'Bearer valid-key')
    return {
      ok: true,
      status: 200,
      json: async () => ({
        model: 'cline-pass/deepseek-v4-flash',
        choices: [{ message: { content: 'pong hello' } }],
      }),
    }
  }

  const okResult = await smokeChat('https://api.cline.bot/api/v1', 'valid-key', {
    fetchImpl: mockFetchSuccess,
  })
  assert.equal(okResult.ok, true)
  assert.equal(okResult.status, 200)
  assert.equal(okResult.preview, 'pong hello')
  assert.ok(typeof okResult.latencyMs === 'number')

  // Mocked 401 response
  const mockFetchUnauthorized = async () => ({
    ok: false,
    status: 401,
    json: async () => ({
      error: { message: 'Invalid API key or expired subscription' },
    }),
  })

  const failResult = await smokeChat('https://api.cline.bot/api/v1', 'bad-key', {
    fetchImpl: mockFetchUnauthorized,
  })
  assert.equal(failResult.ok, false)
  assert.equal(failResult.status, 401)
  assert.match(failResult.error, /Invalid API key/i)
})
