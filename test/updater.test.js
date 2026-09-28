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

  // Prerelease comparisons (SemVer 2.0.0)
  assert.equal(isNewerVersion('0.3.10-beta.1', '0.3.10'), true)
  assert.equal(isNewerVersion('0.3.10', '0.3.10-beta.1'), false)
  assert.equal(isNewerVersion('0.3.10-alpha.1', '0.3.10-beta.1'), true)
  assert.equal(isNewerVersion('0.3.10-beta.1', '0.3.10-beta.2'), true)
  assert.equal(isNewerVersion('0.3.10-beta.2', '0.3.10-beta.1'), false)
  assert.equal(isNewerVersion('0.3.10-rc.1', '0.3.10-rc.2'), true)
  assert.equal(isNewerVersion('0.3.9', '0.3.10-alpha.1'), true)
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

import { isPidAlive, checkProfileLock } from '../lib/updater.js'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

test('updater: isPidAlive detects live and dead PIDs (#148)', () => {
  assert.equal(isPidAlive(process.pid), true)
  assert.equal(isPidAlive(99999999), false)
  assert.equal(isPidAlive(-1), false)
  assert.equal(isPidAlive(null), false)
})

test('updater: checkProfileLock detects active locks and cleans stale locks (#148)', () => {
  const tmpProfile = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-profile-lock-'))
  const lockFile = path.join(tmpProfile, 'package.json.lock')

  try {
    // 1. No lock
    assert.deepEqual(checkProfileLock(tmpProfile), { locked: false })

    // 2. Active lock with current PID
    fs.writeFileSync(lockFile, String(process.pid), 'utf8')
    const activeResult = checkProfileLock(tmpProfile)
    assert.equal(activeResult.locked, true)
    assert.equal(activeResult.pid, process.pid)
    assert.equal(activeResult.alive, true)

    // 3. Stale lock with dead PID
    const deadPid = 99999999
    fs.writeFileSync(lockFile, String(deadPid), 'utf8')
    const staleResult = checkProfileLock(tmpProfile)
    assert.equal(staleResult.locked, false)
    assert.equal(staleResult.stalePid, deadPid)
    assert.equal(fs.existsSync(lockFile), false, 'Stale lock file should be unlinked')
  } finally {
    fs.rmSync(tmpProfile, { recursive: true, force: true })
  }
})

test('updater: does not pass --config.minimumReleaseAge=0 to plugin add (#148)', () => {
  const updaterCode = fs.readFileSync(path.join(import.meta.dirname, '../lib/updater.js'), 'utf8')
  assert.equal(updaterCode.includes('minimumReleaseAge=0'), false, 'minimumReleaseAge=0 must be removed')
})
