import test from 'node:test'
import assert from 'node:assert/strict'
import { buildOpenAiPayload } from '../lib/adapter-messages.js'

test('adapter-messages: image read failure becomes a text block, not image_url (#276)', async () => {
  const messages = [{
    role: 'user',
    content: [{ type: 'image', attachment: { name: 'broken.png', mediaType: 'image/png' } }],
  }]
  const payload = await buildOpenAiPayload({ messages }, {
    attachments: {
      readImageRequest: async () => { throw new Error('synthetic read failure') },
    },
  })
  const serialized = JSON.stringify(payload.messages)
  assert.equal(serialized.includes('image_url'), false)
  assert.match(serialized, /Image: broken\.png/)
})

test('adapter-messages: successful image read remains an image_url', async () => {
  const messages = [{
    role: 'user',
    content: [{ type: 'image', attachment: { name: 'ok.png', mediaType: 'image/png' } }],
  }]
  const payload = await buildOpenAiPayload({ messages }, {
    attachments: {
      readImageRequest: async () => ({ data: Buffer.from('png'), mediaType: 'image/png' }),
    },
  })
  assert.equal(payload.messages[0].content[0].type, 'image_url')
  assert.match(payload.messages[0].content[0].image_url.url, /^data:image\/png;base64,/)
})
