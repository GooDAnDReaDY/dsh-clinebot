/**
 * In-memory runtime session metrics for ClinePass requests in DeepSeek Harness.
 */

export const sessionStats = {
  totalRequests: 0,
  successfulRequests: 0,
  failedRequests: 0,
  abortedRequests: 0,
  promptTokensEst: 0,
  completionTokensEst: 0,
  totalTokensEst: 0,
  lastLatencyMs: null,
  lastRequestAt: null,
  lastError: null,
  byModel: {},
  lastSmoke: null,
}

export function recordSessionRequest({
  latencyMs,
  ok,
  error,
  aborted = false,
  promptTokens = 0,
  completionTokens = 0,
  model,
}) {
  sessionStats.totalRequests += 1
  if (aborted) {
    sessionStats.abortedRequests = (sessionStats.abortedRequests || 0) + 1
  } else if (ok) {
    sessionStats.successfulRequests += 1
    sessionStats.lastLatencyMs = typeof latencyMs === 'number' ? latencyMs : null
    sessionStats.lastError = null
  } else {
    sessionStats.failedRequests += 1
    sessionStats.lastError = error || 'Request failed'
  }
  sessionStats.lastRequestAt = Date.now()
  sessionStats.promptTokensEst += Number(promptTokens) || 0
  sessionStats.completionTokensEst += Number(completionTokens) || 0
  sessionStats.totalTokensEst += (Number(promptTokens) || 0) + (Number(completionTokens) || 0)

  if (model) {
    if (!sessionStats.byModel) sessionStats.byModel = {}
    const m = sessionStats.byModel[model] || { requests: 0, promptTokens: 0, completionTokens: 0 }
    m.requests += 1
    m.promptTokens += Number(promptTokens) || 0
    m.completionTokens += Number(completionTokens) || 0
    sessionStats.byModel[model] = m
  }
}

export function recordSmokeTest({ latencyMs, ok, error, model }) {
  sessionStats.lastSmoke = {
    at: Date.now(),
    latencyMs: typeof latencyMs === 'number' ? latencyMs : null,
    ok: Boolean(ok),
    error: error || null,
    model: model || null,
  }
}

export function resetSessionStats() {
  sessionStats.totalRequests = 0
  sessionStats.successfulRequests = 0
  sessionStats.failedRequests = 0
  sessionStats.abortedRequests = 0
  sessionStats.promptTokensEst = 0
  sessionStats.completionTokensEst = 0
  sessionStats.totalTokensEst = 0
  sessionStats.lastLatencyMs = null
  sessionStats.lastRequestAt = null
  sessionStats.lastError = null
  sessionStats.byModel = {}
  sessionStats.lastSmoke = null
}
