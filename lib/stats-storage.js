/**
 * Persistent JSON telemetry storage.
 *
 * Version 2 adds cache buckets, estimated cost, TTFT/latency sums and a bounded
 * per-session dimension. Version 1 files are upgraded on read.
 */

import { readFileSync, writeFileSync, renameSync, mkdirSync, existsSync, copyFileSync, readdirSync, unlinkSync } from 'node:fs'
import { homedir } from 'node:os'
import path from 'node:path'
import {
  latencyBucketIndex,
  mergeHistogram,
  percentileFromHistogram,
  pruneRetentionOnStats,
} from './stats-metrics.js'

const MAX_SESSIONS = 500
const SESSION_TTL_MS = 90 * 24 * 60 * 60 * 1000
const HEATMAP_RETENTION_MS = 95 * 24 * 60 * 60 * 1000

let inMemoryStats = createEmptyStats()
let saveTimer = null
let activeStatsPath = ''
let statsRetentionDays = 95

export function setStatsRetentionDays(days) {
  statsRetentionDays = Math.max(0, Math.min(3650, Number(days) || 0))
  pruneRetentionOnStats(inMemoryStats, statsRetentionDays)
  return statsRetentionDays
}

export function getStatsRetentionDays() {
  return statsRetentionDays
}

function emptyBucket() {
  return {
    requests: 0,
    successful: 0,
    failed: 0,
    rateLimited429: 0,
    promptTokens: 0,
    completionTokens: 0,
    reasoningTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    totalTokens: 0,
    costUsd: 0,
    pricedRequests: 0,
    unpricedRequests: 0,
    ttftMsSum: 0,
    latencyMsSum: 0,
    firstAt: 0,
    lastAt: 0,
    model: '',
    accountId: '',
    purpose: '',
  }
}

/**
 * Create a fresh, empty stats object.
 */
export function createEmptyStats() {
  return {
    version: 2,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    totals: emptyBucket(),
    byDay: {},
    byMonth: {},
    byModel: {},
    byAccount: {},
    bySession: {},
    byHour: {},
    byHourModel: {},
  }
}

/** Local `YYYY-MM-DD` key, used by the request heatmap. */
function localDateKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

/** Get active .dsh directory, respecting DSH_HOME and HOME. */
function getDshHome() {
  if (process.env.DSH_HOME) return process.env.DSH_HOME
  const home = process.env.HOME || homedir()
  return path.join(home, '.dsh')
}

export function resolvePath(targetPath) {
  let unwrapGuard = 0
  while (unwrapGuard < 5 && targetPath) {
    if (typeof targetPath === 'function') {
      try { targetPath = targetPath() } catch { targetPath = ''; break }
      unwrapGuard += 1
    } else if (typeof targetPath === 'object' && typeof targetPath.get === 'function') {
      try { targetPath = targetPath.get() } catch { targetPath = ''; break }
      unwrapGuard += 1
    } else {
      break
    }
  }
  if (typeof targetPath !== 'string') targetPath = ''
  if (!targetPath) return path.join(getDshHome(), 'clinebot-stats.json')
  if (targetPath.startsWith('~/') || targetPath === '~') {
    const home = process.env.HOME || homedir()
    return path.join(home, targetPath.slice(1))
  }
  return path.resolve(targetPath)
}

/**
 * Load stats from disk.
 * @param {string} [customPath]
 */
export function loadStats(customPath) {
  const filePath = resolvePath(customPath)
  activeStatsPath = filePath
  try {
    if (existsSync(filePath)) {
      const raw = readFileSync(filePath, 'utf8')
      const parsed = JSON.parse(raw)
      if (parsed && typeof parsed === 'object' && parsed.totals) {
        const empty = createEmptyStats()
        inMemoryStats = {
          ...empty,
          ...parsed,
          version: 2,
          totals: { ...empty.totals, ...parsed.totals },
          byDay: parsed.byDay || {},
          byMonth: parsed.byMonth || {},
          byModel: parsed.byModel || {},
          byAccount: parsed.byAccount || {},
          bySession: parsed.bySession || {},
          byHour: parsed.byHour || {},
          byHourModel: parsed.byHourModel || {},
        }
        backfillHourlyFromSessions()
        pruneRetentionOnStats(inMemoryStats, statsRetentionDays)
        return inMemoryStats
      }
    }
  } catch {
    try {
      if (existsSync(filePath)) {
        const corruptBackup = `${filePath}.corrupt.${Date.now()}`
        copyFileSync(filePath, corruptBackup)
        const dir = path.dirname(filePath)
        const base = path.basename(filePath)
        const prefix = `${base}.corrupt.`
        const existing = readdirSync(dir).filter((name) => name.startsWith(prefix)).sort()
        while (existing.length > 3) {
          const oldest = existing.shift()
          try { unlinkSync(path.join(dir, oldest)) } catch {}
        }
      }
    } catch {}
  }
  inMemoryStats = createEmptyStats()
  pruneRetentionOnStats(inMemoryStats, statsRetentionDays)
  return inMemoryStats
}

