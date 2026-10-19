import test from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import {
  LOCAL_PROXY_KEY_ENV,
  getLocalProxyToken,
  setLocalProxyToken,
  assertAuthorizedProxyRequest,
} from '../lib/proxy-token.js'
import { createChatCompletionsHandler, createModelsHandler } from '../lib/routes/proxy.js'

function createMockRes() {
  let status = 0
  let body = null
  const res = {
    writeHead: (s) => { status = s },
    end: (data) => {
      try { body = JSON.parse(data) } catch { body = data }
    },
    getStatus: () => status || res.statusCode,
    getBody: () => body,
  }
  return res
}

test('proxy-token (#247): getLocalProxyToken stores token in memory and never exports to process.env', () => {
  setLocalProxyToken(null)
  delete process.env[LOCAL_PROXY_KEY_ENV]

  const token = getLocalProxyToken()
  assert.ok(typeof token === 'string' && token.length >= 32)
  assert.equal(process.env[LOCAL_PROXY_KEY_ENV], undefined, 'process.env must not contain proxy token')

  // Calling again returns cached in-memory token
  const token2 = getLocalProxyToken()
  assert.equal(token2, token)
  assert.equal(process.env[LOCAL_PROXY_KEY_ENV], undefined)
})

test('proxy-token (#247): child processes do not inherit CLINEBOT_LOCAL_PROXY_TOKEN in env', () => {
  const token = getLocalProxyToken()
  assert.ok(token)
  assert.equal(process.env[LOCAL_PROXY_KEY_ENV], undefined)

  const childOutput = execFileSync(
    process.execPath,
    ['-e', 'console.log(process.env.CLINEBOT_LOCAL_PROXY_TOKEN || "CLEAN")'],
    { encoding: 'utf8' }
  ).trim()

  assert.equal(childOutput, 'CLEAN', 'child process must not see proxy token')
})

test('proxy-token (#247): assertAuthorizedProxyRequest rejects non-loopback requests with 403', async () => {
  const res = createMockRes()
  const req = {
    socket: { remoteAddress: '192.168.1.50' },
    headers: {},
  }
  const result = await assertAuthorizedProxyRequest({}, req, res, () => ({}))
  assert.equal(result.ok, false)
  assert.equal(res.getStatus(), 403)
  assert.deepEqual(res.getBody(), { ok: false, error: 'Loopback access only' })
})

test('proxy-token (#247): assertAuthorizedProxyRequest rejects browser origin with 403', async () => {
  const res = createMockRes()
  const req = {
    socket: { remoteAddress: '127.0.0.1' },
    headers: { origin: 'https://evil.site.com' },
  }
  const result = await assertAuthorizedProxyRequest({}, req, res, () => ({}))
  assert.equal(result.ok, false)
  assert.equal(res.getStatus(), 403)
  assert.deepEqual(res.getBody(), {
    ok: false,
    error: 'Cross-site or browser requests to proxy are forbidden',
  })
})

test('proxy-token (#247): assertAuthorizedProxyRequest enforces connection rejection 401', async () => {
  const res = createMockRes()
  const token = getLocalProxyToken()
  const req = {
    socket: { remoteAddress: '127.0.0.1' },
    headers: { authorization: `Bearer ${token}` },
  }
  const mockCtx = {
    connection: { requestRejection: () => 401 },
  }
  const result = await assertAuthorizedProxyRequest(mockCtx, req, res, () => ({}))
  assert.equal(result.ok, false)
  assert.equal(res.getStatus(), 401)
  assert.deepEqual(res.getBody(), { ok: false, error: 'Authentication required' })
})

test('proxy-token (#247): assertAuthorizedProxyRequest enforces connection rejection 403', async () => {
  const res = createMockRes()
  const token = getLocalProxyToken()
  const req = {
    socket: { remoteAddress: '127.0.0.1' },
    headers: { authorization: `Bearer ${token}` },
  }
  const mockCtx = {
    connection: { requestRejection: () => 403 },
  }
  const result = await assertAuthorizedProxyRequest(mockCtx, req, res, () => ({}))
  assert.equal(result.ok, false)
  assert.equal(res.getStatus(), 403)
  assert.deepEqual(res.getBody(), { ok: false, error: 'Forbidden' })
})

test('proxy-token (#247): assertAuthorizedProxyRequest rejects invalid bearer token with 401', async () => {
  const res = createMockRes()
  const req = {
    socket: { remoteAddress: '127.0.0.1' },
    headers: { authorization: 'Bearer wrong-secret' },
  }
  const result = await assertAuthorizedProxyRequest({}, req, res, () => ({}))
  assert.equal(result.ok, false)
  assert.equal(res.getStatus(), 401)
  assert.deepEqual(res.getBody(), { ok: false, error: 'Unauthorized: missing or invalid bearer token' })
})

test('proxy-token (#247): assertAuthorizedProxyRequest authorizes valid bearer token and returns pool', async () => {
  const res = createMockRes()
  const token = getLocalProxyToken()
  const req = {
    socket: { remoteAddress: '127.0.0.1' },
    headers: { authorization: `Bearer ${token}` },
  }
  const liveConfig = { accounts: [{ id: 'acc1', name: 'Main', apiKey: 'sk-test' }] }
  const result = await assertAuthorizedProxyRequest({}, req, res, () => liveConfig)
  assert.equal(result.ok, true)
  assert.ok(Array.isArray(result.pool))
})

test('proxy routes (#247): /v1/chat/completions and /v1/models reject when connection.requestRejection triggers', async () => {
  const token = getLocalProxyToken()
  const mockCtx = {
    connection: { requestRejection: () => 401 },
  }
  const live = () => ({ accounts: [] })

  const chatHandler = createChatCompletionsHandler(mockCtx, { live })
  const modelsHandler = createModelsHandler(mockCtx, { live })

  // POST /v1/chat/completions
  const resChat = createMockRes()
  const reqChat = {
    method: 'POST',
    socket: { remoteAddress: '127.0.0.1' },
    headers: { authorization: `Bearer ${token}` },
  }
  await chatHandler(reqChat, resChat)
  assert.equal(resChat.getStatus(), 401)
  assert.deepEqual(resChat.getBody(), { ok: false, error: 'Authentication required' })

  // GET /v1/models
  const resModels = createMockRes()
  const reqModels = {
    method: 'GET',
    socket: { remoteAddress: '127.0.0.1' },
    headers: { authorization: `Bearer ${token}` },
  }
  await modelsHandler(reqModels, resModels)
  assert.equal(resModels.getStatus(), 401)
  assert.deepEqual(resModels.getBody(), { ok: false, error: 'Authentication required' })
})
