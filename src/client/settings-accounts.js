/**
 * Immediate account-pool operations. These are intentionally outside the
 * staged settings form: adding, pinning, renaming, clearing and deleting an
 * account commit on their own.
 */
function createAccountActions({ performAction, load, t, setMsg }) {
  async function handlePinAccount(accountEnv) {
    await performAction('pin-account', async () => {
      const res = await fetchWithTimeout(`${ROUTE_PREFIX}/accounts/active`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ account: accountEnv }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.ok) throw new Error(data.error || `HTTP ${res.status}`)
      await load()
    })
  }

  async function handleAddAccount({ label, apiKeyEnv, apiKey, id }) {
    await performAction('add-account', async () => {
      const endpoint = id ? `${ROUTE_PREFIX}/keys/discovered/import` : `${ROUTE_PREFIX}/accounts`
      const payload = id ? { id, label, apiKeyEnv } : { label, apiKeyEnv, apiKey }
      const res = await fetchWithTimeout(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.ok) throw new Error(data.error || `HTTP ${res.status}`)
      setMsg(t('key.saved_msg', { status: data.validated ? 'OK' : (data.validationError || 'Notice') }))
      await load()
    })
  }

  async function handleDeleteAccount(accountEnv, deleteSecret = true) {
    await performAction('delete-account', async () => {
      const res = await fetchWithTimeout(`${ROUTE_PREFIX}/accounts/delete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKeyEnv: accountEnv, deleteSecret }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.ok) throw new Error(data.error || `HTTP ${res.status}`)
      await load()
    })
  }

  async function handleRenameAccount(accountEnv, label) {
    await performAction('rename-account', async () => {
      const res = await fetchWithTimeout(`${ROUTE_PREFIX}/accounts/rename`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKeyEnv: accountEnv, label }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.ok) throw new Error(data.error || `HTTP ${res.status}`)
      await load()
    })
  }

  async function handleClearKey(accountEnv) {
    await performAction('clear-key', async () => {
      const res = await fetchWithTimeout(`${ROUTE_PREFIX}/accounts/key/clear`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKeyEnv: accountEnv }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.ok) throw new Error(data.error || `HTTP ${res.status}`)
      await load()
    })
  }

  return { handlePinAccount, handleAddAccount, handleDeleteAccount, handleRenameAccount, handleClearKey }
}
