/**
 * Credentials management helper for @goodandready/dsh-clinebot.
 * Isolates DSH Credentials storage and environment resolution.
 */

export const DEFAULT_API_KEY_ENV = 'CLINEBOT_API_KEY'

export async function toCredentialRef(name) {
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
  const name = String(apiKeyEnv || DEFAULT_API_KEY_ENV).trim() || DEFAULT_API_KEY_ENV
  return {
    envName: name,
    value: String(env[name] || ''),
  }
}

export async function saveCredentialKey(ctx, apiKeyEnv, apiKey) {
  const name = String(apiKeyEnv || DEFAULT_API_KEY_ENV).trim() || DEFAULT_API_KEY_ENV
  const value = String(apiKey || '').trim()

  if (!value) {
    throw new Error('API key cannot be empty')
  }

  const credentials = ctx?.credentials || ctx?.get?.('credentials')
  if (!credentials || typeof credentials.set !== 'function') {
    throw new Error('DSH credentials service is unavailable in this runtime profile')
  }

  const ref = await toCredentialRef(name)
  await credentials.set(ref, value)
  return { ok: true, envName: name }
}

export async function deleteCredentialKey(ctx, apiKeyEnv) {
  const name = String(apiKeyEnv || '').trim()
  if (!name) return { ok: false }
  const credentials = ctx?.credentials || ctx?.get?.('credentials')
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
  const refName = String(apiKeyEnv || DEFAULT_API_KEY_ENV).trim() || DEFAULT_API_KEY_ENV
  const creds = (ctx?.get && ctx.get('credentials')) || ctx?.credentials
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
