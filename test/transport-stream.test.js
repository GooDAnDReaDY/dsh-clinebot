import test from 'node:test'
import assert from 'node:assert/strict'
import { readResponseText, readSseEvents } from '../lib/transport/cline-transport.js'

function openStream(chunk, { close = false } = {}) {
  let cancelled = false
  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    start(controller) {
      if (chunk !== undefined) controller.enqueue(encoder.encode(chunk))
      if (close) controller.close()
    },
    cancel() {
      cancelled = true
    },
  })
  return { stream, isCancelled: () => cancelled }
}

test('transport: non-SSE body read has an idle timeout and cancels the reader (#277)', async () => {
  const { stream, isCancelled } = openStream('partial-body')
  await assert.rejects(
    readResponseText({ body: stream }, { idleTimeoutMs: 25 }),
    /idle timeout/i,
  )
  assert.equal(isCancelled(), true)
})

test('transport: non-SSE overflow cancels the reader (#278)', async () => {
  const { stream, isCancelled } = openStream('x'.repeat(100))
  await assert.rejects(
    readResponseText({ body: stream }, { maxBytes: 10, idleTimeoutMs: 1000 }),
    /exceeded/i,
  )
  assert.equal(isCancelled(), true)
})

test('transport: an oversized SSE event is rejected and cancels the reader (#278)', async () => {
  const { stream, isCancelled } = openStream('x'.repeat(2048))
  await assert.rejects(async () => {
    for await (const _event of readSseEvents({ body: stream }, { maxEventBytes: 1024, idleTimeoutMs: 1000 })) {
      // no events expected
    }
  }, /SSE event exceeded/i)
  assert.equal(isCancelled(), true)
})
