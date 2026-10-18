/**
 * Host-half utilities: the request guards that protect the settings and proxy
 * routes, the credential resolution used by the proxy and the failover pool, the
 * bounded SWR cache, the retry runner, and the in-memory session metrics the
 * dashboard reads.
 *
 * All of it is pure or takes its I/O as an argument, so nothing here needs DSH,
 * the network, or a filesystem.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { isLoopbackAddress, isTrustedSettingsRequest, publicUsage, readBody, writeJson } from '../lib/http.js'
import {
  MAX_CACHE_ENTRIES,
  buildUsageCacheKey,
  clearUsageCache,
  normalizeBaseUrl,
  retryWithBackoff,
  setBoundedCache,
  usageCache,
} from '../lib/cline-client.js'
import { DEFAULT_API_KEY_ENV, resolveApiKey, resolveKeyValue, toCredentialRef } from '../lib/credential-refs.js'
import { extractUsageMetrics, hasDisallowedBrowserOrigin, isAuthorizedProxyRequest, setLocalProxyToken } from '../lib/proxy-token.js'
import { recordSessionRequest, recordSmokeTest, resetSessionStats, sessionStats } from '../lib/telemetry.js'

/** Build a request stub the guards can read. */
function request({ headers = {}, remoteAddress = '127.0.0.1', connectionService } = {}) {
  return { headers, socket: { remoteAddress }, connectionService }
}

/** Build a response stub that records what was written. */
function response() {
  return {
    statusCode: null,
    headers: null,
    body: '',
    writeHead(code, headers) { this.statusCode = code; this.headers = headers },
    end(chunk) { this.body = chunk ?? '' },
  }
}

test('loopback detection covers the addresses a local DSH can present', () => {
  for (const value of ['127.0.0.1', '127.1.2.3', 'localhost', 'LOCALHOST', '::1', '[::1]', '::ffff:127.0.0.1']) {
    assert.equal(isLoopbackAddress(value), true, `${value} should be loopback`)
  }
  for (const value of ['192.168.1.5', '10.0.0.1', 'example.com', '', undefined, null]) {
    assert.equal(isLoopbackAddress(value), false, `${value} should not be loopback`)
  }
})

test('a same-origin request from the DSH UI is trusted', () => {
  assert.equal(isTrustedSettingsRequest(request({ headers: { host: '127.0.0.1:19399', origin: 'http://127.0.0.1:19399' } })), true)
})

test('a cross-site request is rejected even from loopback', () => {
  assert.equal(isTrustedSettingsRequest(request({ headers: { 'sec-fetch-site': 'cross-site', host: '127.0.0.1:1', origin: 'http://127.0.0.1:1' } })), false)
})

test('a foreign origin is rejected', () => {
  const req = request({ headers: { host: '127.0.0.1:19399', origin: 'https://evil.example' }, remoteAddress: '203.0.113.9' })
  assert.equal(isTrustedSettingsRequest(req), false)
})

test('a plain loopback request without origin or referer is trusted, a remote one is not', () => {
  assert.equal(isTrustedSettingsRequest(request({ headers: { host: '127.0.0.1:1' } })), true)
  assert.equal(isTrustedSettingsRequest(request({ headers: { host: '127.0.0.1:1' }, remoteAddress: '203.0.113.9' })), false)
})

test('the connection service gate has the final say', () => {
  const allowed = { requestRejection: () => undefined }
  const denied = { requestRejection: () => ({ status: 403 }) }
  const throwing = { requestRejection: () => { throw new Error('boom') } }

  assert.equal(isTrustedSettingsRequest(request({ headers: { host: '127.0.0.1:1' }, connectionService: allowed })), true)
  assert.equal(isTrustedSettingsRequest(request({ headers: { host: '127.0.0.1:1' }, connectionService: denied })), false)
  assert.equal(isTrustedSettingsRequest(request({ headers: { host: '127.0.0.1:1' }, connectionService: throwing })), false)
})

