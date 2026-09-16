import { publicConfig, Config } from './config.js'
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
  recordSessionRequest,
  clearUsageCache,
  clearProbeCache,
  usageCache,
  sessionStats,
} from './cline-client.js'

export function registerSlashCommand(ctx, { live, getSettingsApi, syncProviderState }) {
  ctx.inject(['commands'], (cmdCtx) => {
    const commands = cmdCtx.commands
    if (typeof commands?.register !== 'function') return

    const unregister = commands.register({
      name: 'cline',
      description: 'Check ClinePass subscription quota, models, accounts and test connectivity (/cline [quota|models|accounts|switch <name>|test [model]|ping|rotate])',
      execute: async (rawArgs) => {
        const pub = publicConfig(live())
        const subcmd = String(rawArgs || '').trim().toLowerCase().split(/\s+/)[0] || 'quota'
        const param = String(rawArgs || '').trim().split(/\s+/)[1] || ''

        // 1. Subcommand /cline models
        if (subcmd === 'models') {
          const allModels = getAllModels(pub.dynamicModels)
          const disabledSet = new Set(pub.disabledModels || [])
          const lines = [
            '### 🎯 ClinePass Models Catalog',
            `* **Всего моделей**: ${allModels.length} (${allModels.filter((m) => !disabledSet.has(m.id)).length} активно)`,
            '',
          ]
          for (const m of allModels) {
            const active = !disabledSet.has(m.id) ? '✅' : '❌'
            const isVis = isVisionModel(m.id, pub.dynamicModels) ? '📷 Vision' : '📝 Text'
            const efforts = Array.isArray(m.reasoningEfforts) ? `🧠 [${m.reasoningEfforts.join(', ')}]` : ''
            lines.push(`* ${active} **${m.name}** (\`${m.id}\`) — ${isVis} · ${formatModelContext(m.contextLength)} ${efforts}`)
          }
          return lines.join('\n')
        }

        // 2. Subcommand /cline accounts
        if (subcmd === 'accounts') {
          const pool = await resolveAccountPool(ctx, live())
          const lines = [
            '### 🔑 ClinePass Accounts Pool',
            `* **Active Account**: \`${pub.activeAccount || pub.apiKeyEnv}\``,
            '',
          ]
          for (const acc of pool) {
            const pinBadge = acc.isPinned ? '📌 [Pinned]' : ''
            const statusBadge = acc.present ? '✅ Configured' : '⚠️ Missing Key'
            const cacheKey = `cline:usage:${(acc.value || '').slice(-8)}`
            const cached = usageCache.get(cacheKey)?.data
            const usageInfo = cached?.windows?.fiveHour ? ` · ⏱ ${cached.windows.fiveHour.percentUsed}% used` : ''
            lines.push(`* **${acc.label}** (\`${acc.apiKeyEnv}\`): ${statusBadge} ${pinBadge}${usageInfo}`)
          }
          lines.push('', 'Switch active account: `/cline switch <env_variable_name>`')
          return lines.join('\n')
        }

        // 3. Subcommand /cline switch <account>
        if (subcmd === 'switch') {
          if (!param) {
            return '⚠️ Please specify account: `/cline switch <CLINEBOT_API_KEY_2>`'
          }
          clearUsageCache()
          clearProbeCache()
          const settingsApi = getSettingsApi()
          if (settingsApi?.replace) {
            const next = Config({ ...live(), activeAccount: param })
            await settingsApi.replace(next)
            await syncProviderState(next)
            return `✅ Active account switched to \`${param}\``
          }
          return `⚠️ Could not apply setting (settings service unavailable).`
        }

        // 4. Subcommand /cline rotate (smart failover next)
        if (subcmd === 'rotate') {
          const res = await rotateToNextAccount(ctx, live(), 'slash_command', getSettingsApi())
          if (res.rotated) {
            await syncProviderState(live())
            return `🔄 **Account Rotated**: switched from \`${res.previousAccount}\` to \`${res.activeAccount}\`. DSH provider updated!`
          }
          return `⚠️ Rotation skipped: ${res.message || 'no alternative configured accounts in pool'}.`
        }

        // 5. Subcommand /cline ping (fresh host reachability probe)
        if (subcmd === 'ping') {
          const health = await probeHealth(pub.baseUrl, { bypassCache: true, timeoutMs: 5000 })
          if (health.ok) {
            return `🏓 **Cline API Pong**: \`${pub.baseUrl}\` is reachable (latency: **${health.latencyMs} ms**, HTTP ${health.status})`
          }
          return `❌ **Cline API Ping Failed**: ${health.error || 'Host unreachable'}`
        }

        // 6. Subcommand /cline test [model] / smoke
        if (subcmd === 'test' || subcmd === 'smoke') {
          if (param && !isSupportedModel(param, pub.dynamicModels)) {
            return `⚠️ **ClineBot**: Model \`${param}\` is not recognized. Use \`/cline models\` to see available models.`
          }
          const activeKey = await resolveActiveAccountKey(ctx, live())
          if (!activeKey.value) {
            return '⚠️ **ClineBot**: API key is not configured. Open **Settings → Plugins → ClineBot**.'
          }
          const modelToTest = param || pub.defaultModel || DEFAULT_MODEL_ID
          const outcome = await smokeChat(pub.baseUrl, activeKey.value, {
            model: modelToTest,
            timeoutMs: pub.smokeTimeoutMs,
          })
          recordSessionRequest({
            latencyMs: outcome.latencyMs,
            ok: outcome.ok,
            error: outcome.error,
            promptTokens: outcome.promptTokens || 5,
            completionTokens: outcome.completionTokens || 10,
          })

          let failoverNotice = ''
          if (outcome.status === 429) {
            const failover = await rotateToNextAccount(ctx, live(), 'smoke_429', getSettingsApi())
            if (failover.rotated) {
              await syncProviderState(live())
              failoverNotice = `\n🔄 **Auto-failover**: HTTP 429 detected! Active account automatically rotated to \`${failover.activeAccount}\`.`
            }
          }

          if (outcome.ok) {
            return [
              `### 🟢 Smoke Test Passed: \`${outcome.model}\``,
              `* **Latency**: ${outcome.latencyMs} ms`,
              `* **Tokens**: prompt: ${outcome.promptTokens}, completion: ${outcome.completionTokens} (total: ${outcome.totalTokens})`,
              `* **Preview**: _"${outcome.preview}"_`,
            ].join('\n')
          }
          return `❌ **Smoke Test Failed**: ${outcome.error} (HTTP ${outcome.status || 'timeout'})${failoverNotice}`
        }

        // 7. Subcommand /cline quota or /cline balance
        const activeKey = await resolveActiveAccountKey(ctx, live())
        if (!activeKey.value) {
          return '⚠️ **ClineBot**: API key is not configured. Open **Settings → Plugins → ClineBot**.'
        }

        const [health, usage] = await Promise.all([
          probeHealth(pub.baseUrl, { timeoutMs: 5000 }),
          fetchUsageLimits(pub.baseUrl, activeKey.value, { timeoutMs: 8000 }),
        ])

        const fiveHour = usage?.windows?.fiveHour
        const weekly = usage?.windows?.weekly
        const reset5h = fiveHour?.resetsAt ? new Date(fiveHour.resetsAt).toLocaleTimeString() : 'N/A'
        const resetWk = weekly?.resetsAt ? new Date(weekly.resetsAt).toLocaleDateString() : 'N/A'

        const lines = [
          `### 🤖 ClinePass Status (${usage?.plan || 'ClinePass'})`,
          `* **Host Ping**: ${health.ok ? `✅ ${health.latencyMs} ms` : '❌ Unreachable'}`,
          `* **Active Key**: \`${activeKey.envName}\` (${activeKey.source})`,
          `* **Default Model**: \`${pub.defaultModel}\``,
          '',
          `**⏱ 5-Hour Rolling Limit**: ${formatProgressBar(fiveHour?.percentUsed)} (reset: ${reset5h})`,
          `**📅 Weekly Window**: ${formatProgressBar(weekly?.percentUsed)} (reset: ${resetWk})`,
        ]

        if (fiveHour?.percentUsed >= 95) {
          lines.push('', '🚨 **CRITICAL LIMIT**: 5-hour quota is 95%+ consumed! New requests may be throttled until reset.')
        } else if (fiveHour?.percentUsed >= 80) {
          lines.push('', `⚠️ **Warning**: 5-hour quota is ${fiveHour.percentUsed}% consumed.`)
        }

        if (sessionStats.totalRequests > 0) {
          lines.push('', `**📊 Session Telemetry**: ${sessionStats.successfulRequests}/${sessionStats.totalRequests} successful requests, ~${sessionStats.totalTokensEst} total tokens`)
        }

        if (usage?.user?.email) {
          lines.push(`* **Account**: \`${usage.user.email}\``)
        }

        return lines.join('\n')
      },
    })

    ctx.effect(() => () => unregister?.(), 'dsh-clinebot: slash-command')
  })
}