/** Switch active stats storage and load the target file. */
export function switchStatsStorage(newPath) {
  const resolved = resolvePath(newPath)
  if (resolved && resolved !== activeStatsPath) {
    if (activeStatsPath) flushStats(activeStatsPath)
    activeStatsPath = resolved
    loadStats(resolved)
  }
  return activeStatsPath
}

export function flushStats(customPath) {
  if (saveTimer) {
    clearTimeout(saveTimer)
    saveTimer = null
  }
  saveStatsSync(customPath)
}

export function saveStatsSync(customPath) {
  try {
    const filePath = resolvePath(customPath || activeStatsPath)
    activeStatsPath = filePath
    const dir = path.dirname(filePath)
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    inMemoryStats.updatedAt = Date.now()
    const tempPath = `${filePath}.${Date.now()}.${Math.random().toString(36).slice(2, 8)}.tmp`
    writeFileSync(tempPath, JSON.stringify(inMemoryStats, null, 2), 'utf8')
    renameSync(tempPath, filePath)
  } catch {
    /* best-effort disk persistence */
  }
}

function queueSaveStats(customPath, debounceMs = 500) {
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    saveTimer = null
    try { saveStatsSync(customPath) } catch {}
  }, debounceMs)
}

function addToBucket(bucket, entry) {
  bucket.requests += 1
  if (entry.isError) bucket.failed += 1
  else bucket.successful += 1
  if (entry.is429) bucket.rateLimited429 += 1
  bucket.promptTokens += entry.promptTokens
  bucket.completionTokens += entry.completionTokens
  bucket.reasoningTokens += entry.reasoningTokens
  bucket.cacheReadTokens += entry.cacheReadTokens
  bucket.cacheWriteTokens += entry.cacheWriteTokens
  bucket.totalTokens += entry.totalTokens
  bucket.costUsd += entry.costUsd
  if (entry.priced) bucket.pricedRequests += 1
  else bucket.unpricedRequests += 1
  bucket.ttftMsSum += entry.ttftMs
  bucket.latencyMsSum += entry.latencyMs
  if (entry.latencyMs > 0) {
    if (!Array.isArray(bucket.latencyHistogram)) bucket.latencyHistogram = []
    const index = latencyBucketIndex(entry.latencyMs)
    bucket.latencyHistogram[index] = Number(bucket.latencyHistogram[index] || 0) + 1
  }
  bucket.firstAt = bucket.firstAt || entry.now
  bucket.lastAt = entry.now
  if (entry.model) bucket.model = entry.model
  if (entry.accountId) bucket.accountId = entry.accountId
  if (entry.purpose) bucket.purpose = entry.purpose
}

function incrementBucket(container, key, entry) {
  if (!container[key]) container[key] = emptyBucket()
  addToBucket(container[key], entry)
}

function pruneSessions(now = Date.now()) {
  const sessions = inMemoryStats.bySession
  for (const [id, bucket] of Object.entries(sessions)) {
    if (now - Number(bucket.lastAt || 0) > SESSION_TTL_MS) delete sessions[id]
  }
  const ids = Object.keys(sessions)
  if (ids.length <= MAX_SESSIONS) return
  ids.sort((a, b) => Number(sessions[a].lastAt || 0) - Number(sessions[b].lastAt || 0))
  for (const id of ids.slice(0, ids.length - MAX_SESSIONS)) delete sessions[id]
}