test('writeJson answers JSON and never throws on a dead socket', () => {
  const res = response()
  writeJson(res, 201, { ok: true })
  assert.equal(res.statusCode, 201)
  assert.equal(res.headers['Content-Type'], 'application/json; charset=utf-8')
  assert.equal(res.headers['Cache-Control'], 'no-store')
  assert.deepEqual(JSON.parse(res.body), { ok: true })

  const dead = { writeHead() { throw new Error('closed') }, end() {} }
  assert.doesNotThrow(() => writeJson(dead, 200, {}))
})

test('readBody reads a stream and enforces the size cap', async () => {
  const body = await readBody(streamOf([Buffer.from('{"a":'), Buffer.from('1}')]))
  assert.equal(body.toString(), '{"a":1}')

  await assert.rejects(readBody(streamOf([Buffer.alloc(64)]), 16), /body too large/)
})

test('publicUsage reshapes the quota payload and hides anything extra', () => {
  assert.equal(publicUsage(null), null)
  assert.equal(publicUsage('nope'), null)

  const out = publicUsage({
    ok: true,
    plan: 'Cline Pass (Monthly)',
    user: { email: 'a@b.c', secret: 'nope' },
    windows: { fiveHour: { percentUsed: 11, remainingPercent: 89, resetsAt: '2026-01-01T00:00:00Z', internal: 1 } },
    checkedAt: 5,
    apiKey: 'must-not-leak',
  })
  assert.deepEqual(out, {
    ok: true,
    plan: 'Cline Pass (Monthly)',
    user: { email: 'a@b.c' },
    windows: { fiveHour: { percentUsed: 11, remainingPercent: 89, resetsAt: '2026-01-01T00:00:00Z' }, weekly: null, monthly: null },
    checkedAt: 5,
  })
  assert.ok(!JSON.stringify(out).includes('must-not-leak'))

  const failed = publicUsage({ ok: false, checkedAt: 1 })
  assert.deepEqual(failed, { ok: false, error: 'usage unavailable', checkedAt: 1 })
})

test('normalizeBaseUrl produces one canonical endpoint', () => {
  assert.equal(normalizeBaseUrl('https://api.cline.bot'), 'https://api.cline.bot/api/v1')
  assert.equal(normalizeBaseUrl('https://api.cline.bot/'), 'https://api.cline.bot/api/v1')
  assert.equal(normalizeBaseUrl('https://api.cline.bot/api/v1/chat/completions'), 'https://api.cline.bot/api/v1')
  assert.equal(normalizeBaseUrl('https://proxy.local/api/v1///'), 'https://proxy.local/api/v1')
  assert.equal(normalizeBaseUrl(''), 'https://api.cline.bot/api/v1')
  assert.equal(normalizeBaseUrl(undefined), 'https://api.cline.bot/api/v1')
})

test('the usage cache key is opaque and stable per endpoint and key', () => {
  const key = buildUsageCacheKey('https://api.cline.bot/api/v1', 'cline_secret_value')
  assert.match(key, /^cline:usage:[0-9a-f]{32}$/)
  assert.ok(!key.includes('cline_secret_value'), 'the raw key must never appear in the cache key')
  assert.equal(key, buildUsageCacheKey('https://api.cline.bot/', 'cline_secret_value'), 'the url is normalized first')
  assert.notEqual(key, buildUsageCacheKey('https://api.cline.bot/api/v1', 'other'))
  assert.equal(buildUsageCacheKey('https://api.cline.bot/api/v1', ''), '', 'no key means no cache entry')
})

test('clearUsageCache drops one entry, or all of them', () => {
  usageCache.clear()
  const a = buildUsageCacheKey('https://a.example', 'k1')
  const b = buildUsageCacheKey('https://b.example', 'k2')
  usageCache.set(a, 1)
  usageCache.set(b, 2)

  clearUsageCache('https://a.example', 'k1')
  assert.equal(usageCache.has(a), false)
  assert.equal(usageCache.has(b), true)

  clearUsageCache()
  assert.equal(usageCache.size, 0)
})

