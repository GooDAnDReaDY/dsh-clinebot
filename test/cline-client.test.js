import test from 'node:test'
import assert from 'node:assert/strict'
import {
  normalizeBaseUrl,
  resolveApiKey,
  smokeChat,
  buildPiAiProvider,
  fetchUsageLimits,
  saveCredentialKey,
  clearUsageCache,
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

test('cline-client: buildPiAiProvider with custom models', () => {
  const customModels = [
    { id: 'cline-pass/deepseek-v4-moe', name: 'DeepSeek V4 MoE', input: ['text', 'vision'] },
  ]
  const provider = buildPiAiProvider({
    baseUrl: 'https://api.cline.bot/api/v1',
    apiKeyEnv: 'MY_KEY',
    models: ['cline-pass/deepseek-v4-moe', 'cline-pass/glm-5.2'],
    customModels,
  })

  assert.equal(provider.api, 'openai-completions')
  assert.equal(provider.baseURL, 'https://api.cline.bot/api/v1')
  assert.equal(provider.apiKeyEnv, 'MY_KEY')
  assert.equal(provider.models.length, 2)
  assert.equal(provider.models[0].id, 'cline-pass/deepseek-v4-moe')
  assert.equal(provider.models[0].provider, PROVIDER_ID)
})

test('cline-client: fetchUsageLimits parsing and caching', async () => {
  clearUsageCache()

  const mockFetch = async (url) => {
    if (url.includes('/users/me/plan/usage-limits')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          data: {
            limits: [
              { type: '5-hour', percentUsed: 25.4, resetsAt: '2026-09-04T18:00:00Z' },
              { type: 'weekly', percentUsed: 50.0, resetsAt: '2026-09-08T00:00:00Z' },
              { type: 'monthly', percentUsed: 10.0, resetsAt: '2026-09-30T00:00:00Z' },
            ],
          },
        }),
      }
    }
    if (url.includes('/users/me')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          data: { email: 'developer@example.com', createdAt: '2026-08-01T00:00:00Z' },
        }),
      }
    }
    return { ok: false, status: 404 }
  }

  const res = await fetchUsageLimits('https://api.cline.bot/api/v1', 'valid-key', {
    fetchImpl: mockFetch,
    bypassCache: true,
  })

  assert.equal(res.ok, true)
  assert.equal(res.user.email, 'developer@example.com')
  assert.equal(res.windows.fiveHour.percentUsed, 25.4)
  assert.equal(res.windows.fiveHour.remainingPercent, 74.6)
  assert.equal(res.windows.weekly.percentUsed, 50)
  assert.equal(res.windows.weekly.remainingPercent, 50)
})

test('cline-client: saveCredentialKey integration', async () => {
  const mockCredentials = {
    set: async (ref, value) => {
      assert.ok(ref)
      assert.equal(value, 'secret-cline-key-123')
    },
  }
  const ctx = { credentials: mockCredentials }

  const res = await saveCredentialKey(ctx, 'CLINEBOT_API_KEY', 'secret-cline-key-123')
  assert.equal(res.ok, true)
  assert.equal(res.envName, 'CLINEBOT_API_KEY')

  // Empty key throws
  await assert.rejects(
    () => saveCredentialKey(ctx, 'CLINEBOT_API_KEY', ''),
    /API key cannot be empty/
  )
})

test('cline-client: smokeChat validation and error handling', async () => {
  const noKey = await smokeChat('https://api.cline.bot/api/v1', '')
  assert.equal(noKey.ok, false)
  assert.match(noKey.error, /Missing API key/i)

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

test('cline-client: sessionStats and request recording', async () => {
  const { sessionStats, recordSessionRequest, resetSessionStats } = await import('../lib/cline-client.js')
  resetSessionStats()

  assert.equal(sessionStats.totalRequests, 0)
  recordSessionRequest({ latencyMs: 150, ok: true, promptTokens: 10, completionTokens: 25 })
  assert.equal(sessionStats.totalRequests, 1)
  assert.equal(sessionStats.successfulRequests, 1)
  assert.equal(sessionStats.failedRequests, 0)
  assert.equal(sessionStats.totalTokensEst, 35)
  assert.equal(sessionStats.lastLatencyMs, 150)

  recordSessionRequest({ ok: false, error: 'Network timeout' })
  assert.equal(sessionStats.totalRequests, 2)
  assert.equal(sessionStats.failedRequests, 1)
  assert.equal(sessionStats.lastError, 'Network timeout')

  resetSessionStats()
  assert.equal(sessionStats.totalRequests, 0)
})

