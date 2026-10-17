import test from 'node:test'
import assert from 'node:assert/strict'
import { discoverLocalClineKeys } from '../lib/key-discovery.js'

test('key-discovery: detects environment variable and masks secrets', () => {
  const origEnv = process.env.CLINE_API_KEY
  try {
    process.env.CLINE_API_KEY = 'cline_test_1234567890abcdef'
    const discovered = discoverLocalClineKeys()
    assert.ok(Array.isArray(discovered))
    const envHit = discovered.find((d) => d.key === 'cline_test_1234567890abcdef')
    assert.ok(envHit, 'Should find key from CLINE_API_KEY')
    assert.equal(envHit.maskedKey, 'cline_te••••cdef')
    assert.ok(envHit.source.includes('Environment'))
  } finally {
    if (origEnv !== undefined) {
      process.env.CLINE_API_KEY = origEnv
    } else {
      delete process.env.CLINE_API_KEY
    }
  }
})

test('key-discovery: returns clean array without crashing on non-existent directories', () => {
  const discovered = discoverLocalClineKeys()
  assert.ok(Array.isArray(discovered))
  for (const item of discovered) {
    assert.ok(typeof item.source === 'string')
    assert.ok(typeof item.key === 'string')
    assert.ok(typeof item.maskedKey === 'string')
    assert.ok(item.key.startsWith('cline_'))
  }
})