test('setBoundedCache evicts expired entries first, then the oldest', () => {
  const map = new Map()
  const past = Date.now() - 1000
  map.set('expired', { expiresAt: past })
  for (let i = 0; i < MAX_CACHE_ENTRIES - 1; i++) map.set(`k${i}`, {})

  setBoundedCache(map, 'fresh', {})
  assert.equal(map.size, MAX_CACHE_ENTRIES)
  assert.equal(map.has('expired'), false, 'expired entries go first')
  assert.equal(map.has('fresh'), true)
})

test('setBoundedCache drops the oldest entry when nothing is expired', () => {
  const map = new Map()
  for (let i = 0; i < MAX_CACHE_ENTRIES; i++) map.set(`k${i}`, {})
  setBoundedCache(map, 'newest', {})
  assert.equal(map.size, MAX_CACHE_ENTRIES)
  assert.equal(map.has('k0'), false)
  assert.equal(map.has('newest'), true)
})

test('retryWithBackoff retries transient statuses and returns the first good response', async () => {
  let calls = 0
  const res = await retryWithBackoff(async () => {
    calls++
    return calls < 3 ? { status: 503 } : { status: 200 }
  }, { maxRetries: 5, initialDelayMs: 1 })
  assert.equal(calls, 3)
  assert.equal(res.status, 200)
})

test('retryWithBackoff gives up after maxRetries and surfaces the last response', async () => {
  let calls = 0
  const res = await retryWithBackoff(async () => { calls++; return { status: 429 } }, { maxRetries: 2, initialDelayMs: 1 })
  assert.equal(calls, 3, 'the initial attempt plus two retries')
  assert.equal(res.status, 429)
})

test('retryWithBackoff rethrows a persistent error but survives a transient one', async () => {
  let calls = 0
  const recovered = await retryWithBackoff(async () => {
    calls++
    if (calls === 1) throw new Error('ECONNRESET')
    return { status: 200 }
  }, { maxRetries: 1, initialDelayMs: 1 })
  assert.equal(recovered.status, 200)

  await assert.rejects(
    retryWithBackoff(async () => { throw new Error('ECONNRESET') }, { maxRetries: 1, initialDelayMs: 1 }),
    /ECONNRESET/,
  )
})

test('resolveApiKey reads the named environment variable, never a literal key', () => {
  assert.deepEqual(resolveApiKey('CLINEBOT_API_KEY', { CLINEBOT_API_KEY: 'abc' }), { envName: 'CLINEBOT_API_KEY', value: 'abc' })
  assert.deepEqual(resolveApiKey('', {}), { envName: DEFAULT_API_KEY_ENV, value: '' })
  assert.deepEqual(resolveApiKey(undefined, { CLINEBOT_API_KEY: 'x' }), { envName: DEFAULT_API_KEY_ENV, value: 'x' })
  assert.deepEqual(resolveApiKey('MISSING', {}), { envName: 'MISSING', value: '' })
})

test('toCredentialRef falls back to an env reference outside DSH', async () => {
  assert.deepEqual(await toCredentialRef('KEY_NAME'), { type: 'env', name: 'KEY_NAME' })
  const already = { type: 'env', name: 'x' }
  assert.equal(await toCredentialRef(already), already)
})

test('resolveKeyValue prefers the credentials service over the environment', async () => {
  const ctx = {
    get: (name) => (name === 'credentials'
      ? { resolve: async () => ({ value: 'from-credentials' }) }
      : undefined),
  }
  assert.deepEqual(await resolveKeyValue(ctx, 'KEY'), { envName: 'KEY', value: 'from-credentials', source: 'credentials' })

  const empty = { get: () => ({ resolve: async () => undefined }) }
  assert.deepEqual(await resolveKeyValue(empty, 'ABSENT_KEY'), { envName: 'ABSENT_KEY', value: '', source: 'none' })
})

test('the browser-origin guard rejects anything a browser would send', () => {
  assert.equal(hasDisallowedBrowserOrigin({ headers: {} }), false)
  assert.equal(hasDisallowedBrowserOrigin({ headers: { 'sec-fetch-site': 'same-origin' } }), false)
  assert.equal(hasDisallowedBrowserOrigin({ headers: { 'sec-fetch-site': 'cross-site' } }), true)
  assert.equal(hasDisallowedBrowserOrigin({ headers: { 'sec-fetch-site': 'same-site' } }), true)
  assert.equal(hasDisallowedBrowserOrigin({ headers: { origin: 'http://127.0.0.1:1' } }), true)
})

