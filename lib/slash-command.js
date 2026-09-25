import { publicConfig, plainConfig, Config } from './config.js'
import { resolveActiveAccountKey, formatProgressBar } from './provider-sync.js'
import {
  getAllModels,
  isVisionModel,
  isSupportedModel,
  formatModelContext,
  DEFAULT_MODEL_ID,
} from './models.js'
import {
  resolveAccountPool,
  rotateToNextAccount,
  probeHealth,
  smokeChat,
  fetchUsageLimits,
  recordSmokeTest,
  clearUsageCache,
  clearProbeCache,
  usageCache,
  sessionStats,
  getLastRotation,
} from './cline-client.js'

export function registerSlashCommand(ctx, { live, getSettingsApi, syncProviderState }) {
  ctx.inject(['commands'], (cmdCtx) => {
    const commands = cmdCtx.commands
    if (typeof commands?.register !== 'function') return

    const executeCommand = async (rawArgs, invocation = null) => {
      try {
        const pub = publicConfig(live())
        const subcmd = String(rawArgs || '').trim().toLowerCase().split(/\s+/)[0] || 'quota'
        const param = String(rawArgs || '').trim().split(/\s+/)[1] || ''

        // 1. Subcommand /cline models
        if (subcmd === 'models') {
          const allModels = getAllModels(pub.dynamicModels, pub.modelContextOverrides)
          const disabledSet = new Set(pub.disabledModels || [])
          const activeCount = allModels.filter((m) => !disabledSet.has(m.id)).length
          const syncStatus = pub.planSynced
            ? `Verified (${pub.planSyncedAt ? new Date(pub.planSyncedAt).toLocaleDateString([], { day: '2-digit', month: '2-digit', year: 'numeric' }) : 'synced'})`
            : 'Unverified fallback'
          const summary = `ClinePass Models · ${activeCount}/${allModels.length} active · ${pub.planSynced ? 'Verified with plan' : 'Fallback catalog'}`
          const lines = [
            summary,
            '',
            `Plan Sync:     ${syncStatus}`,
            `Active Models: ${activeCount} of ${allModels.length}`,
          ]
          if (pub.defaultModelWarning) {
            lines.push(`Warning:       ${pub.defaultModelWarning}`)
          }
          lines.push('')
          for (const m of allModels) {
            const active = !disabledSet.has(m.id) ? '[OK]' : '[--]'
            const isVis = isVisionModel(m.id, pub.dynamicModels) ? 'Vision' : 'Text'
            const efforts = Array.isArray(m.reasoningEfforts) ? ` · Reasoning: ${m.reasoningEfforts.join(', ')}` : ''
            lines.push(`  ${active} ${m.name} (${m.id})`)
            lines.push(`       ${isVis} · ${formatModelContext(m.contextLength)}${efforts}`)
          }
          return lines.join('\n')
        }

        // 2. Subcommand /cline accounts
        if (subcmd === 'accounts') {
          const pool = await resolveAccountPool(ctx, live())
          const activeKey = await resolveActiveAccountKey(ctx, live(), pool)
          const activeName = activeKey.apiKeyEnv || activeKey.envName || pub.apiKeyEnv
          const configuredCount = pool.filter((a) => a.present).length
          const summary = `ClinePass Accounts · ${configuredCount}/${pool.length} configured · Active: ${activeName}`
          const lines = [
            summary,
            '',
            `Active Account: ${activeName}`,
            '',
          ]
          for (const acc of pool) {
            const pinStr = acc.isPinned ? ' [Pinned]' : ''
            const statusStr = acc.present ? 'Configured' : 'Missing Key'
            const cacheKey = `cline:usage:${(acc.value || '').slice(-8)}`
            const cached = usageCache.get(cacheKey)?.data
            const usageInfo = cached?.windows?.fiveHour ? ` · 5h ${cached.windows.fiveHour.percentUsed}% used` : ''
            lines.push(`  ${acc.label} (${acc.apiKeyEnv})`)
            lines.push(`    Status: ${statusStr}${pinStr}${usageInfo}`)
          }
          const lastRot = getLastRotation()
          if (lastRot) {
            lines.push('', `Last Failover: ${lastRot.from} -> ${lastRot.to} (${lastRot.reason})`)
          }
          lines.push('', 'Switch active account: /cline switch <KEY_NAME>')
          return lines.join('\n')
        }

        // 3. Subcommand /cline switch <account>
        if (subcmd === 'switch') {
          if (!param) {
            return 'Please specify account: /cline switch <KEY_NAME>'
          }
          clearUsageCache()
          clearProbeCache()
          const settingsApi = getSettingsApi()
          if (settingsApi?.replace) {
            const next = Config({ ...plainConfig(live()), activeAccount: param })
            await settingsApi.replace(next)
            await syncProviderState(next)
            return `Active account switched to ${param}`
          }
          return 'Could not apply setting (settings service unavailable).'
        }

        // 4. Subcommand /cline rotate (smart failover next)
        if (subcmd === 'rotate') {
          const res = await rotateToNextAccount(ctx, live(), 'slash_command', getSettingsApi())
          if (res.rotated) {
            await syncProviderState(live())
            return `Account rotated: switched from ${res.previousAccount} to ${res.activeAccount}. DSH provider updated.`
          }
          return `Rotation skipped: ${res.message || 'no alternative configured accounts in pool'}.`
        }

        // 5. Subcommand /cline ping (fresh host reachability probe)
        if (subcmd === 'ping') {
          const health = await probeHealth(pub.baseUrl, { bypassCache: true, timeoutMs: 5000 })
          if (health.ok) {
            return `Cline API Pong: ${pub.baseUrl} is reachable (latency: ${health.latencyMs} ms, HTTP ${health.status})`
          }
          return `Cline API Ping Failed: ${health.error || 'Host unreachable'}`
        }

        // 6. Subcommand /cline stats (real DSH stream metrics)
        if (subcmd === 'stats' || subcmd === 'telemetry') {
          const summary = `ClineBot Telemetry · ${sessionStats.successfulRequests}/${sessionStats.totalRequests} reqs · ~${sessionStats.totalTokensEst} tokens`
          const lines = [
            summary,
            '',
            `Requests:      ${sessionStats.successfulRequests} successful / ${sessionStats.totalRequests} total${sessionStats.abortedRequests ? ` (${sessionStats.abortedRequests} aborted)` : ''}${sessionStats.failedRequests ? ` (${sessionStats.failedRequests} failed)` : ''}`,
            `Tokens:        ~${sessionStats.totalTokensEst} total (~${sessionStats.promptTokensEst} prompt, ~${sessionStats.completionTokensEst} completion)`,
            `Last Latency:  ${sessionStats.lastLatencyMs !== null ? `${sessionStats.lastLatencyMs} ms` : '—'}`,
            `Last Request:  ${sessionStats.lastRequestAt ? new Date(sessionStats.lastRequestAt).toLocaleTimeString() : '—'}`,
          ]
          if (sessionStats.lastError) {
            lines.push(`Last Error:    ${sessionStats.lastError}`)
          }
          if (sessionStats.byModel && Object.keys(sessionStats.byModel).length) {
            lines.push('', 'By Model:')
            for (const [mId, mStats] of Object.entries(sessionStats.byModel)) {
              lines.push(`  ${mId}: ${mStats.requests} reqs, ~${mStats.promptTokens + mStats.completionTokens} tokens`)
            }
          }
          if (sessionStats.lastSmoke) {
            const smoke = sessionStats.lastSmoke
            const smokeTime = new Date(smoke.at).toLocaleTimeString()
            lines.push('', `Last Smoke Test: ${smoke.ok ? 'Passed' : 'Failed'} (${smoke.latencyMs} ms at ${smokeTime}${smoke.model ? `, model: ${smoke.model}` : ''})`)
          }
          return lines.join('\n')
        }

        // 7. Subcommand /cline test [model] / smoke
        if (subcmd === 'test' || subcmd === 'smoke') {
          if (param && !isSupportedModel(param, pub.dynamicModels)) {
            return `ClineBot: Model "${param}" is not recognized. Use /cline models to see available models.`
          }
          const activeKey = await resolveActiveAccountKey(ctx, live())
          if (!activeKey.value) {
            return 'ClineBot: API key is not configured. Open Settings -> Plugins -> ClineBot.'
          }
          const modelToTest = param || pub.defaultModel || DEFAULT_MODEL_ID
          const outcome = await smokeChat(pub.baseUrl, activeKey.value, {
            model: modelToTest,
            timeoutMs: pub.smokeTimeoutMs,
          })
          recordSmokeTest({
            latencyMs: outcome.latencyMs,
            ok: outcome.ok,
            error: outcome.error,
            model: modelToTest,
          })

          let failoverNotice = ''
          if (outcome.status === 429) {
            const failover = await rotateToNextAccount(ctx, live(), 'smoke_429', getSettingsApi())
            if (failover.rotated) {
              await syncProviderState(live())
              failoverNotice = `\nAuto-failover: HTTP 429 detected! Active account automatically rotated to ${failover.activeAccount}.`
            }
          }

          if (outcome.ok) {
            const summary = `Smoke Test Passed · ${outcome.model} · ${outcome.latencyMs} ms`
            return [
              summary,
              '',
              `Model:      ${outcome.model}`,
              `Latency:    ${outcome.latencyMs} ms`,
              `Tokens:     prompt: ${outcome.promptTokens}, completion: ${outcome.completionTokens} (total: ${outcome.totalTokens})`,
              `Preview:    "${outcome.preview}"`,
            ].join('\n')
          }
          return `Smoke Test Failed: ${outcome.error} (HTTP ${outcome.status || 'timeout'})${failoverNotice}`
        }

        // 8. Subcommand /cline quota or /cline balance
        const activeKey = await resolveActiveAccountKey(ctx, live())
        if (!activeKey.value) {
          return 'ClineBot: API key is not configured. Open Settings -> Plugins -> ClineBot.'
        }

        const [health, usage] = await Promise.all([
          probeHealth(pub.baseUrl, { timeoutMs: 5000 }),
          fetchUsageLimits(pub.baseUrl, activeKey.value, { timeoutMs: 8000 }),
        ])

        const fiveHour = usage?.windows?.fiveHour
        const weekly = usage?.windows?.weekly
        const reset5h = fiveHour?.resetsAt ? new Date(fiveHour.resetsAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'N/A'
        const resetWk = weekly?.resetsAt ? new Date(weekly.resetsAt).toLocaleDateString([], { day: '2-digit', month: '2-digit' }) : 'N/A'
        const resetWkFull = weekly?.resetsAt ? new Date(weekly.resetsAt).toLocaleDateString([], { day: '2-digit', month: '2-digit', year: 'numeric' }) : 'N/A'

        const planRaw = usage?.plan || 'ClinePass'
        const planShort = planRaw.replace(/\s*\(\$\d+\.\d+\/mo\)/i, '').trim()
        const wkPct = typeof weekly?.percentUsed === 'number' ? `${weekly.percentUsed}%` : 'N/A'
        const fhPct = typeof fiveHour?.percentUsed === 'number' ? `${fiveHour.percentUsed}%` : 'N/A'
        const pingStr = health.ok ? `${health.latencyMs} ms` : 'offline'
        const keyName = activeKey.apiKeyEnv || activeKey.envName || pub.apiKeyEnv

        // Line 1: Short summary for collapsed command row (strictly <= 120 chars)
        const summary = `${planShort} · Weekly ${wkPct}${weekly?.resetsAt ? ` (reset ${resetWk})` : ''} · 5h ${fhPct} · Ping ${pingStr}`

        const pad = (str, len = 15) => (str + ':').padEnd(len, ' ')
        const lines = [
          summary,
          '',
          `${pad('Plan')}${planRaw}`,
          `${pad('Active Key')}${keyName} (${activeKey.source})`,
          `${pad('Default Model')}${pub.defaultModel}`,
          `${pad('Host Ping')}${health.ok ? `${health.latencyMs} ms (reachable)` : 'Unreachable'}`,
        ]
        if (usage?.user?.email) {
          lines.splice(3, 0, `${pad('Account')}${usage.user.email}`)
        }
        if (pub.defaultModelWarning) {
          lines.push(`${pad('Warning')}${pub.defaultModelWarning}`)
        }

        lines.push(
          '',
          `${pad('5-Hour Quota')}${formatProgressBar(fiveHour?.percentUsed)}  (resets: ${reset5h})`,
          `${pad('Weekly Quota')}${formatProgressBar(weekly?.percentUsed)}  (resets: ${resetWkFull})`,
        )

        if (fiveHour?.percentUsed >= 95) {
          lines.push('', 'CRITICAL: 5-hour quota is 95%+ consumed! New requests may be throttled until reset.')
        } else if (fiveHour?.percentUsed >= 80) {
          lines.push('', `Warning: 5-hour quota is ${fiveHour.percentUsed}% consumed.`)
        }

        if (sessionStats.totalRequests > 0) {
          lines.push('', `Session Stats:  ${sessionStats.successfulRequests}/${sessionStats.totalRequests} successful requests, ~${sessionStats.totalTokensEst} total tokens`)
        }

        return lines.join('\n')
      } catch (err) {
        return `ClineBot error: ${String(err?.message || err)}`
      }
    }

    const commandHandler = async (invocation) => {
      const rawArgs = typeof invocation === 'string'
        ? invocation
        : (invocation?.rawInput || invocation?.input || invocation?.text || invocation?.args || '')
      try {
        const output = await executeCommand(rawArgs, invocation)
        return {
          kind: 'success',
          text: output,
          // Support toString() for callers that treat result directly as string
          toString() { return output },
        }
      } catch (err) {
        return {
          kind: 'error',
          text: `ClineBot error: ${String(err?.message || err)}`,
          toString() { return `ClineBot error: ${String(err?.message || err)}` },
        }
      }
    }

    const commandExecute = async (rawArgs, invocation = null) => {
      const result = await commandHandler(invocation || rawArgs)
      return result.text
    }

    const unregister = commands.register({
      definitionId: '@goodandready/dsh-clinebot',
      name: 'cline',
      description: 'Check ClinePass subscription quota, models, accounts and test connectivity (/cline [quota|models|accounts|switch <name>|test [model]|ping|rotate])',
      input: { hint: '[quota|models|accounts|switch <name>|test [model]|ping|rotate]' },
      handler: commandHandler,
      execute: commandExecute,
    })

    ctx.effect(() => () => unregister?.(), 'dsh-clinebot: slash-command')
  })
}
