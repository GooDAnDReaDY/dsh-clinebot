import test from 'node:test'
import assert from 'node:assert/strict'
import { isTrustedSettingsRequest, writeJson, readBody } from '../lib/http.js'
import { assertTrustedSettingsRequest } from '../lib/access.js'
import { Readable } from 'node:stream'

test('http: isTrustedSettingsRequest security rules', () => {
  // 1. Cross-site request must always be rejected
  assert.equal(isTrustedSettingsRequest({
    headers: {
      'sec-fetch-site': 'cross-site',
      host: '192.168.1.123:3000',
      origin: 'http://192.168.1.123:3000',
    },
  }), false)

  // 2. Same-origin matching Host header
  assert.equal(isTrustedSettingsRequest({
    headers: {
      'sec-fetch-site': 'same-origin',
      host: '192.168.1.123:3000',
      origin: 'http://192.168.1.123:3000',
    },
  }), true)

  // 3. Reverse proxy with X-Forwarded-Host
  assert.equal(isTrustedSettingsRequest({
    headers: {
      'sec-fetch-site': 'same-origin',
      'x-forwarded-host': 'dsh.internal.domain:8443',
      host: '127.0.0.1:3000',
      origin: 'https://dsh.internal.domain:8443',
    },
    socket: { remoteAddress: '127.0.0.1' },
  }), true)

  // 4. Mismatched origin (CSRF attempt)
  assert.equal(isTrustedSettingsRequest({
    headers: {
      host: '192.168.1.123:3000',
      origin: 'https://malicious-site.com',
    },
  }), false)

  // 5. Referer fallback matching host
  assert.equal(isTrustedSettingsRequest({
    headers: {
      host: '192.168.1.123:3000',
      referer: 'http://192.168.1.123:3000/settings',
    },
  }), true)

  // 6. Referer fallback mismatching host
  assert.equal(isTrustedSettingsRequest({
    headers: {
      host: '192.168.1.123:3000',
      referer: 'http://evil.com/page',
    },
  }), false)

  // 7. Local loopback request (CLI or curl)
  assert.equal(isTrustedSettingsRequest({
    headers: {},
    socket: { remoteAddress: '127.0.0.1' },
  }), true)

  assert.equal(isTrustedSettingsRequest({
    headers: {},
    socket: { remoteAddress: '::1' },
  }), true)

  // 8. Remote non-loopback without headers
  assert.equal(isTrustedSettingsRequest({
    headers: {},
    socket: { remoteAddress: '10.0.0.5' },
  }), false)

  // 9. Remote client must not spoof the browser-only Sec-Fetch-Site signal
  assert.equal(isTrustedSettingsRequest({
    headers: { 'sec-fetch-site': 'same-origin' },
    socket: { remoteAddress: '10.0.0.5' },
  }), false)

  // 10. Remote client must not spoof X-Forwarded-Host
  assert.equal(isTrustedSettingsRequest({
    headers: {
      'sec-fetch-site': 'same-origin',
      'x-forwarded-host': 'evil.example',
      origin: 'https://evil.example',
    },
    socket: { remoteAddress: '10.0.0.5' },
  }), false)
})

test('http: readBody reads stream data correctly', async () => {
  const stream = Readable.from([Buffer.from('hello '), Buffer.from('world')])
  const result = await readBody(stream)
  assert.equal(result.toString('utf8'), 'hello world')
})

test('http: readBody enforces maxBytes limit', async () => {
  const stream = Readable.from([Buffer.from('abcdefghij')])
  await assert.rejects(async () => {
    await readBody(stream, 5)
  }, /body too large/)
})

test('http: assertTrustedSettingsRequest enforces security and responds 403', () => {
  let statusCode = null
  let body = null
  const fakeRes = {
    writeHead(code) { statusCode = code },
    end(str) { body = str },
  }
  const untrustedReq = {
    headers: { 'sec-fetch-site': 'cross-site' },
    socket: { remoteAddress: '10.0.0.5' },
  }
  const trustedReq = {
    headers: { 'sec-fetch-site': 'same-origin' },
    socket: { remoteAddress: '127.0.0.1' },
  }

  assert.equal(assertTrustedSettingsRequest(untrustedReq, fakeRes), false)
  assert.equal(statusCode, 403)
  assert.match(body, /Forbidden/)

  assert.equal(assertTrustedSettingsRequest(trustedReq, fakeRes), true)

  const loopbackWrite = {
    method: 'POST',
    headers: {},
    socket: { remoteAddress: '127.0.0.1' },
  }
  assert.equal(assertTrustedSettingsRequest(loopbackWrite, fakeRes), false)
  assert.equal(statusCode, 403)
})


test('http (#222): connection.requestRejection authenticates settings requests', () => {
  let statusCode = null
  let body = null
  const createFakeRes = () => ({
    writeHead(code) { statusCode = code },
    end(str) { body = str },
  })

  const req = {
    headers: {
      'sec-fetch-site': 'same-origin',
      host: '192.168.1.123:3000',
      origin: 'http://192.168.1.123:3000',
    },
    socket: { remoteAddress: '192.168.1.50' },
  }

  // 1. connection service rejects with 401 (login required)
  const ctx401 = { connection: { requestRejection: () => 401 } }
  assert.equal(isTrustedSettingsRequest(req, ctx401), false)
  const res401 = createFakeRes()
  assert.equal(assertTrustedSettingsRequest(req, res401, ctx401), false)
  assert.equal(statusCode, 401)
  assert.deepEqual(JSON.parse(body), { ok: false, error: 'Authentication required' })

  // 2. connection service rejects with 403 (host fence violation)
  const ctx403 = { connection: { requestRejection: () => 403 } }
  assert.equal(isTrustedSettingsRequest(req, ctx403), false)
  const res403 = createFakeRes()
  assert.equal(assertTrustedSettingsRequest(req, res403, ctx403), false)
  assert.equal(statusCode, 403)
  assert.deepEqual(JSON.parse(body), { ok: false, error: 'Forbidden' })

  // 3. connection service throws (fails closed with 403)
  const ctxThrow = { connection: { requestRejection: () => { throw new Error('boom') } } }
  assert.equal(isTrustedSettingsRequest(req, ctxThrow), false)
  const resThrow = createFakeRes()
  assert.equal(assertTrustedSettingsRequest(req, resThrow, ctxThrow), false)
  assert.equal(statusCode, 403)

  // 4. connection service admits request (returns undefined)
  const ctxAdmit = { connection: { requestRejection: () => undefined } }
  assert.equal(isTrustedSettingsRequest(req, ctxAdmit), true)
  const resAdmit = createFakeRes()
  assert.equal(assertTrustedSettingsRequest(req, resAdmit, ctxAdmit), true)

  // 5. connection via request.connectionService
  const reqWithConn = {
    ...req,
    connectionService: { requestRejection: () => 401 },
  }
  const resReqConn = createFakeRes()
  assert.equal(assertTrustedSettingsRequest(reqWithConn, resReqConn), false)
  assert.equal(statusCode, 401)
})