function pruneHours(now = Date.now()) {
  const cutoff = localDateKey(new Date(now - HEATMAP_RETENTION_MS))
  for (const container of [inMemoryStats.byHour, inMemoryStats.byHourModel]) {
    for (const key of Object.keys(container || {})) {
      if (key < cutoff) delete container[key]
    }
  }
}

/**
 * Best-effort first-run backfill: older files predate the hourly buckets, so
 * each persisted session contributes its requests to the hour it last ran.
 * This is approximate by design; it only runs while the hourly map is empty.
 */
function backfillHourlyFromSessions() {
  if (Object.keys(inMemoryStats.byHour || {}).length > 0) return
  for (const bucket of Object.values(inMemoryStats.bySession || {})) {
    const requests = Number(bucket?.requests || 0)
    if (requests <= 0) continue
    const at = Number(bucket.lastAt || bucket.firstAt || 0)
    if (!Number.isFinite(at) || at <= 0) continue
    const local = new Date(at)
    const key = `${localDateKey(local)}T${String(local.getHours()).padStart(2, '0')}`
    if (!inMemoryStats.byHour[key]) inMemoryStats.byHour[key] = emptyBucket()
    const hour = inMemoryStats.byHour[key]
    hour.requests += requests
    hour.successful += Number(bucket.successful || 0)
    hour.failed += Number(bucket.failed || 0)
    hour.rateLimited429 += Number(bucket.rateLimited429 || 0)
    hour.promptTokens += Number(bucket.promptTokens || 0)
    hour.completionTokens += Number(bucket.completionTokens || 0)
    hour.reasoningTokens += Number(bucket.reasoningTokens || 0)
    hour.cacheReadTokens += Number(bucket.cacheReadTokens || 0)
    hour.cacheWriteTokens += Number(bucket.cacheWriteTokens || 0)
    hour.totalTokens += Number(bucket.totalTokens || 0)
    hour.costUsd += Number(bucket.costUsd || 0)
    hour.pricedRequests += Number(bucket.pricedRequests || 0)
    hour.unpricedRequests += Number(bucket.unpricedRequests || 0)
    hour.ttftMsSum += Number(bucket.ttftMsSum || 0)
    hour.latencyMsSum += Number(bucket.latencyMsSum || 0)
    hour.firstAt = hour.firstAt ? Math.min(hour.firstAt, bucket.firstAt || at) : (bucket.firstAt || at)
    hour.lastAt = Math.max(hour.lastAt, at)
    if (bucket.model) hour.model = bucket.model
    if (bucket.accountId) hour.accountId = bucket.accountId
    const model = bucket.model || 'unknown'
    if (!inMemoryStats.byHourModel[key]) inMemoryStats.byHourModel[key] = {}
    inMemoryStats.byHourModel[key][model] = Number(inMemoryStats.byHourModel[key][model] || 0) + requests
  }
}

/**
 * Record one completion event.
 * @param {object} entry
 */
