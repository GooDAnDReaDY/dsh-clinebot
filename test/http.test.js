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
})
