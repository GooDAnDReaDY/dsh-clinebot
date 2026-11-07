import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

export function dshHome() {
  return path.resolve(process.env.DSH_HOME || path.join(process.env.HOME || os.homedir(), '.dsh'))
}

export function defaultStatsPath() {
  return path.join(dshHome(), 'clinebot-stats.json')
}

export function defaultEventLogPath() {
  return path.join(dshHome(), 'clinebot-events.json')
}

export function defaultPriceCatalogPath() {
  return path.join(dshHome(), 'clinebot-prices.json')
}

export function defaultModelsCachePath() {
  return path.join(dshHome(), 'clinebot-models-cache.json')
}

export function unwrapPathValue(target) {
  let guard = 0
  let current = target
  while (guard < 5 && current) {
    if (typeof current === 'function') {
      try { current = current() } catch { current = ''; break }
      guard += 1
    } else if (typeof current === 'object' && typeof current.get === 'function') {
      try { current = current.get() } catch { current = ''; break }
      guard += 1
    } else {
      break
    }
  }
  return typeof current === 'string' ? current : ''
}

export function resolveDataPath(targetPath, defaultName = '') {
  const unwrapped = unwrapPathValue(targetPath)
  const raw = String(unwrapped || '').trim()
  if (!raw) {
    return defaultName ? path.join(dshHome(), defaultName) : ''
  }
  if (raw === '~/.dsh') {
    return dshHome()
  }
  if (raw.startsWith('~/.dsh/') || raw.startsWith('~/.dsh\\') || raw.startsWith('~\\.dsh\\')) {
    return path.join(dshHome(), raw.slice(7))
  }
  if (raw === '~') {
    return process.env.HOME || os.homedir()
  }
  if (raw.startsWith('~/') || raw.startsWith('~\\')) {
    return path.join(process.env.HOME || os.homedir(), raw.slice(2))
  }
  return path.resolve(raw)
}

function realPath(target) {
  let current = target
  const missing = []
  while (!fs.existsSync(current)) {
    try {
      if (fs.lstatSync(current).isSymbolicLink()) return null
    } catch {
      /* path does not exist */
    }
    const parent = path.dirname(current)
    if (parent === current) break
    missing.unshift(path.basename(current))
    current = parent
  }
  try {
    return path.join(fs.realpathSync(current), ...missing)
  } catch {
    return null
  }
}

export function isSafeDataPath(value) {
  const unwrapped = unwrapPathValue(value)
  const raw = String(unwrapped ?? '').trim()
  if (!raw) return true
  if (raw.includes('\0')) return false
  const resolved = resolveDataPath(raw, '')
  const home = realPath(dshHome())
  const realResolved = realPath(resolved)
  if (!home || !realResolved) return false
  if (realResolved === home || !realResolved.startsWith(`${home}${path.sep}`)) return false
  const relative = path.relative(home, realResolved).toLowerCase()
  const segments = relative.split(/[\\/]+/)
  const base = path.basename(realResolved).toLowerCase()
  if (segments[0] === 'profiles' && !base.startsWith('clinebot-')) return false
  if (path.extname(base) !== '.json') return false
  return !['package.json', 'package-lock.json', 'tsconfig.json', 'settings.json', '.credentials.json'].includes(base)
}
