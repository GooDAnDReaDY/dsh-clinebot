/**
 * Host-side one-click updater for @goodandready/dsh-clinebot.
 * Conforms to the DSH authoring reference implementation.
 */

import { spawn } from 'node:child_process'
import { existsSync, readFileSync, unlinkSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { basename, dirname, isAbsolute, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const UPDATE_HEADER = 'x-dsh-plugin-update'
const UPDATE_TIMEOUT_MS = 10 * 60_000
const VERSION_CACHE_MS = 5 * 60_000
let latestCache = undefined

function header(request, name) {
  const value = request?.headers?.[name]
  return Array.isArray(value) ? value[0] : value
}

function isLoopback(value) {
  const address = value?.toLowerCase().replace(/^\[|\]$/g, '')
  return address === 'localhost' || address === 'localhost.' || address === '::1'
    || address?.startsWith('127.') === true
    || address?.startsWith('::ffff:127.') === true
}

export function isTrustedUpdateRequest(request) {
  if (header(request, UPDATE_HEADER) !== '1') return false
  if (!isLoopback(request?.socket?.remoteAddress)) return false
  const site = header(request, 'sec-fetch-site')
  if (site !== undefined && site !== 'same-origin') return false
  const origin = header(request, 'origin')
  const host = header(request, 'host')
  if (origin === undefined || host === undefined) return false
  try {
    const url = new URL(origin)
    return (url.protocol === 'http:' || url.protocol === 'https:')
      && isLoopback(url.hostname) && url.host === host
  } catch {
    return false
  }
}

function validProfileName(value) {
  return typeof value === 'string' && value !== '' && value !== '.' && value !== '..'
    && !value.includes('/') && !value.includes('\\') && !/[\0-\x1f\x7f]/.test(value)
}

function profileNameFromArgv(argv) {
  if (!Array.isArray(argv)) return undefined
  for (let index = 2; index < argv.length; index += 1) {
    if (argv[index] === '--profile') return argv[index + 1]
    if (argv[index]?.startsWith('--profile=')) return argv[index].slice('--profile='.length)
  }
  return argv[2] === 'web' ? 'web' : undefined
}

function findDshCliEntry() {
  const value = process.argv[1]
  if (value === undefined || value === '') return undefined
  const entry = value.startsWith('file:') ? fileURLToPath(value) : resolve(process.cwd(), value)
  if (!existsSync(entry)) return undefined
  for (let directory = dirname(entry); ; directory = dirname(directory)) {
    const manifestPath = resolve(directory, 'package.json')
    if (existsSync(manifestPath)) {
      try {
        const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
        const bin = typeof manifest.bin === 'string'
          ? manifest.bin
          : typeof manifest.bin === 'object' && manifest.bin !== null
            ? manifest.bin.dsh
            : undefined
        if (manifest.name === '@deepseek-ai/dsh' && typeof bin === 'string'
          && !isAbsolute(bin) && resolve(directory, bin) === resolve(entry)) return entry
      } catch {
        /* continue */
      }
    }
    const parent = dirname(directory)
    if (parent === directory) return undefined
  }
}

function detectRuntime() {
  const profileDir = resolve(process.env.DSH_PROFILE_DIR
    ?? resolve(homedir(), '.dsh', 'profiles', 'web'))
  const selected = profileNameFromArgv(process.argv)
  const profileName = validProfileName(selected)
    ? selected
    : validProfileName(basename(profileDir)) ? basename(profileDir) : 'web'
  const cliEntry = findDshCliEntry()
  return cliEntry === undefined ? { profileName, profileDir } : { profileName, profileDir, cliEntry }
}

function parseSemver(value) {
  const match = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/.exec(String(value || ''))
  if (match === null) return undefined
  return {
    core: [Number(match[1]), Number(match[2]), Number(match[3])],
    prerelease: match[4]?.split('.') ?? [],
  }
}

function comparePrerelease(candidateParts, currentParts) {
  // A normal version with no pre-release tag is newer than a pre-release version
  if (candidateParts.length === 0 && currentParts.length > 0) return 1
  if (candidateParts.length > 0 && currentParts.length === 0) return -1
  if (candidateParts.length === 0 && currentParts.length === 0) return 0

  const len = Math.max(candidateParts.length, currentParts.length)
  for (let i = 0; i < len; i += 1) {
    const a = candidateParts[i]
    const b = currentParts[i]
    if (a === undefined) return -1
    if (b === undefined) return 1
    if (a === b) continue

    const aNum = /^\d+$/.test(a) ? Number(a) : undefined
    const bNum = /^\d+$/.test(b) ? Number(b) : undefined

    if (aNum !== undefined && bNum !== undefined) {
      return aNum > bNum ? 1 : -1
    }
    if (aNum !== undefined && bNum === undefined) {
      return -1
    }
    if (aNum === undefined && bNum !== undefined) {
      return 1
    }
    return a.localeCompare(b) > 0 ? 1 : -1
  }
  return 0
}

export function isNewerVersion(currentValue, candidateValue) {
  const current = parseSemver(currentValue)
  const candidate = parseSemver(candidateValue)
  if (current === undefined || candidate === undefined) return false
  for (let index = 0; index < 3; index += 1) {
    if (candidate.core[index] !== current.core[index]) return candidate.core[index] > current.core[index]
  }
  return comparePrerelease(candidate.prerelease, current.prerelease) > 0
}

async function fetchLatestVersion(packageName, registry) {
  if (latestCache?.packageName === packageName && latestCache.registry === registry && Date.now() < latestCache.expiresAt) {
    return latestCache.version
  }
  try {
    const reg = registry.replace(/\/+$/, '')
    const response = await fetch(`${reg}/${encodeURIComponent(packageName)}/latest`, {
      signal: AbortSignal.timeout(6000),
    })
    if (!response.ok) return undefined
    const value = await response.json()
    if (typeof value?.version !== 'string' || !value.version) return undefined
    latestCache = { packageName, registry, version: value.version, expiresAt: Date.now() + VERSION_CACHE_MS }
    return value.version
  } catch {
    return undefined
  }
}

async function readCurrentVersion(manifestUrl) {
  const value = JSON.parse(await readFile(manifestUrl, 'utf8'))
  if (typeof value?.version !== 'string' || !value.version) throw new Error('Cannot read current plugin version.')
  return value.version
}

export function isPidAlive(pid) {
  if (!pid || typeof pid !== 'number' || pid <= 0) return false
  try {
    process.kill(pid, 0)
    return true
  } catch (err) {
    return err.code === 'EPERM'
  }
}

export function checkProfileLock(profileDir) {
  if (!profileDir) return { locked: false }
  const lockFile = resolve(profileDir, 'package.json.lock')
  if (!existsSync(lockFile)) return { locked: false }
  try {
    const content = readFileSync(lockFile, 'utf8')
    const pid = parseInt(content.trim(), 10)
    if (!Number.isNaN(pid) && pid > 0) {
      if (isPidAlive(pid)) {
        return { locked: true, pid, alive: true }
      } else {
        try {
          unlinkSync(lockFile)
        } catch (err) {
          /* best-effort cleanup of stale lock */
        }
        return { locked: false, stalePid: pid }
      }
    }
  } catch {
    /* lock cannot be read */
  }
  return { locked: false }
}

export async function checkUpdateStatus(options, target = detectRuntime()) {
  const current = await readCurrentVersion(options.manifestUrl)
  const latest = await fetchLatestVersion(options.packageName, options.registry || 'https://registry.npmjs.org')
  return {
    packageName: options.packageName,
    currentVersion: current,
    ...(latest === undefined ? {} : { latestVersion: latest }),
    latestCheckFailed: latest === undefined,
    updateAvailable: latest !== undefined && isNewerVersion(current, latest),
    profileName: target.profileName,
    canAutoUpdate: target.cliEntry !== undefined,
  }
}

export function cleanStaleLock(profileDir) {
  if (!profileDir) return false
  const lockFile = resolve(profileDir, 'package.json.lock')
  if (existsSync(lockFile)) {
    try {
      const pid = parseInt(readFileSync(lockFile, 'utf8').trim(), 10)
      if (!isPidAlive(pid)) {
        unlinkSync(lockFile)
        return true
      }
    } catch (err) {
      /* best-effort stale lock unlink */
    }
  }
  return false
}

export async function installExact(target, packageSpec, options = {}) {
  if (target.cliEntry === undefined) throw new Error('Automatic update is unavailable in this runtime.')
  const timeoutMs = typeof options.timeoutMs === 'number' ? options.timeoutMs : UPDATE_TIMEOUT_MS
  const sigtermGraceMs = typeof options.sigtermGraceMs === 'number' ? options.sigtermGraceMs : 500
  const sigkillGraceMs = typeof options.sigkillGraceMs === 'number' ? options.sigkillGraceMs : 500
  const spawnFn = typeof options.spawn === 'function' ? options.spawn : spawn

  await new Promise((resolvePromise, reject) => {
    const child = spawnFn(process.execPath, [
      target.cliEntry, 'plugin', '--profile', target.profileName, 'add',
      packageSpec,
      `--registry=${options.registry || 'https://registry.npmjs.org/'}`,
    ], {
      cwd: target.profileDir,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, NO_COLOR: '1' },
    })
    let detail = ''
    child.stdout?.on('data', (chunk) => { detail = (detail + String(chunk)).slice(-4000) })
    child.stderr?.on('data', (chunk) => { detail = (detail + String(chunk)).slice(-4000) })

    let exited = false
    let isTimedOut = false
    let sigtermTimer = null
    let sigkillTimer = null

    function cleanupTimers() {
      clearTimeout(mainTimer)
      if (sigtermTimer) clearTimeout(sigtermTimer)
      if (sigkillTimer) clearTimeout(sigkillTimer)
    }

    function onProcessExit(code, signal) {
      if (exited) return
      exited = true
      cleanupTimers()

      if (isTimedOut) {
        cleanStaleLock(target.profileDir)
        reject(new Error('Update timed out.'))
      } else if (code === 0) {
        resolvePromise()
      } else {
        reject(new Error(detail.trim() || `Update exited with code ${String(code)}.`))
      }
    }

    child.once('error', (error) => {
      cleanupTimers()
      reject(error)
    })

    child.once('exit', onProcessExit)
    child.once('close', onProcessExit)

    const mainTimer = setTimeout(() => {
      isTimedOut = true
      // Step 1: Send SIGTERM
      try {
        child.kill('SIGTERM')
      } catch (err) {
        /* ignore if process already terminated */
      }

      // Step 2: Wait for grace period, if process has not exited escalate to SIGKILL (#172)
      sigtermTimer = setTimeout(() => {
        const hasExited = exited || (child.exitCode !== null && child.exitCode !== undefined) || (child.signalCode !== null && child.signalCode !== undefined)
        if (!hasExited) {
          try {
            child.kill('SIGKILL')
          } catch (err) {
            /* ignore if process already terminated */
          }

          // Step 3: Hard deadline for exit notification
          sigkillTimer = setTimeout(() => {
            if (!exited) {
              exited = true
              cleanStaleLock(target.profileDir)
              reject(new Error('Update timed out.'))
            }
          }, sigkillGraceMs)
        }
      }, sigtermGraceMs)
    }, timeoutMs)
  })
}

function writeResponseJson(response, statusCode, value) {
  response.writeHead(statusCode, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  })
  response.end(JSON.stringify(value))
}

