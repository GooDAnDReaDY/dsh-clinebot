import test from 'node:test'
import assert from 'node:assert/strict'
import { optimizePromptCacheAndBudget } from '../lib/multimodal-budget.js'

test('multimodal-budget: offloads seen images in earlier turns into stable text', () => {
  const messages = [
    {
      role: 'user',
      content: [
        { type: 'text', text: 'Analyze this chart' },
        { type: 'image_url', image_url: { url: 'data:image/png;base64,' + 'A'.repeat(5000) } },
      ],
    },
    {
      role: 'assistant',
      content: 'The chart shows an upward trend.',
    },
    {
      role: 'user',
      content: [
        { type: 'text', text: 'Now look at this new diagram' },
        { type: 'image_url', image_url: { url: 'data:image/png;base64,' + 'B'.repeat(5000) } },
      ],
    },
  ]

  const result = optimizePromptCacheAndBudget(messages, { offloadSeenImages: true })
  assert.equal(result.offloadedCount, 1)

  // Old image in turn 0 should be offloaded to stable text
  assert.equal(result.messages[0].content[1].type, 'text')
  assert.ok(result.messages[0].content[1].text.includes('[Image:'))

  // New image in turn 2 should remain as active image_url
  assert.equal(result.messages[2].content[1].type, 'image_url')
  assert.ok(result.messages[2].content[1].image_url.url.startsWith('data:image/png;base64,BBB'))
})

test('multimodal-budget: evicts oldest images when exceeding maxPayloadBytes', () => {
  const messages = [
    {
      role: 'user',
      content: [
        { type: 'image_url', image_url: { url: 'A'.repeat(1000) } },
        { type: 'image_url', image_url: { url: 'B'.repeat(1000) } },
      ],
    },
  ]

  // Set budget to 1500 bytes: total is 2000 bytes, so oldest (A) must be pruned
  const result = optimizePromptCacheAndBudget(messages, { maxPayloadBytes: 1500, offloadSeenImages: false })
  assert.equal(result.offloadedCount, 1)
  assert.equal(result.messages[0].content[0].type, 'text')
  assert.ok(result.messages[0].content[0].text.includes('budget'))
  assert.equal(result.messages[0].content[1].type, 'image_url')
})
