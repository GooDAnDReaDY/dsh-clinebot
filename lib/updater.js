import { getConnection, isLoopbackAddress, isLoopbackHostname } from './http.js'
import { dshHome } from './path-safety.js'
import { service } from './services.js'
/**
 * Host-side one-click updater for @goodandready/dsh-clinebot.
 * Conforms to the DSH authoring reference implementation.
 */

import { spawn } from 'node:child_process'
import { existsSync, readFileSync, realpathSync, unlinkSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { basename, dirname, isAbsolute, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const UPDATE_HEADER = 'x-dsh-plugin-update'
const UPDATE_TIMEOUT_MS = 10 * 60_000
const VERSION_CACHE_MS = 5 * 60_000
const SAFE_ENV_KEYS = new Set([
  'PATH', 'HOME', 'USERPROFILE', 'SystemRoot', 'windir', 'ComSpec', 'PATHEXT',
  'TEMP', 'TMP', 'TMPDIR', 'LANG', 'LC_ALL', 'LC_CTYPE', 'TERM', 'SHELL', 'PWD',
  'APPDATA', 'LOCALAPPDATA', 'PROGRAMDATA', 'PROGRAMFILES', 'PROGRAMFILES(X86)',
  'PROGRAMW6432', 'SYSTEMDRIVE', 'NUMBER_OF_PROCESSORS', 'OS',
  'PROCESSOR_ARCHITECTURE', 'PROCESSOR_IDENTIFIER', 'USER', 'USERNAME',
  'LOGNAME', 'HOSTNAME', 'DSH_HOME', 'DSH_PROFILE_DIR', 'NODE_EXTRA_CA_CERTS',
])
const SAFE_ENV_KEYS_LOWER = new Set([...SAFE_ENV_KEYS].map((key) => key.toLowerCase()))
const SAFE_NPM_ENV_RE = /^npm_config_(?:registry|proxy|https_proxy|strict_ssl|userconfig|globalconfig|cache|prefix)$/i
const NPM_URL_ENV_RE = /^npm_config_(?:registry|proxy|https_proxy)$/i
let latestCache = undefined

function sanitizeUrlCredentials(value) {
  try {
    const url = new URL(String(value))
    url.username = ''
    url.password = ''
    return url.toString()
  } catch {
    return ''
  }
}

export function sanitizeChildEnv(env = process.env) {
  const out = {}
  for (const [key, value] of Object.entries(env)) {
    if (!SAFE_ENV_KEYS_LOWER.has(key.toLowerCase()) && !SAFE_NPM_ENV_RE.test(key)) continue
    if (NPM_URL_ENV_RE.test(key)) {
      const clean = sanitizeUrlCredentials(value)
      if (clean) out[key] = clean
    } else {
      out[key] = value
    }
  }
  out.NO_COLOR = '1'
  return out
}

function header(request, name) {
  const value = request?.headers?.[name]
  return Array.isArray(value) ? value[0] : value
}

/** Hostname of a verbose Host header value, brackets included for IPv6. */
function hostnameOf(host) {
  try {
    return new URL(`http://${host}`).hostname
  } catch {
    return undefined
  }
}



export function isTrustedUpdateRequest(request, targetCtx = null) {
  if (header(request, UPDATE_HEADER) !== '1') return false
  const conn = getConnection(targetCtx) || request?.connectionService
  // DSH Desktop forwards same-origin fetches through the `dsh-app://app` scheme
  // and deletes Origin, Cookie and Sec-Fetch-Site before it re-attaches the
  // session cookie (resources/app.asar: lib/main.js forwardWebRequest). An update
  // request can therefore arrive with neither Origin nor Sec-Fetch-Site while the
  // host connection gate still admits it — the same case access.js already
  // handles with its hostAuthAccepted flag.
  const hostAuthAccepted = Boolean(conn && typeof conn.requestRejection === 'function')
  if (hostAuthAccepted) {
    let rejection
    try {
      rejection = conn.requestRejection(request)
    } catch {
      return false
    }
    if (rejection !== undefined) return false
  }
  if (!isLoopbackAddress(request?.socket?.remoteAddress)) return false
  const site = header(request, 'sec-fetch-site')
  if (site !== undefined && site !== 'same-origin') return false
  const origin = header(request, 'origin')
  const host = header(request, 'host')
  if (host === undefined) return false
  if (origin === undefined) {
    // Without an Origin, admission of the connection is the only same-origin
    // evidence left; require it rather than trusting the loopback socket alone.
    const hostname = hostnameOf(host)
    return hostAuthAccepted && hostname !== undefined && isLoopbackHostname(hostname)
  }
  try {
    const url = new URL(origin)
    return (url.protocol === 'http:' || url.protocol === 'https:')
      && isLoopbackHostname(url.hostname) && url.host === host
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

export function findDshCliEntry(value = process.argv[1]) {
  if (value === undefined || value === '') return undefined
  let entry
  try {
    entry = realpathSync(value.startsWith('file:') ? fileURLToPath(value) : resolve(process.cwd(), value))
  } catch {
    return undefined
  }
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
          && !isAbsolute(bin) && resolve(directory, bin) === entry) return entry
      } catch {
        /* continue */
      }
    }
    const parent = dirname(directory)
    if (parent === directory) return undefined
  }
}

