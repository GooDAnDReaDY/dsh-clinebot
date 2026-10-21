import { getStatsSummary } from './stats-storage.js'

/**
 * Export the complete persisted telemetry document as JSON.
 */
export function exportStatsAsJson() {
  return JSON.stringify({
    exportedAt: new Date().toISOString(),
    stats: getStatsSummary(),
  }, null, 2)
}
