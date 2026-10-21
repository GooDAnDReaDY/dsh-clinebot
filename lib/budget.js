/**
 * Estimated-spend budget guard.
 *
 * ClinePass does not expose a per-token invoice; spend comes from the local
 * price table and is therefore explicit about being an estimate. A guard of 0
 * disables the corresponding limit.
 */

/**
 * @param {{ dailyBudgetUsd?: number, monthlyBudgetUsd?: number }} config
 * @param {{ dayCost?: number, monthCost?: number }} spend
 * @returns {{ blocked: boolean, scope: 'daily'|'monthly'|null, spent: number, limit: number }}
 */
export function budgetStatus(config, spend) {
  const dailyLimit = Math.max(0, Number(config?.dailyBudgetUsd) || 0)
  const monthlyLimit = Math.max(0, Number(config?.monthlyBudgetUsd) || 0)
  const dayCost = Math.max(0, Number(spend?.dayCost) || 0)
  const monthCost = Math.max(0, Number(spend?.monthCost) || 0)

  if (dailyLimit > 0 && dayCost >= dailyLimit) {
    return { blocked: true, scope: 'daily', spent: dayCost, limit: dailyLimit }
  }
  if (monthlyLimit > 0 && monthCost >= monthlyLimit) {
    return { blocked: true, scope: 'monthly', spent: monthCost, limit: monthlyLimit }
  }
  return { blocked: false, scope: null, spent: 0, limit: 0 }
}

/**
 * Human-readable error for an exhausted budget guard.
 * @param {ReturnType<typeof budgetStatus>} status
 */
export function budgetErrorMessage(status) {
  if (!status?.blocked) return ''
  const label = status.scope === 'monthly' ? 'Monthly' : 'Daily'
  return `${label} ClineBot budget reached (estimated $${status.spent.toFixed(4)} of $${status.limit.toFixed(2)}). Raise the limit in Settings -> ClineBot -> Advanced.`
}