export function recordUsage({
  model = 'unknown',
  accountId = 'default',
  sessionId,
  purpose,
  promptTokens = 0,
  completionTokens = 0,
  reasoningTokens = 0,
  cacheReadTokens = 0,
  cacheWriteTokens = 0,
  totalTokens = 0,
  costUsd = 0,
  priced = false,
  ttftMs = 0,
  latencyMs = 0,
  isError = false,
  is429 = false,
  statsPath,
} = {}) {
  if (statsPath) switchStatsStorage(statsPath)
  const now = Date.now()
  const dayKey = new Date(now).toISOString().slice(0, 10)
  const monthKey = dayKey.slice(0, 7)
  const safePrompt = Math.max(0, Number(promptTokens) || 0)
  const safeComp = Math.max(0, Number(completionTokens) || 0)
  const entry = {
    now,
    model,
    accountId,
    purpose: purpose || '',
    promptTokens: safePrompt,
    completionTokens: safeComp,
    reasoningTokens: Math.max(0, Number(reasoningTokens) || 0),
    cacheReadTokens: Math.max(0, Number(cacheReadTokens) || 0),
    cacheWriteTokens: Math.max(0, Number(cacheWriteTokens) || 0),
    totalTokens: Math.max(safePrompt + safeComp, Number(totalTokens) || 0),
    costUsd: Math.max(0, Number(costUsd) || 0),
    priced: Boolean(priced),
    ttftMs: Math.max(0, Number(ttftMs) || 0),
    latencyMs: Math.max(0, Number(latencyMs) || 0),
    isError: Boolean(isError),
    is429: Boolean(is429),
  }

  addToBucket(inMemoryStats.totals, entry)
  incrementBucket(inMemoryStats.byDay, dayKey, entry)
  incrementBucket(inMemoryStats.byMonth, monthKey, entry)
  incrementBucket(inMemoryStats.byModel, model, entry)
  incrementBucket(inMemoryStats.byAccount, accountId, entry)
  const localNow = new Date(now)
  const hourKey = `${localDateKey(localNow)}T${String(localNow.getHours()).padStart(2, '0')}`
  incrementBucket(inMemoryStats.byHour, hourKey, entry)
  if (!inMemoryStats.byHourModel[hourKey]) inMemoryStats.byHourModel[hourKey] = {}
  inMemoryStats.byHourModel[hourKey][model] = Number(inMemoryStats.byHourModel[hourKey][model] || 0) + 1
  pruneHours(now)
  pruneRetentionOnStats(inMemoryStats, statsRetentionDays, now)
  if (sessionId) {
    const key = String(sessionId)
    incrementBucket(inMemoryStats.bySession, key, entry)
    const bucket = inMemoryStats.bySession[key]
    if (bucket) bucket.last = { ...entry, sessionId: key }
    pruneSessions(now)
  }
  queueSaveStats(statsPath)
}

export function getStatsSummary() {
  return JSON.parse(JSON.stringify(inMemoryStats))
}

/**
 * Return the ClineBot-only aggregate for one DSH session.
 * Returns null when the session has no recorded ClineBot traffic.
 * @param {string} sessionId
 */
export function getSessionStats(sessionId) {
  const key = String(sessionId || '').trim()
  if (!key) return null
  const bucket = inMemoryStats.bySession?.[key]
  return bucket ? JSON.parse(JSON.stringify(bucket)) : null
}

/**
 * Current UTC day/month estimated spend for budget guards.
 * @param {number} [now]
 */
export function getBudgetSpend(now = Date.now()) {
  const dayKey = new Date(now).toISOString().slice(0, 10)
  const monthKey = dayKey.slice(0, 7)
  return {
    dayKey,
    monthKey,
    dayCost: Number(inMemoryStats.byDay?.[dayKey]?.costUsd || 0),
    monthCost: Number(inMemoryStats.byMonth?.[monthKey]?.costUsd || 0),
  }
}

export function resetStats(customPath) {
  inMemoryStats = createEmptyStats()
  saveStatsSync(customPath)
  return inMemoryStats
}

/**
 * Hourly request heatmap for the last `days` local days.
 * @param {number} [days]
 * @param {number} [to]
 */
function getHeatmap(days = 7, to = Date.now(), model = '') {
  const count = Math.max(1, Math.min(95, Number(days) || 7))
  const end = new Date(Number.isFinite(Number(to)) ? Number(to) : Date.now())
  const start = new Date(end.getFullYear(), end.getMonth(), end.getDate() - (count - 1))
  const startKey = localDateKey(start)
  const endKey = localDateKey(end)
  const grid = Array.from({ length: 7 }, () => Array(24).fill(0))
  const hours = Array(24).fill(0)
  let total = 0

  for (const [key, bucket] of Object.entries(inMemoryStats.byHour || {})) {
    const datePart = key.slice(0, 10)
    if (datePart < startKey || datePart > endKey) continue
    const hour = Number(key.slice(11, 13))
    if (!Number.isInteger(hour) || hour < 0 || hour > 23) continue
    const date = new Date(`${datePart}T00:00:00`)
    if (Number.isNaN(date.getTime())) continue
    const weekday = (date.getDay() + 6) % 7
    const requests = model
      ? Number(inMemoryStats.byHourModel?.[key]?.[model] || 0)
      : Number(bucket.requests || 0)
    if (requests <= 0) continue
    grid[weekday][hour] += requests
    hours[hour] += requests
    total += requests
  }

  const modelTotals = new Map()
  for (const [key, perModel] of Object.entries(inMemoryStats.byHourModel || {})) {
    const datePart = key.slice(0, 10)
    if (datePart < startKey || datePart > endKey) continue
    for (const [id, value] of Object.entries(perModel || {})) {
      if (!id) continue
      modelTotals.set(id, (modelTotals.get(id) || 0) + Number(value || 0))
    }
  }
  const models = [...modelTotals.entries()]
    .filter(([, value]) => value > 0)
    .map(([id, value]) => ({ model: id, total: value }))
    .sort((a, b) => b.total - a.total)

  return { total, grid, hours, models, days: count }
}

