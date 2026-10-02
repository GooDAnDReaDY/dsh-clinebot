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

import { isPidAlive, checkProfileLock, cleanStaleLock, installExact } from '../lib/updater.js'
import { EventEmitter } from 'node:events'
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


function createMockChild() {
  const child = new EventEmitter()
  child.stdout = new EventEmitter()
  child.stderr = new EventEmitter()
  child.signals = []
  child.killed = false
  child.exitCode = null
  child.signalCode = null
  child.kill = (sig) => {
    child.signals.push(sig)
    child.killed = true
  }
  return child
}

test('updater: installExact throws if cliEntry is undefined', async () => {
  await assert.rejects(
    () => installExact({ cliEntry: undefined }, 'pkg@1.0.0'),
    /Automatic update is unavailable/
  )
})

test('updater: installExact resolves when process exits with code 0', async () => {
  const child = createMockChild()
  const target = { cliEntry: '/bin/dsh', profileName: 'test', profileDir: '/tmp/test' }
  const promise = installExact(target, 'pkg@1.0.0', {
    spawn: () => child,
    timeoutMs: 1000,
  })
  child.emit('exit', 0, null)
  await promise
  assert.equal(child.signals.length, 0)
})

test('updater: installExact rejects when process exits with non-zero code', async () => {
  const child = createMockChild()
  const target = { cliEntry: '/bin/dsh', profileName: 'test', profileDir: '/tmp/test' }
  const promise = installExact(target, 'pkg@1.0.0', {
    spawn: () => child,
    timeoutMs: 1000,
  })
  child.stderr.emit('data', 'Installation failed: network error')
  child.emit('exit', 1, null)
  await assert.rejects(promise, /Installation failed: network error/)
})

test('updater: installExact timeout sends SIGTERM and waits for exit before rejecting (#172)', async () => {
  const child = createMockChild()
  const target = { cliEntry: '/bin/dsh', profileName: 'test', profileDir: '/tmp/test' }
  const promise = installExact(target, 'pkg@1.0.0', {
    timeoutMs: 20,
    sigtermGraceMs: 50,
    spawn: () => child,
  })
  await new Promise((r) => setTimeout(r, 30))
  assert.deepEqual(child.signals, ['SIGTERM'])

  let settled = false
  promise.catch(() => { settled = true })
  assert.equal(settled, false, 'Promise must not reject before child exits')

  child.exitCode = 0
  child.signalCode = 'SIGTERM'
  child.emit('exit', 0, 'SIGTERM')
  await assert.rejects(promise, /Update timed out\./)
  assert.equal(child.signals.includes('SIGKILL'), false, 'SIGKILL must not be sent if child exited on SIGTERM')
})

test('updater: installExact stubborn child ignoring SIGTERM gets escalated to SIGKILL (#172)', async () => {
  const child = createMockChild()
  const target = { cliEntry: '/bin/dsh', profileName: 'test', profileDir: '/tmp/test' }
  const promise = installExact(target, 'pkg@1.0.0', {
    timeoutMs: 20,
    sigtermGraceMs: 40,
    sigkillGraceMs: 50,
    spawn: () => child,
  })
  await new Promise((r) => setTimeout(r, 30))
  assert.deepEqual(child.signals, ['SIGTERM'])

  await new Promise((r) => setTimeout(r, 45))
  assert.deepEqual(child.signals, ['SIGTERM', 'SIGKILL'], 'Must escalate to SIGKILL when child ignores SIGTERM')

  let settled = false
  promise.catch(() => { settled = true })
  assert.equal(settled, false, 'Promise must not reject before child exits')

  child.exitCode = null
  child.signalCode = 'SIGKILL'
  child.emit('exit', null, 'SIGKILL')
  await assert.rejects(promise, /Update timed out\./)
})

test('updater: installExact spawns child with detached process group on POSIX (#172)', async () => {
  let capturedOptions = null
  const child = createMockChild()
  const target = { cliEntry: '/bin/dsh', profileName: 'test', profileDir: '/tmp/test' }
  const promise = installExact(target, 'pkg@1.0.0', {
    spawn: (...args) => {
      capturedOptions = args[2]
      return child
    },
  })
  child.emit('exit', 0, null)
  await promise
  if (process.platform !== 'win32') {
    assert.equal(capturedOptions?.detached, true)
  }
})

test('updater: installExact holds profile lock until child process exits (#172)', async () => {
  const tmpProfile = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-lock-test-'))
  const lockFile = path.join(tmpProfile, 'package.json.lock')
  const deadPid = 99999999
  fs.writeFileSync(lockFile, String(deadPid), 'utf8')

  try {
    const child = createMockChild()
    const target = { cliEntry: '/bin/dsh', profileName: 'test', profileDir: tmpProfile }
    const promise = installExact(target, 'pkg@1.0.0', {
      timeoutMs: 20,
      sigtermGraceMs: 50,
      spawn: () => child,
    })
    await new Promise((r) => setTimeout(r, 30))
    assert.equal(fs.existsSync(lockFile), true, 'Lock must be held while child has not exited')

    child.exitCode = 0
    child.emit('exit', 0, 'SIGTERM')
    await assert.rejects(promise, /Update timed out\./)
    assert.equal(fs.existsSync(lockFile), false, 'Lock must be cleaned after child exits')
  } finally {
    fs.rmSync(tmpProfile, { recursive: true, force: true })
  }
})


test('updater: process group escalation continues if descendants survive parent exit (#172)', async () => {
  const child = createMockChild()
  const mockPid = 54321
  child.pid = mockPid
  const signals = []
  child.kill = (sig) => { signals.push(sig); return true }

  const proc = typeof process !== 'undefined' ? process : (setTimeout.constructor('return process')());
  const originalKill = proc.kill
  let groupAlive = true
  proc.kill = (pid, sig) => {
    if (pid === -mockPid) {
      if (sig === 0) return groupAlive
      if (sig === 'SIGKILL') {
        signals.push('SIGKILL')
        groupAlive = false
      }
      return true
    }
    return originalKill.call(proc, pid, sig)
  }

  try {
    const target = { cliEntry: '/bin/dsh', profileName: 'test', profileDir: os.tmpdir() }
    let promiseSettled = false

    const promise = installExact(target, 'pkg@1.0.0', {
      timeoutMs: 20,
      sigtermGraceMs: 30,
      sigkillGraceMs: 30,
      spawn: () => child,
    }).catch((err) => {
      promiseSettled = true
      return err.message
    })

    // Wait for timeout to trigger SIGTERM
    await new Promise((r) => setTimeout(r, 25))
    assert.equal(signals.includes('SIGTERM'), true)

    // Parent exits on SIGTERM, but descendants in process group survive
    child.exitCode = 0
    child.signalCode = 'SIGTERM'
    child.emit('exit', 0, 'SIGTERM')

    // On baseline 7f2e30e, onProcessExit immediately settled and canceled sigtermTimer.
    // In fixed updater, promise must not settle immediately on parent exit while group survives.
    assert.equal(promiseSettled, false, 'Promise must not settle immediately on parent exit while group survives')

    // Wait for sigtermGraceMs escalation to trigger SIGKILL
    await new Promise((r) => setTimeout(r, 45))
    assert.equal(signals.includes('SIGKILL'), true)

    const outcome = await promise
    assert.equal(outcome, 'Update timed out.')
    assert.equal(promiseSettled, true)
  } finally {
    proc.kill = originalKill
  }
})
