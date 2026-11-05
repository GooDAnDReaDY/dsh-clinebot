/**
 * Credentials management helper for @goodandready/dsh-clinebot.
 * Isolates DSH Credentials storage and environment resolution.
 */

export const DEFAULT_API_KEY_ENV = 'CLINEBOT_API_KEY'
const API_KEY_ENV_RE = /^CLINEBOT_API_KEY(_[A-Z0-9]+)?$/

export function isAllowedApiKeyEnv(value) {
  return API_KEY_ENV_RE.test(String(value || '').trim())
}

function isAllowedCredentialDeletion(value) {
  const name = String(value || '').trim()
  return isAllowedApiKeyEnv(name) || name === 'CLINEBOT_LOCAL_PROXY_TOKEN'
}

/**
 * Resolve the optional credentials service without tripping Cordis's
 * strict-proxy guard on undeclared property reads.
 * @param {object | undefined} ctx
 * @returns {object | undefined}
 */
function credentialsService(ctx) {
  try {
    const viaGet = typeof ctx?.get === 'function' ? ctx.get('credentials') : undefined
    if (viaGet) return viaGet
  } catch {
    /* strict context refuses get() for a service the fiber does not inject */
  }
  try {
    return ctx ? ctx.credentials : undefined
  } catch {
    return undefined
  }
}

async function toCredentialRef(name) {
  try {
    const mod = await import('@deepseek-ai/dsh-credentials')
    if (typeof mod.credentialRef === 'function') {
      return mod.credentialRef(name)
    }
  } catch {
    /* fallback when executed in standalone unit tests outside DSH bundle */
  }
  return typeof name === 'object' && name !== null ? name : { type: 'env', name: String(name || '') }
}

export function resolveApiKey(apiKeyEnv, env = process.env) {
  const requested = String(apiKeyEnv || '').trim()
  const name = requested || DEFAULT_API_KEY_ENV
  return {
    envName: name,
    value: isAllowedApiKeyEnv(name) ? String(env[name] || '') : '',
  }
}

export async function saveCredentialKey(ctx, apiKeyEnv, apiKey) {
  const name = String(apiKeyEnv || DEFAULT_API_KEY_ENV).trim() || DEFAULT_API_KEY_ENV
  const value = String(apiKey || '').trim()

  if (!isAllowedApiKeyEnv(name)) {
    throw new Error('Disallowed apiKeyEnv: only CLINEBOT_API_KEY names are allowed')
  }
  if (!value) {
    throw new Error('API key cannot be empty')
  }

  const credentials = credentialsService(ctx)
  if (!credentials || typeof credentials.set !== 'function') {
    throw new Error('DSH credentials service is unavailable in this runtime profile')
  }

  const ref = await toCredentialRef(name)
  await credentials.set(ref, value)
  return { ok: true, envName: name }
}

export async function deleteCredentialKey(ctx, apiKeyEnv) {
  const name = String(apiKeyEnv || '').trim()
  if (!name || !isAllowedCredentialDeletion(name)) return { ok: false }
  const credentials = credentialsService(ctx)
  if (!credentials) return { ok: false }
  try {
    const ref = await toCredentialRef(name)
    if (typeof credentials.unset === 'function') {
      await credentials.unset(ref)
      return { ok: true, envName: name }
    }
  } catch (err) {
    ctx?.logger?.warn?.('[dsh-clinebot] Failed unsetting credential: ' + (err?.message || err))
  }
  return { ok: false }
}

export async function resolveKeyValue(ctx, apiKeyEnv) {
  const requested = String(apiKeyEnv || '').trim()
  const refName = requested || DEFAULT_API_KEY_ENV
  if (!isAllowedApiKeyEnv(refName)) {
    return { envName: refName, value: '', source: 'invalid' }
  }
  const creds = credentialsService(ctx)
  if (creds && typeof creds.resolve === 'function') {
    try {
      const ref = await toCredentialRef(refName)
      const hit = await creds.resolve(ref)
      if (hit?.value) {
        return { envName: refName, value: hit.value, source: 'credentials' }
      }
    } catch {
      /* miss */
    }
  }

  const fromEnv = resolveApiKey(refName)
  if (fromEnv.value) {
    return { ...fromEnv, source: 'env' }
  }

  return { envName: refName, value: '', source: 'none' }
}
