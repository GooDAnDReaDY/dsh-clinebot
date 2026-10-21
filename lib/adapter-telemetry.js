import { estimateCost } from './model-prices.js'
import { recordSessionRequest } from './telemetry.js'
import { recordUsage } from './stats-storage.js'

/**
 * Record one attempt's session and persistent telemetry.
 * Kept out of adapter.js so the adapter stays within the decomposition budget.
 */
export function recordAttemptTelemetry({
  pub,
  accountId,
  model,
  usage,
  isError,
  is429 = false,
  ttftMs,
  latencyMs,
  aborted = false,
  options,
}) {
  const promptTokens = Number(usage?.promptTokens || 0)
  const completionTokens = Number(usage?.completionTokens || 0)
  const reasoningTokens = Number(usage?.reasoningTokens || 0)
  const totalTokens = Number(usage?.totalTokens || (promptTokens + completionTokens))
  const cost = estimateCost({
    model,
    promptTokens,
    completionTokens,
    reasoningTokens,
    cacheReadTokens: usage?.cacheReadTokens,
    cacheWriteTokens: usage?.cacheWriteTokens,
    overrides: pub.priceOverrides || {},
  })

  try {
    recordSessionRequest({
      latencyMs,
      ok: !isError,
      aborted,
      promptTokens,
      completionTokens,
      reasoningTokens,
      model,
      ...(isError ? { error: is429 ? 'rate limit' : 'stream error' } : {}),
    })
  } catch {
    /* telemetry must never break inference */
  }

  try {
    recordUsage({
      model,
      accountId,
      promptTokens,
      completionTokens,
      reasoningTokens,
      totalTokens,
      isError,
      is429,
      statsPath: pub.statsPath,
      sessionId: options.sessionId ? String(options.sessionId) : undefined,
      purpose: options.purpose,
      ttftMs: ttftMs ?? undefined,
      latencyMs,
      cacheReadTokens: usage?.cacheReadTokens,
      cacheWriteTokens: usage?.cacheWriteTokens,
      cacheSavingsUsd: cost.cacheSavingsUsd,
      costUsd: cost.usd,
      priced: cost.priced,
    })
  } catch {
    /* persistent telemetry is best-effort */
  }
}