test('the proxy accepts only the local token or a pooled account key', () => {
  setLocalProxyToken('local-token')
  const pool = [{ value: 'account-key' }]

  assert.equal(isAuthorizedProxyRequest({ headers: { authorization: 'Bearer local-token' } }, pool), true)
  assert.equal(isAuthorizedProxyRequest({ headers: { authorization: 'Bearer account-key' } }, pool), true)
  assert.equal(isAuthorizedProxyRequest({ headers: { authorization: 'Bearer nope' } }, pool), false)
  assert.equal(isAuthorizedProxyRequest({ headers: {} }, pool), false)
  assert.equal(isAuthorizedProxyRequest({ headers: { authorization: 'Basic x' } }, pool), false)
  assert.equal(isAuthorizedProxyRequest({ headers: { authorization: 'Bearer account-key' } }, []), false)
})

test('extractUsageMetrics reads the OpenAI usage shape and defaults to zero', () => {
  assert.deepEqual(extractUsageMetrics(null), { promptTokens: 0, completionTokens: 0, reasoningTokens: 0, totalTokens: 0 })
  assert.deepEqual(
    extractUsageMetrics({ prompt_tokens: 10, completion_tokens: 4, completion_tokens_details: { reasoning_tokens: 2 } }),
    { promptTokens: 10, completionTokens: 4, reasoningTokens: 2, totalTokens: 14 },
  )
  assert.deepEqual(
    extractUsageMetrics({ prompt_tokens: 1, completion_tokens: 2, total_tokens: 99 }),
    { promptTokens: 1, completionTokens: 2, reasoningTokens: 0, totalTokens: 99 },
  )
})

test('session metrics accumulate, attribute per model and reset', () => {
  resetSessionStats()
  assert.equal(sessionStats.totalRequests, 0)

  recordSessionRequest({ latencyMs: 120, ok: true, promptTokens: 10, completionTokens: 5, reasoningTokens: 2, model: 'm1' })
  recordSessionRequest({ latencyMs: 80, ok: false, error: 'boom', model: 'm1' })
  recordSessionRequest({ ok: false, aborted: true, model: 'm2' })

  assert.equal(sessionStats.totalRequests, 3)
  assert.equal(sessionStats.successfulRequests, 1)
  assert.equal(sessionStats.failedRequests, 1)
  assert.equal(sessionStats.abortedRequests, 1)
  assert.equal(sessionStats.lastLatencyMs, 120)
  assert.equal(sessionStats.lastError, 'boom', 'an aborted request must not overwrite the last error')
  assert.equal(sessionStats.promptTokensEst, 10)
  assert.equal(sessionStats.completionTokensEst, 5)
  assert.equal(sessionStats.reasoningTokensEst, 2)
  assert.equal(sessionStats.totalTokensEst, 15)
  assert.deepEqual(sessionStats.byModel.m1, { requests: 2, promptTokens: 10, completionTokens: 5, reasoningTokens: 2 })

  recordSessionRequest({ latencyMs: 200, ok: true, model: 'm1' })
  assert.equal(sessionStats.lastError, null, 'a later success clears the error')

  recordSmokeTest({ latencyMs: 42, ok: true, model: 'm1' })
  assert.equal(sessionStats.lastSmoke.ok, true)
  assert.equal(sessionStats.lastSmoke.latencyMs, 42)

  resetSessionStats()
  assert.equal(sessionStats.totalRequests, 0)
  assert.deepEqual(sessionStats.byModel, {})
  assert.equal(sessionStats.lastSmoke, null)
})

/** A minimal async-iterable stand-in for an HTTP request stream. */
function streamOf(chunks) {
  return {
    async *[Symbol.asyncIterator]() {
      for (const chunk of chunks) yield chunk
    },
  }
}
