import { writeJson, readBody } from '../http.js'
import { assertTrustedSettingsRequest } from '../access.js'
import { publicConfig, plainConfig, Config } from '../config.js'
import { upsertPiAiProvider, removePiAiProvider } from '../provider-sync.js'
import {
  clearUsageCache,
  clearProbeCache,
  saveCredentialKey,
  deleteCredentialKey,
  smokeChat,
  DEFAULT_API_KEY_ENV,
} from '../cline-client.js'

export function registerAccountsRoutes(ctx, { live, getSettingsApi, syncProviderState }) {
  // POST /dsh-clinebot/accounts — add or update account in pool
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/dsh-clinebot/accounts',
    handler: async (req, res) => {
      if (req.method === 'DELETE') {
        return handleDeleteAccount(req, res)
      }
      if (req.method !== 'POST') return writeJson(res, 405, { ok: false, error: 'POST or DELETE only' })
      if (!assertTrustedSettingsRequest(req, res)) return
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

        const curr = plainConfig(live())
        const existingAccounts = Array.isArray(curr.accounts) ? [...curr.accounts] : []

        let targetEnv = String(body.apiKeyEnv || '').trim()
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
          return writeJson(res, 400, {
            ok: false,
            error: `Disallowed apiKeyEnv: "${targetEnv}". Must match ^CLINEBOT_API_KEY(_[A-Z0-9]+)?$`,
          })
        }

        const label = String(body.label || '').trim() || targetEnv

        await saveCredentialKey(ctx, targetEnv, apiKey)

        const idx = existingAccounts.findIndex((a) => a && a.apiKeyEnv === targetEnv)
        const accountEntry = { label, apiKeyEnv: targetEnv }
        if (idx >= 0) {
          existingAccounts[idx] = accountEntry
        } else {
          existingAccounts.push(accountEntry)
        }

        const next = plainConfig(Config({ ...curr, accounts: existingAccounts }))
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

        writeJson(res, 200, {
          ok: true,
          account: accountEntry,
          validated: validation.ok,
          latencyMs: validation.latencyMs,
          validationError: validation.ok ? null : validation.error,
        })
      } catch (err) {
        writeJson(res, 500, { ok: false, error: String(err?.message || err) })
      }
    },
  }), 'dsh-clinebot: /accounts')

  async function handleDeleteAccount(req, res, targetEnvFromUrl = '') {
    if (!assertTrustedSettingsRequest(req, res)) return
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
        if (body.deleteSecret && ctx?.get?.('credentials')) {
          let retryDelRes = null
          try {
            retryDelRes = await deleteCredentialKey(ctx, targetEnv)
          } catch {
            retryDelRes = null
          }
          if (retryDelRes && retryDelRes.ok) {
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

      if (body.deleteSecret) {
        let delRes = null
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
              activeAccount: curr.activeAccount === targetEnv ? targetEnv : fresh.activeAccount,
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

          return writeJson(res, 500, {
            ok: false,
            partial: true,
            accountRemoved: true,
            secretDeleted: false,
            error: `Failed to delete secret for account "${targetEnv}" from credentials store`,
          })
        }
      }

      clearUsageCache()
      clearProbeCache()

      writeJson(res, 200, { ok: true, removed: targetEnv })
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
      if (!assertTrustedSettingsRequest(req, res)) return
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

  // POST /dsh-clinebot/register — upsert into DSH llm-pi-ai
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/dsh-clinebot/register',
    handler: async (req, res) => {
      if (req.method !== 'POST') return writeJson(res, 405, { ok: false, error: 'POST only' })
      if (!assertTrustedSettingsRequest(req, res)) return
      try {
        const bodyBuf = await readBody(req)
        let body = {}
        try { body = JSON.parse(bodyBuf.toString('utf8')) } catch { body = {} }
        const activeModels = body.models || publicConfig(live()).enabledModels
        const result = await upsertPiAiProvider(ctx, live(), activeModels)
        writeJson(res, 200, { ok: true, provider: result })
      } catch (err) {
        writeJson(res, 500, { ok: false, error: String(err?.message || err) })
      }
    },
  }), 'dsh-clinebot: /register')

  // POST /dsh-clinebot/unregister — remove from DSH
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/dsh-clinebot/unregister',
    handler: async (req, res) => {
      if (req.method !== 'POST') return writeJson(res, 405, { ok: false, error: 'POST only' })
      if (!assertTrustedSettingsRequest(req, res)) return
      try {
        await removePiAiProvider(ctx)
        writeJson(res, 200, { ok: true })
      } catch (err) {
        writeJson(res, 500, { ok: false, error: String(err?.message || err) })
      }
    },
  }), 'dsh-clinebot: /unregister')
}
