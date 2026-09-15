import test from 'node:test'
import assert from 'node:assert/strict'
import { isNewerVersion, isTrustedUpdateRequest, checkUpdateStatus } from '../lib/updater.js'

test('updater: isNewerVersion semantic version comparison', () => {
  // isNewerVersion(current, candidate)
  assert.equal(isNewerVersion('0.3.8', '0.3.9'), true)
  assert.equal(isNewerVersion('0.3.9', '0.4.0'), true)
  assert.equal(isNewerVersion('0.9.9', '1.0.0'), true)
  assert.equal(isNewerVersion('0.3.8', '0.3.8'), false)
  assert.equal(isNewerVersion('0.3.9', '0.3.8'), false)
  assert.equal(isNewerVersion('0.3.8', 'invalid'), false)
})

test('updater: isTrustedUpdateRequest security checks', () => {
  // Trusted loopback request
  const validReq = {
    socket: { remoteAddress: '127.0.0.1' },
    headers: {
      'x-dsh-plugin-update': '1',
      host: '127.0.0.1:3000',
      origin: 'http://127.0.0.1:3000',
      'sec-fetch-site': 'same-origin',
    },
  }
  assert.equal(isTrustedUpdateRequest(validReq), true)

  // Missing update header
  assert.equal(isTrustedUpdateRequest({ ...validReq, headers: { ...validReq.headers, 'x-dsh-plugin-update': '0' } }), false)

  // Non-loopback remote address
  assert.equal(isTrustedUpdateRequest({ ...validReq, socket: { remoteAddress: '8.8.8.8' } }), false)

  // External origin
  assert.equal(isTrustedUpdateRequest({
    ...validReq,
    headers: { ...validReq.headers, origin: 'https://evil.example.com' }
  }), false)
})

test('updater: checkUpdateStatus detects status with manifestUrl', async () => {
  const manifestUrl = new URL('../package.json', import.meta.url)
  const status = await checkUpdateStatus(
    { packageName: '@goodandready/dsh-clinebot', manifestUrl, registry: 'https://127.0.0.1:9999' },
    { profileName: 'test', profileDir: '/tmp/test' }
  )
  assert.equal(status.packageName, '@goodandready/dsh-clinebot')
  assert.ok(status.currentVersion)
  assert.equal(status.latestCheckFailed, true)
  assert.equal(status.updateAvailable, false)
})
