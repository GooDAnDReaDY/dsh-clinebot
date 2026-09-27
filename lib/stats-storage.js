/**
 * Persistent JSON Token Analytics Storage (Issue #129)
 *
 * Persists token consumption and request telemetry to ~/.dsh/clinebot-stats.json.
 * Survives dsh-web service restarts and tracks historical consumption by day, month, model, and account.
 */

import { readFileSync, writeFileSync, renameSync, mkdirSync, existsSync } from 'node:fs'
import { homedir } from 'node:os'
import path from 'node:path'

let inMemoryStats = createEmptyStats()
let saveTimer = null
let activeStatsPath = ''

/**
 * Create a fresh, empty stats object.
 */
export function createEmptyStats() {
  return {
    version: 1,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    totals: {
      requests: 0,
      successful: 0,
      failed: 0,
      rateLimited429: 0,
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0
    },
    byDay: {},
    byMonth: {},
    byModel: {},
    byAccount: {}
  }
}

/**
 * Resolve '~' in paths to user's home directory.
 */
export function resolvePath(targetPath) {
  if (!targetPath) {
    return path.join(homedir(), '.dsh', 'clinebot-stats.json')
  }
  if (targetPath.startsWith('~/') || targetPath === '~') {
    return path.join(homedir(), targetPath.slice(1))
  }
  return path.resolve(targetPath)
}

/**
 * Load stats from disk.
 *
 * @param {string} [customPath]
 * @returns {Object} Loaded stats
 */
export function loadStats(customPath) {
  const filePath = resolvePath(customPath)
  activeStatsPath = filePath

  try {
    if (existsSync(filePath)) {
      const raw = readFileSync(filePath, 'utf8')
      const parsed = JSON.parse(raw)
      if (parsed && typeof parsed === 'object' && parsed.totals) {
        inMemoryStats = {
          ...createEmptyStats(),
          ...parsed,
          totals: { ...createEmptyStats().totals, ...parsed.totals },
          byDay: parsed.byDay || {},
          byMonth: parsed.byMonth || {},
          byModel: parsed.byModel || {},
          byAccount: parsed.byAccount || {}
        }
        return inMemoryStats
      }
    }
  } catch {
    // If reading fails or file is corrupted, fallback to clean stats
  }

  inMemoryStats = createEmptyStats()
  return inMemoryStats
}

/**
 * Synchronously write stats to disk using atomic rename.
 *
 * @param {string} [customPath]
 */
export function saveStatsSync(customPath) {
  const filePath = resolvePath(customPath || activeStatsPath)
  activeStatsPath = filePath

  try {
    const dir = path.dirname(filePath)
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true })
    }

    inMemoryStats.updatedAt = Date.now()
    const tempPath = `${filePath}.${Date.now()}.${Math.random().toString(36).slice(2, 8)}.tmp`
    const data = JSON.stringify(inMemoryStats, null, 2)

    writeFileSync(tempPath, data, 'utf8')
    renameSync(tempPath, filePath)
  } catch {
    // Best-effort disk persistence
  }
}

/**
 * Queue a debounced write to avoid disk thrashing during rapid streaming tokens.
 *
 * @param {string} [customPath]
 * @param {number} [debounceMs=500]
 */
function queueSaveStats(customPath, debounceMs = 500) {
  if (saveTimer) {
    clearTimeout(saveTimer)
  }
  saveTimer = setTimeout(() => {
    saveTimer = null
    saveStatsSync(customPath)
  }, debounceMs)
}

/**
 * Record a completion event with usage metrics.
 *
 * @param {Object} params
 * @param {string} [params.model]
 * @param {string} [params.accountId]
 * @param {number} [params.promptTokens=0]
 * @param {number} [params.completionTokens=0]
 * @param {number} [params.totalTokens=0]
 * @param {boolean} [params.isError=false]
 * @param {boolean} [params.is429=false]
 * @param {string} [params.statsPath]
 */
export function recordUsage({
  model = 'unknown',
  accountId = 'default',
  promptTokens = 0,
  completionTokens = 0,
  totalTokens = 0,
  isError = false,
  is429 = false,
  statsPath
} = {}) {
  const now = new Date()
  const dayKey = now.toISOString().slice(0, 10) // 'YYYY-MM-DD'
  const monthKey = dayKey.slice(0, 7) // 'YYYY-MM'

  const safePrompt = Math.max(0, Number(promptTokens) || 0)
  const safeComp = Math.max(0, Number(completionTokens) || 0)
  const safeTotal = Math.max(safePrompt + safeComp, Number(totalTokens) || 0)

  // Totals
  inMemoryStats.totals.requests += 1
  if (isError) {
    inMemoryStats.totals.failed += 1
  } else {
    inMemoryStats.totals.successful += 1
  }
  if (is429) {
    inMemoryStats.totals.rateLimited429 += 1
  }
  inMemoryStats.totals.promptTokens += safePrompt
  inMemoryStats.totals.completionTokens += safeComp
  inMemoryStats.totals.totalTokens += safeTotal

  // Helper to increment bucket
  function incrementBucket(container, key) {
    if (!container[key]) {
      container[key] = {
        requests: 0,
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0
      }
    }
    container[key].requests += 1
    container[key].promptTokens += safePrompt
    container[key].completionTokens += safeComp
    container[key].totalTokens += safeTotal
  }

  incrementBucket(inMemoryStats.byDay, dayKey)
  incrementBucket(inMemoryStats.byMonth, monthKey)
  incrementBucket(inMemoryStats.byModel, model)
  incrementBucket(inMemoryStats.byAccount, accountId)

  queueSaveStats(statsPath)
}

/**
 * Retrieve current statistics summary.
 *
 * @returns {Object}
 */
export function getStatsSummary() {
  return JSON.parse(JSON.stringify(inMemoryStats))
}

/**
 * Reset statistics to initial state and persist.
 *
 * @param {string} [customPath]
 */
export function resetStats(customPath) {
  inMemoryStats = createEmptyStats()
  saveStatsSync(customPath)
  return inMemoryStats
}
