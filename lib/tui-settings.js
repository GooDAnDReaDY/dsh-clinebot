/**
 * dsh-TUI settings section.
 *
 * The TUI owns its settings screen and only accepts declarations. The API key
 * is a secret field written through the credentials seam; every other field is
 * a normal settings path in the `dsh-clinebot` namespace.
 */

import { publicConfig } from './config.js'
import { DEFAULT_API_KEY_ENV } from './credential-refs.js'

function boolFormat(value) {
  return value === false ? 'false' : 'true'
}

function boolParse(text) {
  return { kind: 'set', value: String(text).trim() === 'true' }
}

/**
 * Build the section descriptor from live configuration.
 * @param {{ live: () => Record<string, unknown> }} deps
 */
export function buildTuiSection({ live }) {
  const pub = publicConfig(live())
  const apiKeyRef = pub.apiKeyEnv || DEFAULT_API_KEY_ENV
  const accounts = Array.isArray(pub.accounts) ? pub.accounts : []
  const fields = [
    {
      path: ['apiKey'],
      group: 'connection',
      kind: 'text',
      label: 'API key',
      secret: { ref: apiKeyRef },
      hint: `Stored in the credential store as ${apiKeyRef}, never in configuration files.`,
    },
    {
      path: ['baseUrl'],
      group: 'connection',
      kind: 'text',
      label: 'API base',
      placeholder: 'https://api.cline.bot/api/v1',
      format: (value) => String(value || ''),
      parse: (text) => {
        const value = String(text).trim()
        return value === '' ? { kind: 'clear' } : { kind: 'set', value }
      },
    },
    {
      path: ['filterModelsByPlan'],
      group: 'models',
      kind: 'boolean',
      label: 'Hide out-of-plan models',
      hint: 'Fails open when the plan cannot be resolved.',
      format: boolFormat,
      parse: boolParse,
    },
    {
      path: ['webSearch'],
      group: 'models',
      kind: 'boolean',
      label: 'Serve web search with ClineBot',
      format: boolFormat,
      parse: boolParse,
    },
    {
      path: ['showSidebarQuota'],
      group: 'models',
      kind: 'boolean',
      label: 'Show sidebar quota card',
      format: boolFormat,
      parse: boolParse,
    },
    {
      path: ['activeAccount'],
      group: 'advanced',
      kind: 'text',
      label: 'Active account',
      hint: 'An account id, or auto to follow the rotation order.',
      options: [
        { value: 'auto', label: 'Automatic (rotation order)' },
        ...accounts.map((account) => ({
          value: String(account.apiKeyEnv || ''),
          label: String(account.label || account.apiKeyEnv || ''),
        })).filter((option) => option.value !== ''),
      ],
      format: (value) => (typeof value === 'string' && value.trim() !== '' ? value.trim() : 'auto'),
      parse: (text) => {
        const value = String(text).trim()
        return value === '' || value === 'auto' ? { kind: 'clear' } : { kind: 'set', value }
      },
    },
    {
      path: ['contextWindow'],
      group: 'advanced',
      kind: 'number',
      label: 'Global context window',
      hint: '0 follows the catalog; per-model overrides win.',
      format: (value) => (Number(value) > 0 ? String(Number(value)) : ''),
      parse: (text) => {
        const value = Number(text)
        return Number.isFinite(value) && value > 0 ? { kind: 'set', value: Math.trunc(value) } : { kind: 'clear' }
      },
    },
    {
      path: ['maxOutputTokens'],
      group: 'advanced',
      kind: 'number',
      label: 'Output cap (-1 derived, 0 omit)',
      hint: 'A positive value tightens the model output cap; 0 sends no max_tokens.',
      format: (value) => String(Number.isFinite(Number(value)) ? Number(value) : -1),
      parse: (text) => {
        const value = Number(text)
        return Number.isInteger(value) && value >= -1 ? { kind: 'set', value } : undefined
      },
    },
    {
      path: ['statsRetentionDays'],
      group: 'advanced',
      kind: 'number',
      label: 'Stats retention (days)',
      hint: 'Trim day/hour/session telemetry; 0 keeps everything.',
      format: (value) => (Number(value) > 0 ? String(Number(value)) : ''),
      parse: (text) => {
        const value = Number(text)
        return Number.isFinite(value) && value >= 0 ? { kind: 'set', value } : { kind: 'clear' }
      },
    },
    {
      path: ['dailyBudgetUsd'],
      group: 'advanced',
      kind: 'number',
      label: 'Daily budget (USD)',
      hint: 'Estimated spend guard; 0 disables it.',
      format: (value) => (Number(value) > 0 ? String(Number(value)) : ''),
      parse: (text) => {
        const value = Number(text)
        return Number.isFinite(value) && value >= 0 ? { kind: 'set', value } : { kind: 'clear' }
      },
    },
    {
      path: ['monthlyBudgetUsd'],
      group: 'advanced',
      kind: 'number',
      label: 'Monthly budget (USD)',
      hint: 'Estimated spend guard; 0 disables it.',
      format: (value) => (Number(value) > 0 ? String(Number(value)) : ''),
      parse: (text) => {
        const value = Number(text)
        return Number.isFinite(value) && value >= 0 ? { kind: 'set', value } : { kind: 'clear' }
      },
    },
  ]

  return {
    ns: 'dsh-clinebot',
    title: 'ClineBot',
    descriptions: { en: 'ClineBot (ClinePass) connection and model controls.', zh: 'ClineBot（ClinePass）连接与模型设置。' },
    groups: [
      { id: 'connection', title: 'Connection', descriptions: { zh: '连接' } },
      { id: 'models', title: 'Models', descriptions: { zh: '模型' } },
      { id: 'advanced', title: 'Advanced', descriptions: { zh: '高级' } },
    ],
    fields,
  }
}

/**
 * Register the TUI section when the host provides the seam.
 * @param {object} ctx
 * @param {{ live: () => Record<string, unknown> }} deps
 */
export function applyTuiSettings(ctx, { live }) {
  if (typeof ctx?.inject !== 'function') return
  ctx.inject(['tuiSettingsSections'], (tuiCtx) => {
    let service
    try {
      service = tuiCtx?.tuiSettingsSections || tuiCtx?.get?.('tuiSettingsSections')
    } catch {
      service = undefined
    }
    if (!service || typeof service.register !== 'function') return
    try {
      const dispose = service.register(buildTuiSection({ live }))
      if (typeof ctx.effect === 'function') {
        ctx.effect(() => () => {
          try { dispose() } catch {}
        }, 'dsh-clinebot: tui settings')
      }
    } catch (error) {
      ctx?.logger?.warn?.('[dsh-clinebot] Could not register TUI settings: ' + (error?.message || error))
    }
  })
}
