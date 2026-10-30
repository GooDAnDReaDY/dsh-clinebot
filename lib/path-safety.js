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
  return resolved === home || resolved.startsWith(`${home}${path.sep}`)
}
