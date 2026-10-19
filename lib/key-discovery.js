import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import crypto from 'node:crypto'

const CLINE_KEY_REGEX = /cline_[A-Za-z0-9_\-]{16,}/g
const DISCOVERY_CACHE_TTL_MS = 15 * 60 * 1000 // 15 minutes TTL

// Server-side cache for discovered keys: id -> { id, key, source, maskedKey, path, expiresAt }
const discoveredKeysCache = new Map()

function cleanupExpired() {
  const now = Date.now()
  for (const [id, item] of discoveredKeysCache.entries()) {
    if (item.expiresAt && item.expiresAt <= now) {
      discoveredKeysCache.delete(id)
    }
  }
}

export function getDiscoveredKey(id) {
  if (!id || typeof id !== 'string') return null
  cleanupExpired()
  const item = discoveredKeysCache.get(id)
  return item?.key || null
}

export function consumeDiscoveredKey(id) {
  if (!id || typeof id !== 'string') return null
  cleanupExpired()
  const item = discoveredKeysCache.get(id)
  if (!item) return null
  discoveredKeysCache.delete(id)
  return item.key
}

export function clearDiscoveredKeysCache() {
  discoveredKeysCache.clear()
}

export function maskApiKey(key) {
  if (!key || typeof key !== 'string') return ''
  if (key.length <= 12) return '••••••••'
  return key.slice(0, 8) + '••••' + key.slice(-4)
}

function scanFileForKeys(filePath, sourceName) {
  const results = []
  try {
    if (!fs.existsSync(filePath)) return results
    const stat = fs.statSync(filePath)
    if (!stat.isFile() || stat.size > 5 * 1024 * 1024) return results
    const content = fs.readFileSync(filePath, 'utf8')
    const matches = content.match(CLINE_KEY_REGEX)
    if (matches) {
      for (const m of matches) {
        results.push({
          source: sourceName,
          key: m,
          maskedKey: maskApiKey(m),
          path: filePath,
        })
      }
    }
  } catch {
    // quiet on unreadable files
  }
  return results
}

export function discoverLocalClineKeys() {
  cleanupExpired()
  const discovered = []
  const seenKeys = new Set()

  const addKey = (item) => {
    if (!item?.key || seenKeys.has(item.key)) return
    seenKeys.add(item.key)

    // Reuse existing ID if already cached
    let existingId = null
    for (const [id, cached] of discoveredKeysCache.entries()) {
      if (cached.key === item.key) {
        existingId = id
        cached.expiresAt = Date.now() + DISCOVERY_CACHE_TTL_MS
        break
      }
    }

    const id = existingId || crypto.randomUUID()
    discoveredKeysCache.set(id, {
      id,
      key: item.key,
      source: item.source,
      maskedKey: item.maskedKey,
      path: item.path,
      expiresAt: Date.now() + DISCOVERY_CACHE_TTL_MS,
    })

    // Public view: NEVER expose the raw secret key (#246)
    discovered.push({
      id,
      source: item.source,
      maskedKey: item.maskedKey,
      path: item.path,
    })
  }

  // 1. Check environment variables
  for (const envName of ['CLINE_API_KEY', 'CLINEPASS_API_KEY']) {
    const val = process.env[envName]
    if (val && typeof val === 'string' && val.startsWith('cline_')) {
      addKey({
        source: `Environment (${envName})`,
        key: val,
        maskedKey: maskApiKey(val),
        path: `$${envName}`,
      })
    }
  }

  // 2. Candidate directories & file paths across OSes
  const home = os.homedir()
  const candidateFiles = [
    // CLI configs
    { path: path.join(home, '.cline', 'config.json'), source: 'Cline CLI' },
    { path: path.join(home, '.cline', 'data', 'settings.json'), source: 'Cline CLI Data' },
    { path: path.join(home, '.cline', 'settings.json'), source: 'Cline CLI Settings' },
    { path: path.join(home, '.config', 'cline', 'config.json'), source: 'Cline Config' },
    { path: path.join(home, '.cline.json'), source: 'Cline Dotfile' },

    // VS Code Extension Global Storage (Linux, macOS, Windows)
    { path: path.join(home, '.config', 'Code', 'User', 'globalStorage', 'saoudrizwan.claude-dev', 'settings', 'cline_custom_modes.json'), source: 'VS Code Extension' },
    { path: path.join(home, '.config', 'Code', 'User', 'globalStorage', 'saoudrizwan.claude-dev', 'state.vscdb'), source: 'VS Code Extension Storage' },
    { path: path.join(home, 'Library', 'Application Support', 'Code', 'User', 'globalStorage', 'saoudrizwan.claude-dev', 'settings', 'cline_custom_modes.json'), source: 'VS Code Extension (macOS)' },
    { path: path.join(home, 'AppData', 'Roaming', 'Code', 'User', 'globalStorage', 'saoudrizwan.claude-dev', 'settings', 'cline_custom_modes.json'), source: 'VS Code Extension (Windows)' },

    // Cursor Extension Global Storage
    { path: path.join(home, '.config', 'Cursor', 'User', 'globalStorage', 'saoudrizwan.claude-dev', 'settings', 'cline_custom_modes.json'), source: 'Cursor Extension' },
    { path: path.join(home, '.config', 'Cursor', 'User', 'globalStorage', 'saoudrizwan.claude-dev', 'state.vscdb'), source: 'Cursor Extension Storage' },
    { path: path.join(home, 'Library', 'Application Support', 'Cursor', 'User', 'globalStorage', 'saoudrizwan.claude-dev', 'settings', 'cline_custom_modes.json'), source: 'Cursor Extension (macOS)' },
    { path: path.join(home, 'AppData', 'Roaming', 'Cursor', 'User', 'globalStorage', 'saoudrizwan.claude-dev', 'settings', 'cline_custom_modes.json'), source: 'Cursor Extension (Windows)' },
  ]

  for (const candidate of candidateFiles) {
    const hits = scanFileForKeys(candidate.path, candidate.source)
    for (const h of hits) {
      addKey(h)
    }
  }

  // Also check if any file in ~/.cline/ contains cline_ keys
  const clineDir = path.join(home, '.cline')
  try {
    if (fs.existsSync(clineDir)) {
      const entries = fs.readdirSync(clineDir)
      for (const entry of entries) {
        const full = path.join(clineDir, entry)
        try {
          const st = fs.statSync(full)
          if (st.isFile()) {
            const hits = scanFileForKeys(full, 'Cline CLI (~/.cline)')
            for (const h of hits) addKey(h)
          }
        } catch {}
      }
    }
  } catch {}

  return discovered
}