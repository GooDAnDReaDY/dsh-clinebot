import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

export function dshHome() {
  return path.resolve(process.env.DSH_HOME || path.join(process.env.HOME || os.homedir(), '.dsh'))
}

function realPath(target) {
  let current = target
  const missing = []
  while (!fs.existsSync(current)) {
    const parent = path.dirname(current)
    if (parent === current) break
    missing.unshift(path.basename(current))
    current = parent
  }
  try {
    return path.join(fs.realpathSync(current), ...missing)
  } catch {
    return target
  }
}

export function isSafeDataPath(value) {
  const raw = String(value ?? '').trim()
  if (!raw) return true
  if (raw.includes('\0')) return false
  const resolved = raw === '~' || raw.startsWith('~/')
    ? path.resolve(process.env.HOME || os.homedir(), raw.slice(1))
    : path.resolve(raw)
  const home = realPath(dshHome())
  const realResolved = realPath(resolved)
  if (realResolved === home || !realResolved.startsWith(`${home}${path.sep}`)) return false
  const relative = path.relative(home, realResolved).toLowerCase()
  const segments = relative.split(/[\\/]+/)
  const base = path.basename(realResolved).toLowerCase()
  if (segments[0] === 'profiles' && !base.startsWith('clinebot-')) return false
  if (path.extname(base) !== '.json') return false
  return !['package.json', 'package-lock.json', 'tsconfig.json', 'settings.json', '.credentials.json'].includes(base)
}
