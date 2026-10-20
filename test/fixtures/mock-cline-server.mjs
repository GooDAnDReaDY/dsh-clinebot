/**
 * Local ClinePass-compatible fixture for adapter integration tests.
 *
 * It serves the two surfaces the plugin touches: chat completions (SSE and
 * JSON) and the plan/usage endpoints used by auto-discovery and diagnostics.
 * Start it with `MOCK_CLINE_PORT=45999 node test/fixtures/mock-cline-server.mjs`.
 */

import http from 'node:http'

const port = Number(process.env.MOCK_CLINE_PORT || 45999)

function json(res, code, body) {
  res.writeHead(code, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify(body))
}

function readBody(req) {
  return new Promise((resolve) => {
    const chunks = []
    req.on('data', (chunk) => chunks.push(chunk))
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
  })
}

function sse(res, events) {
  res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' })
  for (const event of events) {
    res.write(`data: ${typeof event === 'string' ? event : JSON.stringify(event)}\n\n`)
  }
  res.end()
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || '/', `http://127.0.0.1:${port}`)
  console.log(`[mock-cline] ${req.method} ${url.pathname}`)

  if (req.method === 'HEAD' && url.pathname === '/') {
    res.writeHead(200)
    res.end()
    return
  }

  if (url.pathname === '/users/me') {
    json(res, 200, { data: { email: 'fixture@example.test' } })
    return
  }

  if (url.pathname === '/users/me/plan') {
    json(res, 200, {
      data: {
        plan: {
          displayName: 'ClinePass Fixture',
          status: 'active',
          features: { included: ['Includes DeepSeek V4.1 Flash'] },
        },
      },
    })
    return
  }

  if (url.pathname === '/users/me/plan/usage-limits') {
    const resetsAt = new Date(Date.now() + 3600_000).toISOString()
    json(res, 200, {
      data: {
        limits: [
          { type: '5-hour', percentUsed: 0.1, resetsAt },
          { type: 'weekly', percentUsed: 0.2, resetsAt },
        ],
      },
    })
    return
  }

  if (url.pathname === '/chat/completions' && req.method === 'POST') {
    const raw = await readBody(req)
    let body = {}
    try { body = JSON.parse(raw) } catch {}
    const streaming = body.stream !== false
    const answer = 'OK'
    const usage = {
      prompt_tokens: 12,
      completion_tokens: 2,
      total_tokens: 14,
      prompt_tokens_details: { cached_tokens: 4 },
    }

    if (!streaming) {
      json(res, 200, {
        id: 'chatcmpl-fixture',
        object: 'chat.completion',
        model: body.model || 'cline-pass/deepseek-v4.1-flash',
        choices: [{ index: 0, message: { role: 'assistant', content: answer }, finish_reason: 'stop' }],
        usage,
      })
      return
    }

    sse(res, [
      { id: 'chatcmpl-fixture', object: 'chat.completion.chunk', choices: [{ index: 0, delta: { role: 'assistant', content: answer } }] },
      { id: 'chatcmpl-fixture', object: 'chat.completion.chunk', choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] },
      { id: 'chatcmpl-fixture', object: 'chat.completion.chunk', choices: [], usage },
      '[DONE]',
    ])
    return
  }

  json(res, 404, { error: { message: `fixture has no route for ${url.pathname}` } })
})

server.listen(port, '127.0.0.1', () => {
  console.log(`[mock-cline] listening on http://127.0.0.1:${port}`)
})

for (const signal of ['SIGTERM', 'SIGINT']) {
  process.on(signal, () => server.close(() => process.exit(0)))
}
