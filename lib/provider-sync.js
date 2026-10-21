import { getStatsSummary } from './stats-storage.js'
import os from 'node:os'
import path from 'node:path'
import {
  PROVIDER_ID,
  PROVIDER_DISPLAY_NAME,
  getAllModels,
  saveModelsDiskCache,
  loadModelsDiskCache,
  OBSOLETE_MODEL_ID_MAP,
  migrateModelEntry,
  isCatalogDifferent,
} from './models.js'
import {
  probeHealth,
  fetchUsageLimits,
  sessionStats,
  DEFAULT_API_KEY_ENV,
} from './cline-client.js'
import { publicConfig, plainConfig, Config } from './config.js'
import { publicUsage } from './http.js'
import { resolveKeyValue } from './credential-refs.js'
import { resolveAccountPool, getLastRotation } from './account-pool.js'

export function resolvePathWithHome(p) {
  let guard = 0
  while (guard < 5 && p) {
    if (typeof p === 'function') {
      try { p = p() } catch { p = ''; break }
      guard += 1
    } else if (typeof p === 'object' && typeof p.get === 'function') {
      try { p = p.get() } catch { p = ''; break }
      guard += 1
    } else {
      break
    }
  }
  if (typeof p !== 'string') return ''
  if (p.startsWith('~/') || p === '~') {
    const home = process.env.HOME || os.homedir()
    return path.join(home, p.slice(1))
  }
  return p
}

async function checkRegisteredInLlm(ctx) {
  try {
    const llm = ctx?.get?.('llm')
    if (llm && typeof llm.listProviders === 'function') {
      const providers = await llm.listProviders()
      if (Array.isArray(providers) && providers.some((entry) => (entry?.id || entry) === PROVIDER_ID)) {
        return true
      }
    }
  } catch {
    /* llm service may not be mounted */
  }
  return false
}

export async function resolveActiveAccountKey(ctx, cfg, pool = null) {
  const accountPool = pool || await resolveAccountPool(ctx, cfg)
  const configured = accountPool.filter((acc) => acc.present && acc.value)
  if (!configured.length) {
    const fallbackEnv = publicConfig(cfg).apiKeyEnv || DEFAULT_API_KEY_ENV
    return { envName: fallbackEnv, apiKeyEnv: fallbackEnv, value: '', source: 'none', id: 'default' }
  }
  const pub = publicConfig(cfg)
  let chosen = configured[0]
  if (pub.activeAccount) {
    const pinned = configured.find((acc) => acc.apiKeyEnv === pub.activeAccount || acc.id === pub.activeAccount)
    if (pinned) chosen = pinned
  }
  const keyEnv = chosen.apiKeyEnv || chosen.envName || DEFAULT_API_KEY_ENV
  return {
    ...chosen,
    envName: keyEnv,
    apiKeyEnv: keyEnv,
  }
}

export async function buildStatus(ctx, cfg) {
  const pub = publicConfig(cfg)
  const probeTimeout = Math.min(2500, pub.timeoutMs || 2500)

  const [key, pool, isRegistered, health] = await Promise.all([
    resolveKeyValue(ctx, pub.apiKeyEnv),
    resolveAccountPool(ctx, cfg),
    checkRegisteredInLlm(ctx),
    probeHealth(pub.baseUrl, { timeoutMs: probeTimeout }),
  ])

  const activeAcc = await resolveActiveAccountKey(ctx, cfg, pool)
  const allModels = getAllModels(pub.dynamicModels, pub.modelContextOverrides, pub.customModels)

  let usage = null
  const keyToUse = activeAcc.value || key.value
  if (keyToUse) {
    usage = await fetchUsageLimits(pub.baseUrl, keyToUse, { timeoutMs: probeTimeout }).catch(() => null)
  }

  let quotaWarning = null
  if (usage?.windows) {
    const fiveHour = usage.windows.fiveHour
    const weekly = usage.windows.weekly
    const monthly = usage.windows.monthly

    if (fiveHour && typeof fiveHour.percentUsed === 'number') {
      if (fiveHour.percentUsed >= 95) {
        quotaWarning = {
          level: 'exhausted',
          code: 'quota.exhausted_5h',
          params: { percentUsed: fiveHour.percentUsed },
          message: `5-hour rolling limit is almost exhausted (${fiveHour.percentUsed}%). New requests may be rejected until quota reset.`,
          resetsAt: fiveHour.resetsAt,
        }
      } else if (fiveHour.percentUsed >= 90) {
        quotaWarning = {
          level: 'warning',
          code: 'quota.warning_5h',
          params: { percentUsed: fiveHour.percentUsed },
          message: `Low quota warning: ${fiveHour.percentUsed}% of 5-hour limit consumed (<10% remaining).`,
          resetsAt: fiveHour.resetsAt,
        }
      }
    }

    if (!quotaWarning && weekly && typeof weekly.percentUsed === 'number' && weekly.percentUsed >= 90) {
      const remainingPercent = weekly.remainingPercent ?? (100 - weekly.percentUsed)
      quotaWarning = {
        level: weekly.percentUsed >= 99 ? 'exhausted' : 'warning',
        code: 'quota.warning_weekly',
        params: { percentUsed: weekly.percentUsed, remainingPercent },
        message: `Low weekly quota warning: ${weekly.percentUsed}% consumed (${remainingPercent}% remaining).`,
        resetsAt: weekly.resetsAt,
      }
    }

    if (!quotaWarning && monthly && typeof monthly.percentUsed === 'number' && monthly.percentUsed >= 90) {
      const remainingPercent = monthly.remainingPercent ?? (100 - monthly.percentUsed)
      quotaWarning = {
        level: monthly.percentUsed >= 99 ? 'exhausted' : 'warning',
        code: 'quota.warning_monthly',
        params: { percentUsed: monthly.percentUsed, remainingPercent },
        message: `Low monthly quota warning: ${monthly.percentUsed}% consumed (${remainingPercent}% remaining).`,
        resetsAt: monthly.resetsAt,
      }
    }
  }

  return {
    ok: true,
    providerId: PROVIDER_ID,
    displayName: PROVIDER_DISPLAY_NAME,
    config: pub,
    key: {
      envName: activeAcc.apiKeyEnv || key.envName,
      present: !!(activeAcc.value || key.value),
      source: activeAcc.source || key.source,
    },
    accounts: pool.map((acc) => {
      return {
        id: acc.id,
        label: acc.label,
        apiKeyEnv: acc.apiKeyEnv,
        present: acc.present,
        source: acc.source,
        isPinned: acc.isPinned,
        percentUsed: typeof acc.percentUsed === 'number' ? acc.percentUsed : null,
      }
    }),
    activeAccount: activeAcc.apiKeyEnv,
    health,
    usage: publicUsage(usage),
    quotaWarning,
    sessionStats: { ...sessionStats },
    statsSummary: getStatsSummary(),
    lastRotation: getLastRotation(),
    isRegistered,
    availableModels: allModels,
  }
}