export function registerPluginUpdater(ctx, options) {
  if (!ctx?.webServer?.register) return () => {}
  let installing = false
  return ctx.webServer.register({
    kind: 'exact',
    path: options.endpoint,
    handler: async (request, response) => {
      try {
        const target = detectRuntime()
        if (request.method === 'GET' || request.method === 'HEAD') {
          const payload = await checkUpdateStatus(options, target)
          writeResponseJson(response, 200, payload)
          return
        }
        if (request.method !== 'POST') {
          response.writeHead(405, { allow: 'GET, HEAD, POST' })
          response.end()
          return
        }
        if (!isTrustedUpdateRequest(request)) {
          writeResponseJson(response, 403, { ok: false, error: 'Rejected non-local or cross-origin update request.' })
          return
        }
        if (installing) {
          writeResponseJson(response, 409, { ok: false, error: 'This plugin is already updating.' })
          return
        }
        const lockInfo = checkProfileLock(target.profileDir)
        if (lockInfo.locked && lockInfo.alive) {
          writeResponseJson(response, 409, {
            ok: false,
            error: `Another package installation is currently in progress (PID: ${lockInfo.pid}).`,
            pid: lockInfo.pid
          })
          return
        }
        installing = true
        try {
          const before = await checkUpdateStatus(options, target)
          if (before.latestVersion === undefined) {
            writeResponseJson(response, 503, { ok: false, error: 'The latest version is temporarily unavailable.' })
            return
          }
          if (!before.updateAvailable) {
            writeResponseJson(response, 200, before)
            return
          }
          await installExact(target, `${options.packageName}@${before.latestVersion}`, options)
          writeResponseJson(response, 200, {
            ...before,
            updatedVersion: before.latestVersion,
            restartRequired: true,
          })
        } finally {
          installing = false
        }
      } catch (error) {
        writeResponseJson(response, 500, { ok: false, error: String(error?.message || error) })
      }
    },
  })
}
