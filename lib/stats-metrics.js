/**
 * Compact latency histograms and retention pruning for the stats store.
 */

const LATENCY_BOUNDS = [50, 100, 200, 400, 800, 1600, 3200, 6400, 12800, 25600, 51200, 102400, Infinity]

export function latencyBucketIndex(ms) {
  const value = Math.max(0, Number(ms) || 0)
  const index = LATENCY_BOUNDS.findIndex((bound) => value <= bound)
  return index < 0 ? LATENCY_BOUNDS.length - 1 : index
}

export function mergeHistogram(target, source) {
  if (!Array.isArray(source)) return target
  for (let index = 0; index < source.length; index += 1) {
    target[index] = Number(target[index] || 0) + Number(source[index] || 0)
  }
  return target
}

export function percentileFromHistogram(histogram, percentile) {
  if (!Array.isArray(histogram)) return 0
  const total = histogram.reduce((sum, value) => sum + Number(value || 0), 0)
  if (total <= 0) return 0
  const target = Math.max(1, Math.ceil((Math.max(1, Math.min(99, percentile)) / 100) * total))
  let seen = 0
  for (let index = 0; index < histogram.length; index += 1) {
    seen += Number(histogram[index] || 0)
    if (seen >= target) {
      const bound = LATENCY_BOUNDS[index]
      return bound === Infinity ? LATENCY_BOUNDS[LATENCY_BOUNDS.length - 2] : bound
    }
  }
  return 0
}

function localDateKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

/**
 * Prune time buckets and sessions older than the configured retention window.
 * @param {Record<string, any>} stats
 * @param {number} days 0 keeps everything
 * @param {number} [now]
 */
export function pruneRetentionOnStats(stats, days, now = Date.now()) {
  const retentionDays = Math.max(0, Number(days) || 0)
  if (!stats || retentionDays <= 0) return
  const cutoffMs = now - retentionDays * 24 * 60 * 60 * 1000
  const cutoffDay = new Date(cutoffMs).toISOString().slice(0, 10)
  const cutoffMonth = cutoffDay.slice(0, 7)
  const cutoffHourDay = localDateKey(new Date(cutoffMs))
  for (const key of Object.keys(stats.byDay || {})) {
    if (key < cutoffDay) delete stats.byDay[key]
  }
  for (const key of Object.keys(stats.byMonth || {})) {
    if (key < cutoffMonth) delete stats.byMonth[key]
  }
  for (const container of [stats.byHour, stats.byHourModel]) {
    for (const key of Object.keys(container || {})) {
      if (key.slice(0, 10) < cutoffHourDay) delete container[key]
    }
  }
  for (const [key, bucket] of Object.entries(stats.bySession || {})) {
    if (Number(bucket?.lastAt || 0) < cutoffMs) delete stats.bySession[key]
  }
}