/**
 * Aggregate analytics for a time range.
 * @param {{ from?: number|string, to?: number|string, groupBy?: string, limit?: number, model?: string, account?: string, heatmapDays?: number|string, heatmapModel?: string }} [query]
 */
export function getAnalytics(query = {}) {
  const now = Date.now()
  const from = Number.isFinite(Number(query.from)) ? Number(query.from) : 0
  const to = Number.isFinite(Number(query.to)) ? Number(query.to) : now
  const groupBy = ['session', 'day', 'model', 'account'].includes(query.groupBy) ? query.groupBy : 'model'
  const limit = Math.max(1, Math.min(500, Number(query.limit) || 50))
  const source = groupBy === 'session'
    ? inMemoryStats.bySession
    : groupBy === 'day'
      ? inMemoryStats.byDay
      : groupBy === 'account'
        ? inMemoryStats.byAccount
        : inMemoryStats.byModel

  const groups = []
  const totalsHistogram = []
  for (const [key, bucket] of Object.entries(source || {})) {
    const at = groupBy === 'day' ? Date.parse(`${key}T00:00:00Z`) : Number(bucket.lastAt || 0)
    if (Number.isFinite(at) && (at < from || at > to)) continue
    if (query.model && bucket.model && bucket.model !== query.model && key !== query.model) continue
    if (query.account && bucket.accountId && bucket.accountId !== query.account && key !== query.account) continue
    const requests = Number(bucket.requests || 0)
    const successful = Number(bucket.successful || 0)
    const histogram = Array.isArray(bucket.latencyHistogram) ? bucket.latencyHistogram : []
    mergeHistogram(totalsHistogram, histogram)
    const avgLatencyMs = requests > 0 ? Number(bucket.latencyMsSum || 0) / requests : 0
    groups.push({
      key,
      label: key,
      requests,
      successful,
      failed: Number(bucket.failed || 0),
      rateLimited429: Number(bucket.rateLimited429 || 0),
      promptTokens: Number(bucket.promptTokens || 0),
      completionTokens: Number(bucket.completionTokens || 0),
      reasoningTokens: Number(bucket.reasoningTokens || 0),
      cacheReadTokens: Number(bucket.cacheReadTokens || 0),
      cacheWriteTokens: Number(bucket.cacheWriteTokens || 0),
      totalTokens: Number(bucket.totalTokens || 0),
      costUsd: Number(bucket.costUsd || 0),
      pricedRequests: Number(bucket.pricedRequests || 0),
      unpricedRequests: Number(bucket.unpricedRequests || 0),
      successRate: requests > 0 ? (successful / requests) * 100 : 0,
      avgTtftMs: successful > 0 ? Number(bucket.ttftMsSum || 0) / successful : 0,
      avgLatencyMs,
      p50LatencyMs: percentileFromHistogram(histogram, 50) || avgLatencyMs,
      p95LatencyMs: percentileFromHistogram(histogram, 95) || avgLatencyMs,
      ttftMsSum: Number(bucket.ttftMsSum || 0),
      latencyMsSum: Number(bucket.latencyMsSum || 0),
      model: bucket.model || '',
      accountId: bucket.accountId || '',
      lastAt: Number(bucket.lastAt || 0),
    })
  }
  groups.sort((a, b) => groupBy === 'session'
    ? b.lastAt - a.lastAt
    : (b.totalTokens - a.totalTokens) || (b.requests - a.requests))

  const totals = emptyBucket()
  for (const group of groups) {
    totals.requests += group.requests
    totals.successful += group.successful
    totals.failed += group.failed
    totals.rateLimited429 += group.rateLimited429
    totals.promptTokens += group.promptTokens
    totals.completionTokens += group.completionTokens
    totals.reasoningTokens += group.reasoningTokens
    totals.cacheReadTokens += group.cacheReadTokens
    totals.cacheWriteTokens += group.cacheWriteTokens
    totals.totalTokens += group.totalTokens
    totals.costUsd += group.costUsd
    totals.pricedRequests += group.pricedRequests
    totals.unpricedRequests += group.unpricedRequests
    totals.ttftMsSum += group.ttftMsSum
    totals.latencyMsSum += group.latencyMsSum
    if (group.lastAt) {
      totals.firstAt = totals.firstAt ? Math.min(totals.firstAt, group.lastAt) : group.lastAt
      totals.lastAt = Math.max(totals.lastAt, group.lastAt)
    }
    if (group.model) totals.model = group.model
    if (group.accountId) totals.accountId = group.accountId
  }
  totals.successRate = totals.requests > 0 ? (totals.successful / totals.requests) * 100 : 0
  totals.avgTtftMs = totals.successful > 0 ? totals.ttftMsSum / totals.successful : 0
  totals.avgLatencyMs = totals.requests > 0 ? totals.latencyMsSum / totals.requests : 0
  totals.p50LatencyMs = percentileFromHistogram(totalsHistogram, 50) || totals.avgLatencyMs
  totals.p95LatencyMs = percentileFromHistogram(totalsHistogram, 95) || totals.avgLatencyMs

  return {
    range: { from, to },
    totals,
    groups: groups.slice(0, limit),
    unpriced: Number(totals.unpricedRequests || 0),
    heatmap: getHeatmap(query.heatmapDays, to, query.heatmapModel),
  }
}

