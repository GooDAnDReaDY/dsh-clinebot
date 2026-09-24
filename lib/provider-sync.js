import os from 'node:os'
import path from 'node:path'
import { publicConfig, plainConfig, Config, LLM_PI_AI_NS } from './config.js'
import { publicUsage } from './http.js'
import {
  PROVIDER_ID,
  PROVIDER_DISPLAY_NAME,
  getAllModels,
  loadModelsDiskCache,
  saveModelsDiskCache,
} from './models.js'
import {
  resolveKeyValue,
  resolveAccountPool,
  probeHealth,
  fetchUsageLimits,
  buildPiAiProvider,
  sessionStats,
  getLastRotation,
} from './cline-client.js'

export function resolvePathWithHome(p) {
  if (!p || typeof p !== 'string') return ''
  if (p === '~') return os.homedir()
  if (p.startsWith('~/') || p.startsWith('~\\')) {
    return path.join(os.homedir(), p.slice(2))
  }
  return p
}

export async function checkRegisteredInPiAi(ctx) {
  const settings = ctx?.get?.('settings')
  if (!settings?.get) return false
  try {
    const piAi = settings.get(LLM_PI_AI_NS)
    return !!piAi?.providers?.[PROVIDER_ID]
  } catch {
    return false
  }
}

export async function resolveActiveAccountKey(ctx, cfg, pool = null) {
  const accountPool = pool || await resolveAccountPool(ctx, cfg)
  const configured = accountPool.filter((acc) => acc.present && acc.value)
  if (!configured.length) {
    return { envName: publicConfig(cfg).apiKeyEnv, value: '', source: 'none', id: 'default' }
  }
  const pub = publicConfig(cfg)
  if (pub.activeAccount) {
    const pinned = configured.find((acc) => acc.apiKeyEnv === pub.activeAccount || acc.id === pub.activeAccount)
    if (pinned) return pinned
  }
  return configured[0]
}

export async function buildStatus(ctx, cfg) {
  const pub = publicConfig(cfg)
  const probeTimeout = Math.min(2500, pub.timeoutMs || 2500)

  const [key, pool, isRegistered, health] = await Promise.all([
    resolveKeyValue(ctx, pub.apiKeyEnv),
    resolveAccountPool(ctx, cfg),
    checkRegisteredInPiAi(ctx),
    probeHealth(pub.baseUrl, { timeoutMs: probeTimeout }),
  ])

  const activeAcc = await resolveActiveAccountKey(ctx, cfg, pool)
  const allModels = getAllModels(pub.dynamicModels)

  let usage = null
  const keyToUse = activeAcc.value || key.value
  if (keyToUse) {
    usage = await fetchUsageLimits(pub.baseUrl, keyToUse, { timeoutMs: probeTimeout }).catch(() => null)
  }

  let quotaWarning = null
  if (usage?.windows?.fiveHour) {
    const pct = usage.windows.fiveHour.percentUsed
    if (pct >= 95) {
      quotaWarning = {
        level: 'exhausted',
        message: `5-hour rolling limit is almost exhausted (${pct}%). New requests may be rejected until quota reset.`,
        resetsAt: usage.windows.fiveHour.resetsAt,
      }
    } else if (pct >= 80) {
      quotaWarning = {
        level: 'warning',
        message: `Notice: ${pct}% of the 5-hour rolling limit has been consumed.`,
        resetsAt: usage.windows.fiveHour.resetsAt,
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
    accounts: pool.map((acc) => ({
      id: acc.id,
      label: acc.label,
      apiKeyEnv: acc.apiKeyEnv,
      present: acc.present,
      source: acc.source,
      isPinned: acc.isPinned,
    })),
    activeAccount: activeAcc.apiKeyEnv,
    health,
    usage: publicUsage(usage),
    quotaWarning,
    sessionStats: { ...sessionStats },
    lastRotation: getLastRotation(),
    isRegistered,
    availableModels: allModels,
  }
}

export async function upsertPiAiProvider(ctx, cfg, activeModelIds) {
  const settings = ctx?.get?.('settings')
  if (!settings?.mutate) {
    throw new Error('DSH settings service unavailable')
  }

  const pub = publicConfig(cfg)
  const allModels = getAllModels(pub.dynamicModels)
  const allowedSet = new Set(activeModelIds || pub.enabledModels)
  const modelsToRegister = allModels.filter((m) => allowedSet.has(m.id))

  const activeAcc = await resolveActiveAccountKey(ctx, cfg)

  const providerObj = buildPiAiProvider({
    baseUrl: pub.baseUrl,
    apiKeyEnv: activeAcc?.apiKeyEnv || pub.apiKeyEnv,
    models: modelsToRegister.length ? modelsToRegister : allModels,
    customModels: pub.dynamicModels,
    displayName: PROVIDER_DISPLAY_NAME,
  })

  await settings.mutate(LLM_PI_AI_NS, [
    {
      op: 'set',
      path: ['providers', PROVIDER_ID],
      value: providerObj,
    },
  ])

  return providerObj
}

export async function removePiAiProvider(ctx) {
  const settings = ctx?.get?.('settings')
  if (!settings?.mutate) {
    throw new Error('DSH settings service unavailable')
  }

  await settings.mutate(LLM_PI_AI_NS, [
    {
      op: 'remove',
      path: ['providers', PROVIDER_ID],
    },
  ])
  return { ok: true }
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

    if ((!pub.dynamicModels || !pub.dynamicModels.length) && cacheFile) {
      const fromDisk = await loadModelsDiskCache(cacheFile)
      if (Array.isArray(fromDisk) && fromDisk.length && settingsApi?.replace) {
        const next = Config({
          ...plainConfig(live()),
          dynamicModels: fromDisk,
          planSyncedAt: fromDisk.planSyncedAt || Date.now(),
        })
        await settingsApi.replace(next)
        await syncProviderState(next)
      }
    }

    const activeAcc = await resolveActiveAccountKey(ctx, cfg)
    if (!activeAcc.value) return

    const usageData = await fetchUsageLimits(pub.baseUrl, activeAcc.value, {
      timeoutMs: Math.min(pub.timeoutMs, 5000),
      bypassCache: true,
    })

    if (usageData?.ok && Array.isArray(usageData.dynamicModels) && usageData.dynamicModels.length > 0) {
      const existingDynamic = pub.dynamicModels || []
      const existingIds = new Set(existingDynamic.map((m) => m.id))
      const hasNew = usageData.dynamicModels.some((m) => !existingIds.has(m.id))

      if (hasNew && settingsApi?.replace) {
        const now = Date.now()
        const next = Config({
          ...plainConfig(live()),
          dynamicModels: usageData.dynamicModels,
          planSyncedAt: now,
        })
        await settingsApi.replace(next)
        await syncProviderState(next)
        if (cacheFile) {
          await saveModelsDiskCache(cacheFile, usageData.dynamicModels, now)
        }
      }
    }
  } catch {
    /* best-effort discovery */
  }
}
