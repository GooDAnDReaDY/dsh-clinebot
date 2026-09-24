import { resolveKeyValue, usageCache, clearUsageCache, clearProbeCache, DEFAULT_API_KEY_ENV } from './cline-client.js'

/**
 * Resolve all accounts in pool with their status and keys.
 */
function textSetting(value) {
  let current = value
  while (current && typeof current === 'object' && !Array.isArray(current) && typeof current.get === 'function') {
    current = current.get()
  }
  return typeof current === 'string' ? current.trim() : ''
}

export async function resolveAccountPool(ctx, cfg) {
  const apiKeyEnv = textSetting(cfg?.apiKeyEnv) || DEFAULT_API_KEY_ENV
  const defaultSlot = {
    id: 'default',
    label: 'Default',
    apiKeyEnv,
  }
  const accounts = Array.isArray(cfg?.accounts) ? cfg.accounts : []
  const allSlots = [defaultSlot, ...accounts]
  const activeAccount = textSetting(cfg?.activeAccount)
  const resolved = []

  for (let i = 0; i < allSlots.length; i++) {
    const slot = allSlots[i]
    const envName = textSetting(slot.apiKeyEnv) || (i === 0 ? apiKeyEnv : `CLINEBOT_API_KEY_${i + 1}`)
    const keyInfo = await resolveKeyValue(ctx, envName)
    resolved.push({
      id: slot.id || (i === 0 ? 'default' : `account-${i + 1}`),
      label: textSetting(slot.label) || (i === 0 ? 'Default' : `Account ${i + 1}`),
      apiKeyEnv: envName,
      present: Boolean(keyInfo.value),
      source: keyInfo.source,
      value: keyInfo.value,
      isPinned: activeAccount ? activeAccount === envName : i === 0,
    })
  }

  return resolved
}

/**
 * Check if a cached quota entry is currently exhausted.
 * Checks 5-hour rolling limit and verifies if resetsAt timestamp has already elapsed.
 */
export function isAccountQuotaExhausted(usage) {
  if (!usage?.windows?.fiveHour) return false
  const fiveHour = usage.windows.fiveHour
  if (typeof fiveHour.percentUsed !== 'number' || fiveHour.percentUsed < 95) {
    return false
  }
  // Auto-recovery: if resetsAt is present and in the past, the account is recovered
  if (fiveHour.resetsAt) {
    const resetTime = new Date(fiveHour.resetsAt).getTime()
    if (!Number.isNaN(resetTime) && Date.now() >= resetTime) {
      return false
    }
  }
  return true
}

/**
 * Smart Quota-Aware Failover: rotates active account upon 429 or quota exhaustion.
 * Prioritizes accounts with lowest percentUsed and respects resetsAt recovery.
 */
export async function rotateToNextAccount(ctx, cfg, reason = 'rate_limit', settingsApi = null) {
  const pool = await resolveAccountPool(ctx, cfg)
  const configured = pool.filter((acc) => acc.present && acc.value)
  if (configured.length <= 1) {
    return { rotated: false, reason, message: 'Pool has only 1 configured account' }
  }

  const active = String(cfg?.activeAccount || configured[0].apiKeyEnv)
  const currentIndex = configured.findIndex((acc) => acc.apiKeyEnv === active)

  // Candidate pool excluding current account if possible
  const candidates = configured.filter((acc) => acc.apiKeyEnv !== active)
  if (!candidates.length) {
    return { rotated: false, reason, message: 'No alternative accounts configured' }
  }

  // Assess quota for candidates if cached in memory
  let bestCandidate = null
  let lowestUsagePct = Infinity

  for (const cand of candidates) {
    const cacheKey = `cline:usage:${cand.value.slice(-8)}`
    const cached = usageCache.get(cacheKey)?.data
    const isExhausted = isAccountQuotaExhausted(cached)

    if (!isExhausted) {
      const pct = cached?.windows?.fiveHour?.percentUsed ?? 50
      if (pct < lowestUsagePct) {
        lowestUsagePct = pct
        bestCandidate = cand
      }
    }
  }

  // Fallback if all candidates are either exhausted or uncached: pick next in round-robin
  const nextAcc = bestCandidate || candidates[currentIndex % candidates.length] || candidates[0]

  let updated = false
  if (settingsApi?.replace) {
    try {
      const next = { ...cfg, activeAccount: nextAcc.apiKeyEnv }
      await settingsApi.replace(next)
      updated = true
    } catch (err) {
      ctx?.logger?.warn?.('[dsh-clinebot] Failed to persist rotated activeAccount via settingsApi: ' + (err?.message || err))
    }
  } else {
    const settings = (ctx?.get && ctx.get('settings')) || ctx?.settings
    if (settings?.mutate) {
      try {
        await settings.mutate('dsh-clinebot', [
          { op: 'set', path: ['activeAccount'], value: nextAcc.apiKeyEnv },
        ])
        updated = true
      } catch (err) {
        ctx?.logger?.warn?.('[dsh-clinebot] Failed to persist rotated activeAccount via settings.mutate: ' + (err?.message || err))
      }
    }
  }

  if (!updated) {
    return {
      rotated: false,
      previousAccount: active,
      activeAccount: active,
      reason: 'failed_to_persist',
      message: 'Failed to persist rotated activeAccount to settings',
      updatedSettings: false,
    }
  }

  // Reset cached quota and host probes so new account immediately revalidates
  clearUsageCache()
  clearProbeCache()

  return {
    rotated: true,
    previousAccount: active,
    activeAccount: nextAcc.apiKeyEnv,
    reason,
    updatedSettings: true,
  }
}