/**
 * Export CSV. The compact form keeps the historical schema; `detailed`
 * appends cache, cost, TTFT and latency columns.
 * @param {boolean} [detailed]
 */
export function exportStatsAsCsv(detailed = false) {
  const header = detailed
    ? 'Dimension,Key,Requests,PromptTokens,CompletionTokens,ReasoningTokens,CacheReadTokens,CacheWriteTokens,TotalTokens,CostUsd,TtftMs,LatencyMs'
    : 'Dimension,Key,Requests,PromptTokens,CompletionTokens,ReasoningTokens,TotalTokens'
  const lines = [header]
  const addRows = (dimension, obj) => {
    for (const [key, val] of Object.entries(obj || {})) {
      if (detailed) {
        lines.push(`${dimension},"${key}",${val.requests || 0},${val.promptTokens || 0},${val.completionTokens || 0},${val.reasoningTokens || 0},${val.cacheReadTokens || 0},${val.cacheWriteTokens || 0},${val.totalTokens || 0},${Number(val.costUsd || 0).toFixed(6)},${Math.round(val.ttftMsSum || 0)},${Math.round(val.latencyMsSum || 0)}`)
      } else {
        lines.push(`${dimension},"${key}",${val.requests || 0},${val.promptTokens || 0},${val.completionTokens || 0},${val.reasoningTokens || 0},${val.totalTokens || 0}`)
      }
    }
  }
  const totals = inMemoryStats.totals || {}
  if (detailed) {
    lines.push(`Total,"all",${totals.requests || 0},${totals.promptTokens || 0},${totals.completionTokens || 0},${totals.reasoningTokens || 0},${totals.cacheReadTokens || 0},${totals.cacheWriteTokens || 0},${totals.totalTokens || 0},${Number(totals.costUsd || 0).toFixed(6)},${Math.round(totals.ttftMsSum || 0)},${Math.round(totals.latencyMsSum || 0)}`)
  } else {
    lines.push(`Total,"all",${totals.requests || 0},${totals.promptTokens || 0},${totals.completionTokens || 0},${totals.reasoningTokens || 0},${totals.totalTokens || 0}`)
  }
  addRows('Day', inMemoryStats.byDay)
  addRows('Month', inMemoryStats.byMonth)
  addRows('Model', inMemoryStats.byModel)
  addRows('Account', inMemoryStats.byAccount)
  if (detailed) {
    addRows('Session', inMemoryStats.bySession)
    addRows('Hour', inMemoryStats.byHour)
  }
  return lines.join('\n')
}

