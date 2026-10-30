import os from 'node:os'
import path from 'node:path'

export function dshHome() {
  return path.resolve(process.env.DSH_HOME || path.join(process.env.HOME || os.homedir(), '.dsh'))
}

export function isSafeDataPath(value) {
  const raw = String(value ?? '').trim()
  if (!raw) return true
  if (raw.includes('\0')) return false
  const resolved = raw === '~' || raw.startsWith('~/')
    ? path.resolve(process.env.HOME || os.homedir(), raw.slice(1))
    : path.resolve(raw)
  const home = dshHome()
  if (resolved === home || !resolved.startsWith(`${home}${path.sep}`)) return false
  const relative = path.relative(home, resolved).toLowerCase()
  const segments = relative.split(/[\\/]+/)
  const base = path.basename(resolved).toLowerCase()
  if (segments[0] === 'profiles' && !base.startsWith('clinebot-')) return false
  if (path.extname(base) !== '.json') return false
  return !['package.json', 'package-lock.json', 'tsconfig.json', 'settings.json', '.credentials.json'].includes(base)
}
