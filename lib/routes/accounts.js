import { writeJson, readBody, publicUsage } from '../http.js'
import { discoverLocalClineKeys, consumeDiscoveredKey } from '../key-discovery.js'
import { assertTrustedSettingsRequest } from '../access.js'
import { publicConfig, plainConfig, Config } from '../config.js'
import { resolveActiveAccountKey } from '../provider-sync.js'
import { resolveAccountPool } from '../account-pool.js'
import { getAccountEvents } from '../account-events.js'
import {
  clearUsageCache,
  clearProbeCache,
  saveCredentialKey,
  deleteCredentialKey,
  fetchUsageLimits,
  smokeChat,
  DEFAULT_API_KEY_ENV,
} from '../cline-client.js'

export function registerAccountsRoutes(ctx, { live, syncProviderState, getSettingsApi }) {
  const pendingSecretCleanupAccounts = new Set()

  async function addAccountInternal({ apiKey, label, apiKeyEnv }) {
    const curr = plainConfig(live())
    const existingAccounts = Array.isArray(curr.accounts) ? [...curr.accounts] : []

    let targetEnv = String(apiKeyEnv || '').trim()
    if (!targetEnv) {
      let maxN = 1
      for (const acc of existingAccounts) {
        const m = String(acc?.apiKeyEnv || '').match(/^CLINEBOT_API_KEY_(\d+)$/)
        if (m) {
          const num = parseInt(m[1], 10)
          if (num >= maxN) maxN = num + 1
        }
      }
      if (curr.apiKeyEnv && curr.apiKeyEnv.startsWith('CLINEBOT_API_KEY_')) {
        const m = curr.apiKeyEnv.match(/^CLINEBOT_API_KEY_(\d+)$/)
        if (m) {
          const num = parseInt(m[1], 10)
          if (num >= maxN) maxN = num + 1
        }
      }
      targetEnv = `CLINEBOT_API_KEY_${maxN}`
    }

    if (!/^CLINEBOT_API_KEY(_[A-Z0-9]+)?$/.test(targetEnv)) {
      const err = new Error(`Disallowed apiKeyEnv: "${targetEnv}". Must match ^CLINEBOT_API_KEY(_[A-Z0-9]+)?$`)
      err.status = 400
      throw err
    }

    const accountLabel = String(label || '').trim() || targetEnv

    await saveCredentialKey(ctx, targetEnv, apiKey)

    const idx = existingAccounts.findIndex((a) => a && a.apiKeyEnv === targetEnv)
    const accountEntry = { label: accountLabel, apiKeyEnv: targetEnv }
    if (idx >= 0) {
      existingAccounts[idx] = accountEntry
    } else {
      existingAccounts.push(accountEntry)
    }

    const next = plainConfig(Config({ ...curr, accounts: existingAccounts }))
    const settingsApi = getSettingsApi()
    await settingsApi.replace(next)
    await syncProviderState(next)

    let validation = { ok: false, error: 'Skipped validation: baseUrl is not https' }
    try {
      const parsed = new URL(curr.baseUrl)
      if (parsed.protocol === 'https:') {
        validation = await smokeChat(curr.baseUrl, apiKey, {
          model: curr.defaultModel,
          timeoutMs: 15000,
        })
      }
    } catch {
      validation = { ok: false, error: 'Invalid baseUrl' }
    }

    clearUsageCache()
    clearProbeCache()

    return {
      account: accountEntry,
      validated: validation.ok,
      latencyMs: validation.latencyMs,
      validationError: validation.ok ? null : validation.error,
    }
  }

  // POST /dsh-clinebot/accounts — add account endpoint (supports DELETE for backward compat)
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/dsh-clinebot/accounts',
    handler: async (req, res) => {
      if (req.method === 'DELETE') {
        return handleDeleteAccount(req, res)
      }
      if (req.method !== 'POST') return writeJson(res, 405, { ok: false, error: 'POST or DELETE only' })
      if (!assertTrustedSettingsRequest(req, res, ctx)) return
      const settingsApi = getSettingsApi()
      if (!settingsApi || typeof settingsApi.replace !== 'function') {
        return writeJson(res, 503, { ok: false, error: 'Settings service unavailable or read-only' })
      }
      try {
        const bodyBuf = await readBody(req)
        let body = {}
        try { body = JSON.parse(bodyBuf.toString('utf8')) } catch { body = {} }

        const apiKey = String(body.apiKey || '').trim()
        if (!apiKey) {
          return writeJson(res, 400, { ok: false, error: 'API key is required' })
        }

        const result = await addAccountInternal({
          apiKey,
          label: body.label,
          apiKeyEnv: body.apiKeyEnv,
        })
        writeJson(res, 200, { ok: true, ...result })
      } catch (err) {
        const status = typeof err?.status === 'number' ? err.status : 500
        writeJson(res, status, { ok: false, error: String(err?.message || err) })
      }
    },
  }), 'dsh-clinebot: /accounts')

  async function handleDeleteAccount(req, res, targetEnvFromUrl = '') {
    if (!assertTrustedSettingsRequest(req, res, ctx)) return
    const settingsApi = getSettingsApi()
    if (!settingsApi || typeof settingsApi.replace !== 'function') {
      return writeJson(res, 503, { ok: false, error: 'Settings service unavailable or read-only' })
    }
    try {
      let body = {}
      if (req.method === 'POST' || req.method === 'DELETE') {
        try {
          const bodyBuf = await readBody(req)
          body = JSON.parse(bodyBuf.toString('utf8'))
        } catch {
          body = {}
        }
      }
      let queryApiKeyEnv = ''
      try {
        const u = new URL(req.url, 'http://127.0.0.1')
        queryApiKeyEnv = u.searchParams.get('apiKeyEnv') || ''
      } catch {
        queryApiKeyEnv = ''
      }
      const targetEnv = String(targetEnvFromUrl || body.apiKeyEnv || queryApiKeyEnv || '').trim()
      if (!targetEnv) {
        return writeJson(res, 400, { ok: false, error: 'apiKeyEnv is required' })
      }

      const isDefaultPattern = /^CLINEBOT_API_KEY(_[A-Z0-9]+)?$/.test(targetEnv)
      if (!isDefaultPattern) {
        return writeJson(res, 400, {
          ok: false,
          error: `Disallowed apiKeyEnv: "${targetEnv}". Must match ^CLINEBOT_API_KEY(_[A-Z0-9]+)?$.`,
        })
      }

      const curr = plainConfig(live())
      if (targetEnv === curr.apiKeyEnv || targetEnv === DEFAULT_API_KEY_ENV) {
        return writeJson(res, 400, { ok: false, error: 'Cannot delete the primary account' })
      }

      const existingAccounts = Array.isArray(curr.accounts) ? curr.accounts : []
      const accountToDelete = existingAccounts.find((a) => a && a.apiKeyEnv === targetEnv)
      if (!accountToDelete) {
        if (body.deleteSecret && pendingSecretCleanupAccounts.has(targetEnv) && ctx?.get?.('credentials')) {
          let retryDelRes = null
          try {
            retryDelRes = await deleteCredentialKey(ctx, targetEnv)
          } catch {
            retryDelRes = null
          }
          if (retryDelRes && retryDelRes.ok) {
            pendingSecretCleanupAccounts.delete(targetEnv)
            clearUsageCache()
            clearProbeCache()
            return writeJson(res, 200, { ok: true, removed: targetEnv, secretDeleted: true })
          }
          return writeJson(res, 500, {
            ok: false,
            partial: true,
            accountRemoved: true,
            secretDeleted: false,
            error: `Failed to delete secret for account "${targetEnv}" from credentials store on retry`,
          })
        }
        return writeJson(res, 404, {
          ok: false,
          error: `Account "${targetEnv}" not found in accounts pool`,
        })
      }

      const nextAccounts = existingAccounts.filter((a) => a && a.apiKeyEnv !== targetEnv)
      let activeAccount = curr.activeAccount
      if (activeAccount === targetEnv) {
        activeAccount = ''
      }

      // Persist settings changes first before unsetting credentials (#184)
      const next = plainConfig(Config({ ...curr, accounts: nextAccounts, activeAccount }))
      await settingsApi.replace(next)
      await syncProviderState(next)

      let delRes = null
      if (body.deleteSecret) {
        try {
          delRes = await deleteCredentialKey(ctx, targetEnv)
        } catch {
          delRes = null
        }
        if (!delRes || !delRes.ok) {
          let rollbackSuccess = false
          try {
            const fresh = plainConfig(live())
            const freshAccounts = Array.isArray(fresh.accounts) ? [...fresh.accounts] : []
            if (!freshAccounts.some((a) => a && a.apiKeyEnv === targetEnv)) {
              freshAccounts.push(accountToDelete)
            }
            const restoredConfig = plainConfig(Config({
              ...fresh,
              accounts: freshAccounts,
              activeAccount: fresh.activeAccount,
            }))
            await settingsApi.replace(restoredConfig)
            await syncProviderState(restoredConfig)
            rollbackSuccess = true
          } catch {
            rollbackSuccess = false
          }

          if (rollbackSuccess) {
            return writeJson(res, 500, {
              ok: false,
              partial: false,
              accountRemoved: false,
              secretDeleted: false,
              error: `Failed to delete secret for account "${targetEnv}" from credentials store`,
            })
          }

          pendingSecretCleanupAccounts.add(targetEnv)
          return writeJson(res, 500, {
            ok: false,
            partial: true,
            accountRemoved: true,
            secretDeleted: false,
            error: `Failed to delete secret for account "${targetEnv}" from credentials store`,
          })
        }
      }

      pendingSecretCleanupAccounts.delete(targetEnv)
      clearUsageCache()
      clearProbeCache()

      writeJson(res, 200, { ok: true, removed: targetEnv, secretDeleted: Boolean(body.deleteSecret && delRes?.ok) })
    } catch (err) {
      writeJson(res, 500, { ok: false, error: String(err?.message || err) })
    }
  }

  // POST /dsh-clinebot/accounts/delete — delete account endpoint
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/dsh-clinebot/accounts/delete',
    handler: async (req, res) => {
      if (req.method !== 'POST' && req.method !== 'DELETE') {
        return writeJson(res, 405, { ok: false, error: 'POST or DELETE only' })
      }
      return handleDeleteAccount(req, res)
    },
  }), 'dsh-clinebot: /accounts/delete')

  // POST /dsh-clinebot/accounts/active — switch or pin active account
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/dsh-clinebot/accounts/active',
    handler: async (req, res) => {
      if (req.method !== 'POST') return writeJson(res, 405, { ok: false, error: 'POST only' })
      if (!assertTrustedSettingsRequest(req, res, ctx)) return
      try {
        const bodyBuf = await readBody(req)
        let body = {}
        try { body = JSON.parse(bodyBuf.toString('utf8')) } catch { body = {} }
        const account = String(body.account || '').trim()

        clearUsageCache()
        clearProbeCache()
        const settingsApi = getSettingsApi()
        if (!settingsApi || typeof settingsApi.replace !== 'function') {
          return writeJson(res, 503, { ok: false, error: 'Settings service unavailable or read-only' })
        }

        const currentLive = plainConfig(live())
        const accountChanged = currentLive.activeAccount !== account
        const next = plainConfig(Config({
          ...currentLive,
          activeAccount: account,
          ...(accountChanged ? { dynamicModels: [], planSyncedAt: 0 } : {}),
        }))
        await settingsApi.replace(next)
        await syncProviderState(next)
        writeJson(res, 200, { ok: true, activeAccount: account })
      } catch (err) {
        writeJson(res, 500, { ok: false, error: String(err?.message || err) })
      }
    },
  }), 'dsh-clinebot: /accounts/active')

  // GET /dsh-clinebot/keys/discovered — scan local Cline CLI and VS Code extension keys (#232, #246)
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/dsh-clinebot/keys/discovered',
    handler: async (req, res) => {
      if (req.method !== 'GET') return writeJson(res, 405, { ok: false, error: 'GET only' })
      if (!assertTrustedSettingsRequest(req, res, ctx)) return
      try {
        const discovered = discoverLocalClineKeys()
        writeJson(res, 200, { ok: true, discovered })
      } catch (err) {
        writeJson(res, 500, { ok: false, error: String(err?.message || err) })
      }
    },
  }), 'dsh-clinebot: /keys/discovered')

  // POST /dsh-clinebot/keys/discovered/import — safely import discovered key without exposing secret (#246)
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/dsh-clinebot/keys/discovered/import',
    handler: async (req, res) => {
      if (req.method !== 'POST') return writeJson(res, 405, { ok: false, error: 'POST only' })
      if (!assertTrustedSettingsRequest(req, res, ctx)) return
      const settingsApi = getSettingsApi()
      if (!settingsApi || typeof settingsApi.replace !== 'function') {
        return writeJson(res, 503, { ok: false, error: 'Settings service unavailable or read-only' })
      }
      try {
        const bodyBuf = await readBody(req)
        let body = {}
        try { body = JSON.parse(bodyBuf.toString('utf8')) } catch { body = {} }

        const id = String(body.id || '').trim()
        if (!id) {
          return writeJson(res, 400, { ok: false, error: 'Discovered key id is required' })
        }

        const apiKey = consumeDiscoveredKey(id)
        if (!apiKey) {
          return writeJson(res, 404, { ok: false, error: 'Discovered key not found or expired' })
        }

        const result = await addAccountInternal({
          apiKey,
          label: body.label,
          apiKeyEnv: body.apiKeyEnv,
        })
        writeJson(res, 200, { ok: true, ...result })
      } catch (err) {
        const status = typeof err?.status === 'number' ? err.status : 500
        writeJson(res, status, { ok: false, error: String(err?.message || err) })
      }
    },
  }), 'dsh-clinebot: /keys/discovered/import')

  // GET /dsh-clinebot/accounts/usage — per-account live quota report
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/dsh-clinebot/accounts/usage',
    handler: async (req, res) => {
      if (req.method !== 'GET') return writeJson(res, 405, { ok: false, error: 'GET only' })
      if (!assertTrustedSettingsRequest(req, res, ctx)) return
      try {
        const cfg = live()
        const pub = publicConfig(cfg)
        const pool = await resolveAccountPool(ctx, cfg)
        const active = await resolveActiveAccountKey(ctx, cfg, pool)
        const timeoutMs = Math.min(2500, Number(pub.timeoutMs) || 2500)
        const accounts = await Promise.all(pool.map(async (account) => {
          let usage = null
          let error = null
          if (account.present && account.value) {
            usage = await fetchUsageLimits(pub.baseUrl, account.value, { timeoutMs }).catch((err) => {
              error = String(err?.message || err)
              return null
            })
            if (usage && usage.ok === false) error = usage.error || 'usage unavailable'
          }
          return {
            id: account.id,
            label: account.label,
            apiKeyEnv: account.apiKeyEnv,
            configured: Boolean(account.present && account.value),
            source: account.source,
            active: account.apiKeyEnv === active.apiKeyEnv,
            isPinned: Boolean(account.isPinned),
            usage: usage ? publicUsage(usage) : null,
            error,
          }
        }))
        return writeJson(res, 200, {
          ok: true,
          activeAccount: active.apiKeyEnv,
          accountMode: pub.accountMode,
          checkedAt: Date.now(),
          accounts,
        })
      } catch (err) {
        return writeJson(res, 500, { ok: false, error: String(err?.message || err) })
      }
    },
  }), 'dsh-clinebot: /accounts/usage')

  // GET /dsh-clinebot/accounts/history — recent cooldown/recovery/route events
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/dsh-clinebot/accounts/history',
    handler: async (req, res) => {
      if (req.method !== 'GET') return writeJson(res, 405, { ok: false, error: 'GET only' })
      if (!assertTrustedSettingsRequest(req, res, ctx)) return
      try {
        const limit = Number(new URL(req.url, 'http://localhost').searchParams.get('limit')) || 50
        writeJson(res, 200, { ok: true, events: getAccountEvents(limit) })
      } catch (err) {
        writeJson(res, 500, { ok: false, error: String(err?.message || err) })
      }
    },
  }), 'dsh-clinebot: /accounts/history')

  // POST /dsh-clinebot/accounts/rename — rename a pooled account
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/dsh-clinebot/accounts/rename',
    handler: async (req, res) => {
      if (req.method !== 'POST') return writeJson(res, 405, { ok: false, error: 'POST only' })
      if (!assertTrustedSettingsRequest(req, res, ctx)) return
      const settingsApi = getSettingsApi()
      if (!settingsApi || typeof settingsApi.replace !== 'function') {
        return writeJson(res, 503, { ok: false, error: 'Settings service unavailable or read-only' })
      }
      try {
        const bodyBuf = await readBody(req)
        let body = {}
        try { body = JSON.parse(bodyBuf.toString('utf8')) } catch { body = {} }
        const apiKeyEnv = String(body.apiKeyEnv || '').trim()
        const label = String(body.label || '').trim()
        if (!/^CLINEBOT_API_KEY(_[A-Z0-9]+)?$/.test(apiKeyEnv)) {
          return writeJson(res, 400, { ok: false, error: `Disallowed apiKeyEnv: "${apiKeyEnv}"` })
        }
        const curr = plainConfig(live())
        if (apiKeyEnv === curr.apiKeyEnv || apiKeyEnv === DEFAULT_API_KEY_ENV) {
          return writeJson(res, 400, { ok: false, error: 'Cannot rename the primary account' })
        }
        const accounts = Array.isArray(curr.accounts) ? [...curr.accounts] : []
        const index = accounts.findIndex((account) => account && account.apiKeyEnv === apiKeyEnv)
        if (index < 0) return writeJson(res, 404, { ok: false, error: `Account "${apiKeyEnv}" not found` })
        accounts[index] = { ...accounts[index], label: label || apiKeyEnv }
        const next = plainConfig(Config({ ...curr, accounts }))
        await settingsApi.replace(next)
        await syncProviderState(next)
        return writeJson(res, 200, { ok: true, accounts: next.accounts })
      } catch (err) {
        return writeJson(res, 500, { ok: false, error: String(err?.message || err) })
      }
    },
  }), 'dsh-clinebot: /accounts/rename')

  // POST /dsh-clinebot/accounts/key/clear — remove a stored key but keep the account row
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/dsh-clinebot/accounts/key/clear',
    handler: async (req, res) => {
      if (req.method !== 'POST') return writeJson(res, 405, { ok: false, error: 'POST only' })
      if (!assertTrustedSettingsRequest(req, res, ctx)) return
      try {
        const bodyBuf = await readBody(req)
        let body = {}
        try { body = JSON.parse(bodyBuf.toString('utf8')) } catch { body = {} }
        const apiKeyEnv = String(body.apiKeyEnv || '').trim()
        if (!/^CLINEBOT_API_KEY(_[A-Z0-9]+)?$/.test(apiKeyEnv)) {
          return writeJson(res, 400, { ok: false, error: `Disallowed apiKeyEnv: "${apiKeyEnv}"` })
        }
        const curr = plainConfig(live())
        const isPrimary = apiKeyEnv === curr.apiKeyEnv || apiKeyEnv === DEFAULT_API_KEY_ENV
        const inPool = Array.isArray(curr.accounts) && curr.accounts.some((account) => account && account.apiKeyEnv === apiKeyEnv)
        if (!isPrimary && !inPool) {
          return writeJson(res, 404, { ok: false, error: `Account "${apiKeyEnv}" not found` })
        }
        const deleted = await deleteCredentialKey(ctx, apiKeyEnv).catch(() => ({ ok: false }))
        clearUsageCache()
        clearProbeCache()
        await syncProviderState(live())
        return writeJson(res, 200, { ok: true, apiKeyEnv, cleared: Boolean(deleted?.ok) })
      } catch (err) {
        return writeJson(res, 500, { ok: false, error: String(err?.message || err) })
      }
    },
  }), 'dsh-clinebot: /accounts/key/clear')
}