export function detectRuntime() {
  const profileDir = resolve(process.env.DSH_PROFILE_DIR
    ?? resolve(dshHome(), 'profiles', 'web'))
  const selected = profileNameFromArgv(process.argv)
  const profileName = validProfileName(selected)
    ? selected
    : validProfileName(basename(profileDir)) ? basename(profileDir) : 'web'
  const cliEntry = findDshCliEntry()
  if (cliEntry !== undefined) return { profileName, profileDir, cliEntry }
  // DSH Desktop ships the harness inside app.asar and exposes the CLI through
  // its own shim (resources/runtime/cli/bin/dsh.cmd → .../dsh-desktop-host/lib/cli.js),
  // so there is no @deepseek-ai/dsh bin to walk up to.
  const cliLauncher = desktopCliLauncher()
  return cliLauncher === undefined ? { profileName, profileDir } : { profileName, profileDir, cliLauncher }
}

/** The desktop bundle's CLI entry, run with Electron in Node mode. */
export function desktopCliLauncher(execPath = process.execPath, resourcesPath = process.resourcesPath) {
  const roots = []
  if (typeof resourcesPath === 'string' && resourcesPath) roots.push(resolve(resourcesPath, 'app.asar'))
  roots.push(resolve(dirname(execPath), 'resources', 'app.asar'))
  roots.push(resolve(dirname(execPath), '..', 'Resources', 'app.asar'))
  for (const root of roots) {
    const candidate = resolve(root, 'dsh', 'node_modules', '@deepseek-ai', 'dsh-desktop-host', 'lib', 'cli.js')
    try {
      if (existsSync(candidate)) return candidate
    } catch {
      /* try the next bundle location */
    }
  }
  return undefined
}

/**
 * Profile name to hand the CLI. The directory the host is running from is
 * authoritative: desktop passes `web` in argv[2] for every profile.
 */
