/**
 * Optional-service helpers and one-time legacy lifecycle migration.
 *
 * The plugin no longer hard-injects `webServer`/`credentials`, so every read
 * must survive Cordis's strict-proxy guard and a headless profile that mounts
 * neither service.
 */

import { LLM_PI_AI_NS } from './config.js'
import { deleteCredentialKey } from './credential-refs.js'

/**
 * Read an optional service without tripping Cordis's strict-proxy guard.
 * @param {object | undefined} ctx
 * @param {string} name
 * @returns {unknown}
 */
export function service(ctx, name) {
  try {
    const viaGet = typeof ctx?.get === 'function' ? ctx.get(name) : undefined
    if (viaGet) return viaGet
  } catch {
    /* strict context refuses get() for a service the fiber does not inject */
  }
  try {
    return ctx ? ctx[name] : undefined
  } catch {
    return undefined
  }
}

/**
 * Remove the legacy `llm-pi-ai.providers.clinebot` entry and its local proxy
 * token once the native adapter owns the route. Idempotent and best-effort:
 * a failed cleanup is logged, never fatal.
 * @param {object} ctx
 */
export async function migrateLegacyPiAiProvider(ctx) {
  try {
    const svc = service(ctx, 'settings')
    if (!svc || typeof svc.describe !== 'function' || typeof svc.mutate !== 'function') return
    const descriptor = svc.describe().find((entry) => entry?.ns === LLM_PI_AI_NS)
    if (descriptor?.value?.providers?.clinebot) {
      await svc.mutate(LLM_PI_AI_NS, [{ op: 'remove', path: ['providers', 'clinebot'] }])
      ctx?.logger?.info?.('[dsh-clinebot] Removed legacy llm-pi-ai clinebot provider after adapter migration')
    }
  } catch (error) {
    ctx?.logger?.warn?.('[dsh-clinebot] Legacy llm-pi-ai provider cleanup skipped: ' + (error?.message || error))
  }
  try {
    await deleteCredentialKey(ctx, 'CLINEBOT_LOCAL_PROXY_TOKEN')
  } catch {
    /* the credential may never have existed */
  }
}
