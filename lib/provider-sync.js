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
  usageCache,
  buildPiAiProvider,
  DEFAULT_API_KEY_ENV,
} from './cline-client.js'
import { publicConfig, plainConfig, Config, LLM_PI_AI_NS } from './config.js'
import { publicUsage } from './http.js'
import { resolveKeyValue } from './credential-refs.js'
import { resolveAccountPool, getLastRotation } from './account-pool.js'
import { getLocalProxyToken, LOCAL_PROXY_KEY_ENV } from './proxy-token.js'
import { saveCredentialKey } from './credential-refs.js'

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

export async function checkRegisteredInPiAi(ctx) {
  const settings = ctx?.get?.('settings')
  try {
    if (typeof settings?.describe === 'function') {
      const descriptors = settings.describe()
      const piAiDesc = Array.isArray(descriptors) ? descriptors.find((d) => d?.ns === LLM_PI_AI_NS) : null
      if (piAiDesc?.value?.providers?.[PROVIDER_ID]) return true
    }
    if (typeof settings?.get === 'function') {
      const piAi = settings.get(LLM_PI_AI_NS)
      if (piAi?.providers?.[PROVIDER_ID]) return true
    }
    const llm = ctx?.get?.('llm')
    if (typeof llm?.listProviders === 'function') {
      const list = await llm.listProviders()
      if (Array.isArray(list) && list.some((p) => (p?.id || p) === PROVIDER_ID)) {
        return true
      }
    }
  } catch {
    return false
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
    checkRegisteredInPiAi(ctx),
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
          message: `5-hour rolling limit is almost exhausted (${fiveHour.percentUsed}%). New requests may be rejected until quota reset.`,
          resetsAt: fiveHour.resetsAt,
        }
      } else if (fiveHour.percentUsed >= 90) {
        quotaWarning = {
          level: 'warning',
          message: `Low quota warning: ${fiveHour.percentUsed}% of 5-hour limit consumed (<10% remaining).`,
          resetsAt: fiveHour.resetsAt,
        }
      }
    }

    if (!quotaWarning && weekly && typeof weekly.percentUsed === 'number' && weekly.percentUsed >= 90) {
      quotaWarning = {
        level: weekly.percentUsed >= 99 ? 'exhausted' : 'warning',
        message: `Low weekly quota warning: ${weekly.percentUsed}% consumed (${weekly.remainingPercent ?? (100 - weekly.percentUsed)}% remaining).`,
        resetsAt: weekly.resetsAt,
      }
    }

    if (!quotaWarning && monthly && typeof monthly.percentUsed === 'number' && monthly.percentUsed >= 90) {
      quotaWarning = {
        level: monthly.percentUsed >= 99 ? 'exhausted' : 'warning',
        message: `Low monthly quota warning: ${monthly.percentUsed}% consumed (${monthly.remainingPercent ?? (100 - monthly.percentUsed)}% remaining).`,
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

export async function upsertPiAiProvider(ctx, cfg, activeModelIds) {
  const settings = ctx?.get?.('settings')
  if (!settings?.mutate) {
    throw new Error('DSH settings service unavailable')
  }

  const pub = publicConfig(cfg)
  const allModels = getAllModels(pub.dynamicModels, pub.modelContextOverrides, pub.customModels)
  const allowedSet = new Set(activeModelIds || pub.enabledModels)
  const modelsToRegister = allModels.filter((m) => allowedSet.has(m.id))

  const activeAcc = await resolveActiveAccountKey(ctx, cfg)

  const port = ctx?.webServer?.port || process.env.PORT || 3080
  const isProxy = pub.proxyMode !== false
  const effectiveBaseUrl = isProxy
    ? `http://127.0.0.1:${port}/dsh-clinebot/v1`
    : pub.baseUrl

  const localToken = isProxy ? getLocalProxyToken() : undefined
  if (isProxy && localToken) {
    try {
      await saveCredentialKey(ctx, LOCAL_PROXY_KEY_ENV, localToken)
    } catch {
      /* credentials service might be absent/read-only in tests; process.env is set */
    }
  }

  const providerObj = buildPiAiProvider({
    baseUrl: effectiveBaseUrl,
    apiKeyEnv: isProxy ? LOCAL_PROXY_KEY_ENV : (activeAcc?.apiKeyEnv || pub.apiKeyEnv),
    models: modelsToRegister.length ? modelsToRegister : allModels,
    dynamicModels: pub.dynamicModels,
    modelContextOverrides: pub.modelContextOverrides,
    customModels: pub.customModels,
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

  try {
    await settings.mutate(LLM_PI_AI_NS, [
      {
        op: 'remove',
        path: ['providers', PROVIDER_ID],
      },
    ])
  } catch (err) {
    const msg = String(err?.message || err).toLowerCase()
    if (!msg.includes('not found') && !msg.includes('absent') && !msg.includes('enoent') && !msg.includes('does not exist')) {
      throw err
    }
  }
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

    if ((!pub.dynamicModels || !pub.dynamicModels.length) && cacheFile) {
      const fromDisk = await loadModelsDiskCache(cacheFile)
      if (Array.isArray(fromDisk) && fromDisk.length && settingsApi?.replace) {
        const migratedDisk = fromDisk.map(migrateModelEntry)
        const next = plainConfig(Config({
          ...plainConfig(live()),
          dynamicModels: migratedDisk,
          planSyncedAt: fromDisk.planSyncedAt || Date.now(),
        }))
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

    if (usageData?.ok && Array.isArray(usageData.dynamicModels)) {
      const existingDynamic = pub.dynamicModels || []
      const isDifferent = isCatalogDifferent(existingDynamic, usageData.dynamicModels)

      if (isDifferent && settingsApi?.replace) {
        const now = Date.now()
        const next = plainConfig(Config({
          ...plainConfig(live()),
          dynamicModels: usageData.dynamicModels,
          planSyncedAt: now,
        }))
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
