import test from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { ClineBotAdapter } from '../lib/adapter.js'
import { resetSessionRouter } from '../lib/session-router.js'

const TEMP_STATS = path.join(os.tmpdir(), `clinebot-adapter-stats-${Date.now()}.json`)

/**
 * Start one HTTP server for the duration of a test.
 * @param {(req: http.IncomingMessage, res: http.ServerResponse, body: string) => void} handler
 * @returns {Promise<{ baseUrl: string, requests: Array<{ headers: Record<string, string>, body: any }>, close: () => Promise<void> }>}
 */
async function startServer(handler) {
  const requests = []
  const server = http.createServer((req, res) => {
    const chunks = []
    req.on('data', (chunk) => chunks.push(chunk))
    req.on('end', () => {
      const body = Buffer.concat(chunks).toString('utf8')
      let parsed = null
      try { parsed = JSON.parse(body) } catch {}
      requests.push({ headers: req.headers, body: parsed })
      handler(req, res, body)
    })
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    requests,
    close: () => new Promise((resolve) => server.close(resolve)),
  }
}

/**
 * Build the adapter config for one mock endpoint.
 * @param {string} baseUrl
 * @param {Record<string, unknown>} [overrides]
 */
function configFor(baseUrl, overrides = {}) {
  return {
    enabled: true,
    baseUrl,
    apiKeyEnv: 'CLINEBOT_API_KEY',
    defaultModel: 'cline-pass/deepseek-v4.1-flash',
    dynamicModels: [],
    modelContextOverrides: [],
    customModels: [],
    disabledModels: [],
    visibleModels: [],
    filterModelsByPlan: true,
    modelReasoningDefaults: {},
    modelRoutes: {},
    accounts: [],
    activeAccount: '',
    accountMode: 'least_used',
    statsPath: TEMP_STATS,
    timeoutMs: 2000,
    streamIdleTimeoutMs: 2000,
    maxPayloadMb: 40,
    maxOutputTokens: -1,
    ...overrides,
  }
}

/**
 * Fake credentials service backed by an in-memory map.
 * @param {Record<string, string>} keys
 */
function credentialsCtx(keys) {
  return {
    get(name) {
      if (name === 'credentials') {
        return {
          resolve: async (ref) => ({ value: keys[ref?.name || ref] || '' }),
        }
      }
      return undefined
    },
    logger: { warn() {} },
  }
}

function sse(events) {
  return events.map((event) => `data: ${typeof event === 'string' ? event : JSON.stringify(event)}\n\n`).join('')
}

async function collect(iterable) {
  const out = []
  for await (const chunk of iterable) out.push(chunk)
  return out
}

test.after(() => {
  try { fs.rmSync(TEMP_STATS, { force: true }) } catch {}
})

test('adapter: listModels and resolveModel expose catalogue metadata', async () => {
  resetSessionRouter()
  const adapter = new ClineBotAdapter({ ctx: credentialsCtx({}), live: () => configFor('http://127.0.0.1:1') })

  const models = await adapter.listModels('clinebot')
  assert.ok(models.length >= 10)
  assert.ok(models.every((model) => model.provider === 'clinebot'))
  const flash = models.find((model) => model.id === 'cline-pass/deepseek-v4.1-flash')
  assert.ok(flash)
  assert.deepEqual(flash.inputModalities, ['text', 'image'])

  const resolved = await adapter.resolveModel('clinebot', 'cline-pass/deepseek-v4.1-flash')
  assert.equal(resolved.provider, 'clinebot')
  assert.equal(resolved.context.contextWindow, 1000000)
  assert.ok(resolved.defaultMaxTokens > 0)
  assert.ok(Array.isArray(resolved.reasoning.efforts))
})

test('adapter: visibleModels and disabledModels filter the picker catalogue', async () => {
  const adapter = new ClineBotAdapter({
    ctx: credentialsCtx({}),
    live: () => configFor('http://127.0.0.1:1', {
      visibleModels: ['cline-pass/kimi-k3'],
      disabledModels: [],
    }),
  })
  const models = await adapter.listModels('clinebot')
  assert.deepEqual(models.map((model) => model.id), ['cline-pass/kimi-k3'])
})

test('adapter: stream maps text deltas, usage and finish', async () => {
  resetSessionRouter()
  const server = await startServer((_req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/event-stream' })
    res.end(sse([
      { choices: [{ delta: { content: 'Hel' } }] },
      { choices: [{ delta: { content: 'lo' } }] },
      { choices: [{ delta: {}, finish_reason: 'stop' }] },
      {
        usage: {
          prompt_tokens: 100,
          completion_tokens: 20,
          total_tokens: 120,
          prompt_tokens_details: { cached_tokens: 40 },
          completion_tokens_details: { reasoning_tokens: 5 },
        },
      },
      '[DONE]',
    ]))
  })

  try {
    const adapter = new ClineBotAdapter({
      ctx: credentialsCtx({ CLINEBOT_API_KEY: 'key-a' }),
      live: () => configFor(server.baseUrl),
    })
    const chunks = await collect(adapter.stream({
      provider: 'clinebot',
      model: 'cline-pass/deepseek-v4.1-flash',
      messages: [{ role: 'user', content: [{ type: 'text', text: 'hi' }] }],
      sessionId: 'session-text',
    }))

    const text = chunks.filter((chunk) => chunk.type === 'text-delta').map((chunk) => chunk.text).join('')
    assert.equal(text, 'Hello')
    const usage = chunks.find((chunk) => chunk.type === 'usage')
    assert.ok(usage)
    assert.equal(usage.usage.inputTokens, 60)
    assert.equal(usage.usage.cacheReadTokens, 40)
    assert.equal(usage.usage.outputTokens, 20)
    assert.equal(usage.usage.reasoningTokens, 5)
    assert.deepEqual(chunks.at(-1), { type: 'finish', reason: { kind: 'stop' } })
    assert.equal(server.requests.length, 1)
    assert.equal(server.requests[0].headers.authorization, 'Bearer key-a')
    assert.equal(server.requests[0].body.stream, true)
  } finally {
    await server.close()
  }
})

test('adapter: stream assembles reasoning and tool-call blocks', async () => {
  resetSessionRouter()
  const server = await startServer((_req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/event-stream' })
    res.end(sse([
      { choices: [{ delta: { reasoning_content: 'think' } }] },
      {
        choices: [{
          delta: {
            tool_calls: [{
              index: 0,
              id: 'call_1',
              type: 'function',
              function: { name: 'read_file', arguments: '{"path":' },
            }],
          },
        }],
      },
      {
        choices: [{
          delta: {
            tool_calls: [{ index: 0, function: { arguments: '"a.txt"}' } }],
          },
        }],
      },
      { choices: [{ delta: {}, finish_reason: 'tool_calls' }] },
      '[DONE]',
    ]))
  })

  try {
    const adapter = new ClineBotAdapter({
      ctx: credentialsCtx({ CLINEBOT_API_KEY: 'key-a' }),
      live: () => configFor(server.baseUrl),
    })
    const chunks = await collect(adapter.stream({
      provider: 'clinebot',
      model: 'cline-pass/deepseek-v4.1-flash',
      messages: [{ role: 'user', content: [{ type: 'text', text: 'read a file' }] }],
      sessionId: 'session-tools',
    }))

    const reasoning = chunks.find((chunk) => chunk.type === 'reasoning-delta')
    assert.equal(reasoning.text, 'think')
    const toolEnd = chunks.find((chunk) => chunk.type === 'block-end' && chunk.block.type === 'tool-call')
    assert.ok(toolEnd)
    assert.equal(toolEnd.block.name, 'read_file')
    assert.equal(toolEnd.block.arguments, '{"path":"a.txt"}')
    assert.deepEqual(chunks.at(-1), { type: 'finish', reason: { kind: 'tool-calls' } })
  } finally {
    await server.close()
  }
})

test('adapter: pre-first-token 429 fails over to the next account', async () => {
  resetSessionRouter()
  let call = 0
  const server = await startServer((_req, res) => {
    call += 1
    if (call === 1) {
      res.writeHead(429, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: { message: 'rate limit' } }))
      return
    }
    res.writeHead(200, { 'Content-Type': 'text/event-stream' })
    res.end(sse([
      { choices: [{ delta: { content: 'ok' } }] },
      { choices: [{ delta: {}, finish_reason: 'stop' }] },
      '[DONE]',
    ]))
  })

  try {
    const adapter = new ClineBotAdapter({
      ctx: credentialsCtx({
        CLINEBOT_API_KEY: 'key-a',
        CLINEBOT_API_KEY_2: 'key-b',
      }),
      live: () => configFor(server.baseUrl, {
        accounts: [{ label: 'Two', apiKeyEnv: 'CLINEBOT_API_KEY_2' }],
      }),
    })
    const chunks = await collect(adapter.stream({
      provider: 'clinebot',
      model: 'cline-pass/deepseek-v4.1-flash',
      messages: [{ role: 'user', content: [{ type: 'text', text: 'hi' }] }],
      sessionId: 'session-failover',
    }))

    const text = chunks.filter((chunk) => chunk.type === 'text-delta').map((chunk) => chunk.text).join('')
    assert.equal(text, 'ok')
    assert.equal(server.requests.length, 2)
    assert.equal(server.requests[0].headers.authorization, 'Bearer key-a')
    assert.equal(server.requests[1].headers.authorization, 'Bearer key-b')
    assert.deepEqual(chunks.at(-1), { type: 'finish', reason: { kind: 'stop' } })
  } finally {
    await server.close()
    resetSessionRouter()
  }
})