export function formatProgressBar(pct, totalWidth = 10) {
  const clamped = Math.max(0, Math.min(100, pct || 0))
  const filled = Math.round((clamped / 100) * totalWidth)
  const empty = Math.max(0, totalWidth - filled)
  return `[${'█'.repeat(filled)}${'░'.repeat(empty)}] ${clamped}%`
}

export async function autoDiscoverPlanModels(ctx, { live, getSettingsApi, syncProviderState }) {
  try {
    const cfg = live()
    const pub = publicConfig(cfg)
    const cacheFile = resolvePathWithHome(pub.modelsCachePath)
    const settingsApi = getSettingsApi()

    // Auto-migrate obsolete IDs (e.g. deepseek-v41-flash -> deepseek-v4.1-flash)
    const existingDynamic = pub.dynamicModels || []
    const hasObsolete = existingDynamic.some((m) => Boolean(OBSOLETE_MODEL_ID_MAP[m?.id]))
    if (hasObsolete && settingsApi?.replace) {
      const migrated = existingDynamic.map(migrateModelEntry)
      const next = plainConfig(Config({
        ...plainConfig(live()),
        dynamicModels: migrated,
      }))
      await settingsApi.replace(next)
      await syncProviderState(next)
    }

    const activeAcc = await resolveActiveAccountKey(ctx, cfg)
    if (!activeAcc.value) return

    const cacheIdentity = {
      endpoint: pub.baseUrl,
      accountRef: activeAcc.envName || activeAcc.id || pub.apiKeyEnv,
    }

    let usageData = null
    try {
      usageData = await fetchUsageLimits(pub.baseUrl, activeAcc.value, {
        timeoutMs: Math.min(pub.timeoutMs, 5000),
        bypassCache: true,
      })
    } catch {
      usageData = null
    }

    if (usageData?.ok && Array.isArray(usageData.dynamicModels)) {
      const existingDynamic = pub.dynamicModels || []
      const isDifferent = isCatalogDifferent(existingDynamic, usageData.dynamicModels)
      const now = Date.now()

      if (isDifferent && settingsApi?.replace) {
        const next = plainConfig(Config({
          ...plainConfig(live()),
          dynamicModels: usageData.dynamicModels,
          planSyncedAt: now,
        }))
        await settingsApi.replace(next)
        await syncProviderState(next)
      }
      if (cacheFile) {
        await saveModelsDiskCache(cacheFile, usageData.dynamicModels, now, cacheIdentity)
      }
      return
    }

    if ((!pub.dynamicModels || !pub.dynamicModels.length) && cacheFile) {
      const fromDisk = await loadModelsDiskCache(cacheFile, cacheIdentity)
      if (Array.isArray(fromDisk) && fromDisk.length && settingsApi?.replace) {
        const migratedDisk = fromDisk.map(migrateModelEntry)
        const next = plainConfig(Config({
          ...plainConfig(live()),
          dynamicModels: migratedDisk,
          planSyncedAt: 0,
        }))
        await settingsApi.replace(next)
        await syncProviderState(next)
      }
    }
  } catch {
    /* best-effort discovery */
  }
}
