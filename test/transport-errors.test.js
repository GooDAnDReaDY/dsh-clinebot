import test from 'node:test'
import assert from 'node:assert/strict'
import { classifyUpstreamStatus } from '../lib/transport/cline-transport.js'

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
