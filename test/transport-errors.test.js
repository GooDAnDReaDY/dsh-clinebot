import test from 'node:test'
import assert from 'node:assert/strict'
import { classifyUpstreamStatus, sanitizeDiagnostic } from '../lib/transport/cline-transport.js'

test('transport: classifies insufficient credits separately from quota', () => {
  const credits = classifyUpstreamStatus(402, '{"error":"Insufficient credits"}')
  assert.equal(credits.code, 'INSUFFICIENT_CREDITS')
  assert.equal(credits.retryable, true)
  assert.match(credits.message, /insufficient credits/i)

  const quota = classifyUpstreamStatus(400, '{"error":"usage limit reached"}')
  assert.equal(quota.code, 'QUOTA_EXCEEDED')
  assert.equal(quota.retryable, true)
})

test('transport: request-too-large is explicit and non-retryable', () => {
  const tooLarge = classifyUpstreamStatus(413, 'request body has too many JSON nodes')
  assert.equal(tooLarge.code, 'REQUEST_TOO_LARGE')
  assert.equal(tooLarge.retryable, false)
  assert.match(tooLarge.message, /Start a new session or reduce messages and images/)

  const payload = classifyUpstreamStatus(400, 'payload too large')
  assert.equal(payload.code, 'REQUEST_TOO_LARGE')
})

test('transport: context-window errors stay distinct from size errors', () => {
  const context = classifyUpstreamStatus(400, 'maximum context length exceeded')
  assert.equal(context.code, 'CONTEXT_WINDOW_EXCEEDED')
  assert.equal(context.retryable, false)
})

test('transport: classifies HTTP 401 as AUTH strictly', () => {
  const auth = classifyUpstreamStatus(401, '{"error":"Unauthorized"}')
  assert.equal(auth.code, 'AUTH')
  assert.equal(auth.retryable, false)
  assert.match(auth.message, /authentication failed \(HTTP 401\)/i)
})

test('transport: classifies 403 ENTITLEMENT_ERROR as MODEL_UNSUPPORTED', () => {
  const body = '{"error":{"code":"ENTITLEMENT_ERROR","message":"Error 403: the user is not subscribed to required model plan"}}'
  const classified = classifyUpstreamStatus(403, body)
  assert.equal(classified.code, 'MODEL_UNSUPPORTED')
  assert.equal(classified.retryable, true)
  assert.match(classified.message, /model access denied \(HTTP 403\)/i)
  assert.match(classified.message, /user is not subscribed to required model plan/i)
  assert.doesNotMatch(classified.message, /invalid api key/i)
})

test('transport: classifies 403 subscription/plan phrasing as MODEL_UNSUPPORTED', () => {
  const classified = classifyUpstreamStatus(403, 'Subscription required for this model tier')
  assert.equal(classified.code, 'MODEL_UNSUPPORTED')
  assert.equal(classified.retryable, true)
  assert.match(classified.message, /model access denied \(HTTP 403\)/i)
})

test('transport: classifies 403 quota/credit exhaustion as INSUFFICIENT_CREDITS', () => {
  const classified = classifyUpstreamStatus(403, '{"error":"Account out of credits"}')
  assert.equal(classified.code, 'INSUFFICIENT_CREDITS')
  assert.equal(classified.retryable, true)
  assert.match(classified.message, /insufficient credits or quota/i)
})

test('transport: classifies proven 403 credential invalidity as AUTH', () => {
  const classified = classifyUpstreamStatus(403, '{"error":{"code":"INVALID_API_KEY","message":"API key is revoked or invalid"}}')
  assert.equal(classified.code, 'AUTH')
  assert.equal(classified.retryable, false)
  assert.match(classified.message, /authentication failed \(HTTP 403\)/i)
})

test('transport: classifies 403 Cloudflare/WAF block as GATEWAY_ERROR', () => {
  const html = '<!DOCTYPE html><html><head><title>Access Denied - Cloudflare</title></head><body>Ray ID: 12345</body></html>'
  const classified = classifyUpstreamStatus(403, html)
  assert.equal(classified.code, 'GATEWAY_ERROR')
  assert.equal(classified.retryable, false)
  assert.equal(classified.message, 'ClinePass gateway denied access (HTTP 403)')
})

test('transport: classifies generic 403 as FORBIDDEN preserving sanitized detail', () => {
  const classified = classifyUpstreamStatus(403, 'Policy violation: prompt rejected by organization rules')
  assert.equal(classified.code, 'FORBIDDEN')
  assert.equal(classified.retryable, false)
  assert.match(classified.message, /ClinePass request forbidden \(HTTP 403\): Policy violation/i)
})

test('transport: sanitizeDiagnostic redacts API keys and Bearer tokens', () => {
  const dirty = 'Error with key cline_abcdef123456789 and Bearer sk_secret_token_12345678'
  const cleaned = sanitizeDiagnostic(dirty)
  assert.doesNotMatch(cleaned, /cline_abcdef123456789/)
  assert.doesNotMatch(cleaned, /sk_secret_token_12345678/)
  assert.match(cleaned, /\[REDACTED_KEY\]/)
  assert.match(cleaned, /Bearer \[REDACTED\]/)
})
