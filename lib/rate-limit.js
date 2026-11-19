/** Minimal per-key throttle for the expensive routes (#337). */
const lastHit = new Map()

export function allowOnce(key, minIntervalMs) {
  const now = Date.now()
  const previous = lastHit.get(key) || 0
  if (now - previous < minIntervalMs) return false
  lastHit.set(key, now)
  return true
}

export function resetRateLimits() {
  lastHit.clear()
}