function effectiveProfileName(target) {
  const fromDir = target?.profileDir ? basename(target.profileDir) : ''
  if (validProfileName(fromDir)) return fromDir
  return validProfileName(target?.profileName) ? target.profileName : 'web'
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
    ...(latest === undefined || !parseSemver(latest) ? {} : { latestVersion: latest }),
    latestCheckFailed: latest === undefined,
    updateAvailable: latest !== undefined && isNewerVersion(current, latest),
    profileName: effectiveProfileName(target),
    canAutoUpdate: target.cliEntry !== undefined || target.cliLauncher !== undefined,
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

/**
 * The CLI invocation that installs one exact version, for the runtime at hand.
 * Both branches run the Electron binary: the desktop bundle keeps the harness
 * inside app.asar, and only ELECTRON_RUN_AS_NODE turns that binary into a Node
 * host (`dsh.cmd` does the same).
 */
function installCommand(target, packageSpec, options) {
  const args = [
    'plugin', '--profile', effectiveProfileName(target), 'add',
    packageSpec,
    `--registry=${options.registry || 'https://registry.npmjs.org/'}`,
  ]
  if (target.cliEntry !== undefined) {
    return { command: process.execPath, args: [target.cliEntry, ...args], env: {} }
  }
  return {
    command: process.execPath,
    args: ['--expose-internals', target.cliLauncher, ...args],
    env: { ELECTRON_RUN_AS_NODE: '1' },
  }
}

export async function installExact(target, packageSpec, options = {}) {
  if (target.cliEntry === undefined && target.cliLauncher === undefined) {
    throw new Error('Automatic update is unavailable in this runtime.')
  }
  const timeoutMs = typeof options.timeoutMs === 'number' ? options.timeoutMs : UPDATE_TIMEOUT_MS
  const sigtermGraceMs = typeof options.sigtermGraceMs === 'number' ? options.sigtermGraceMs : 500
  const sigkillGraceMs = typeof options.sigkillGraceMs === 'number' ? options.sigkillGraceMs : 500
  const spawnFn = typeof options.spawn === 'function' ? options.spawn : spawn
  const launch = installCommand(target, packageSpec, options)

  await new Promise((resolvePromise, reject) => {
    const child = spawnFn(launch.command, launch.args, {
      cwd: target.profileDir,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...sanitizeChildEnv(), ...launch.env },
      detached: options.detached !== undefined ? options.detached : process.platform !== 'win32',
    })
    let detail = ''
    child.stdout?.on('data', (chunk) => { detail = (detail + String(chunk)).slice(-4000) })
    child.stderr?.on('data', (chunk) => { detail = (detail + String(chunk)).slice(-4000) })

    let exited = false
    let isTimedOut = false
    let sigtermTimer = null
    let sigkillTimer = null

    function isProcessGroupAlive(pid) {
      if (typeof pid !== 'number' || pid <= 0 || process.platform === 'win32') return false
      try {
        process.kill(-pid, 0)
        return true
      } catch {
        return false
      }
    }

    function cleanupTimers() {
      clearTimeout(mainTimer)
      if (sigtermTimer) clearTimeout(sigtermTimer)
      if (sigkillTimer) clearTimeout(sigkillTimer)
    }

    function onProcessExit(code, signal) {
      if (exited) return

      if (isTimedOut) {
        if (isProcessGroupAlive(child.pid)) {
          // Parent exited, but descendants in process group are still alive;
          // keep escalation timer active (#172)
          clearTimeout(mainTimer)
          return
        }
        exited = true
        cleanupTimers()
        cleanStaleLock(target.profileDir)
        reject(new Error('Update timed out.'))
      } else {
        exited = true
        cleanupTimers()
        if (code === 0) {
          resolvePromise()
        } else {
          reject(new Error(detail.trim() || `Update exited with code ${String(code)}.`))
        }
      }
    }

    child.once('error', (error) => {
      cleanupTimers()
      reject(error)
    })

    child.once('exit', onProcessExit)
    child.once('close', onProcessExit)

    function killProcessTree(sig) {
      if (!child) return
      if (typeof child.pid === 'number' && child.pid > 0 && process.platform !== 'win32') {
        try {
          process.kill(-child.pid, sig)
        } catch {
          /* process group might not exist or already terminated */
        }
      }
      try {
        child.kill(sig)
      } catch {
        /* ignore if already dead */
      }
    }

    const mainTimer = setTimeout(() => {
      isTimedOut = true
      // Step 1: Send SIGTERM
      killProcessTree('SIGTERM')

      // Step 2: Wait for grace period, if process has not exited escalate to SIGKILL (#172)
      sigtermTimer = setTimeout(() => {
        const groupAlive = isProcessGroupAlive(child.pid)
        const parentExited = (child.exitCode !== null && child.exitCode !== undefined) || (child.signalCode !== null && child.signalCode !== undefined)
        if (!parentExited || groupAlive) {
          killProcessTree('SIGKILL')

          // Step 3: Hard deadline for exit notification
          sigkillTimer = setTimeout(() => {
            if (!exited) {
              exited = true
              cleanupTimers()
              cleanStaleLock(target.profileDir)
              reject(new Error('Update timed out.'))
            }
          }, Math.min(sigkillGraceMs, 50))
        } else if (!exited) {
          exited = true
          cleanupTimers()
          cleanStaleLock(target.profileDir)
          reject(new Error('Update timed out.'))
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
  const ws = service(ctx, 'webServer')
  if (!ws?.register) return () => {}
  let installing = false
  return ws.register({
    kind: 'exact',
    path: options.endpoint,
    handler: async (request, response) => {
      try {
        const target = detectRuntime()
        if (request.method === 'GET' || request.method === 'HEAD') {
          // Status exposes the installed version and the profile layout, so a
          // remote peer must not read it (#336).
          if (!isLoopbackAddress(request?.socket?.remoteAddress)) {
            writeResponseJson(response, 403, { ok: false, error: 'Rejected non-local update status request.' })
            return
          }
          const payload = await checkUpdateStatus(options, target)
          writeResponseJson(response, 200, payload)
          return
        }
        if (request.method !== 'POST') {
          response.writeHead(405, { allow: 'GET, HEAD, POST' })
          response.end()
          return
        }
        if (!isTrustedUpdateRequest(request, ctx)) {
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
