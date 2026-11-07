import fs from 'node:fs/promises'
import path from 'node:path'
import { migrateModelEntry } from './models.js'

/**
 * Disk caching for discovered models.
 */
export async function saveModelsDiskCache(cachePath, models = [], planSyncedAt = Date.now(), options = {}) {
  if (!cachePath || !Array.isArray(models)) return false
  try {
    const dir = path.dirname(cachePath)
    await fs.mkdir(dir, { recursive: true })
    const payload = JSON.stringify({
      savedAt: Date.now(),
      planSyncedAt,
      endpoint: options.endpoint || options.baseUrl || '',
      accountRef: options.accountRef || options.accountId || options.apiKeyEnv || '',
      models,
    }, null, 2)
    await fs.writeFile(cachePath, payload, 'utf8')
    return true
  } catch {
    return false
  }
}

export async function loadModelsDiskCache(cachePath, options = {}) {
  if (!cachePath) return null
  try {
    const raw = await fs.readFile(cachePath, 'utf8')
    const parsed = JSON.parse(raw)
    const rawList = Array.isArray(parsed?.models) ? parsed.models : (Array.isArray(parsed) ? parsed : null)
    if (!rawList) return null

    const expectedEndpoint = options.endpoint || options.baseUrl
    const expectedAccount = options.accountRef || options.accountId || options.apiKeyEnv
    if (expectedEndpoint && parsed?.endpoint && parsed.endpoint !== expectedEndpoint) {
      return null
    }
    if (expectedAccount && parsed?.accountRef && parsed.accountRef !== expectedAccount) {
      return null
    }
    if ((expectedEndpoint || expectedAccount) && (!parsed?.endpoint || !parsed?.accountRef)) {
      return null
    }

    let hasObsolete = false
    const list = rawList.map((m) => {
      const migrated = migrateModelEntry(m)
      if (migrated.id !== m.id) hasObsolete = true
      return migrated
    })
    list.planSyncedAt = typeof parsed?.planSyncedAt === 'number' ? parsed.planSyncedAt : (typeof parsed?.savedAt === 'number' ? parsed.savedAt : 0)
    list.endpoint = parsed?.endpoint
    list.accountRef = parsed?.accountRef
    if (hasObsolete) {
      saveModelsDiskCache(cachePath, list, list.planSyncedAt, options).catch(() => {})
    }
    return list
  } catch {
    return null
  }
}
