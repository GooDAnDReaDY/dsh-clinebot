import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const root = fileURLToPath(new URL('../', import.meta.url))

test('decomposition: all server modules are <= 600 lines', () => {
  const libFiles = [
    'lib/access.js',
    'lib/account-pool.js',
    'lib/cline-client.js',
    'lib/config.js',
    'lib/http.js',
    'lib/index.js',
    'lib/models.js',
    'lib/provider-sync.js',
    'lib/slash-command.js',
    'lib/updater.js',
    'lib/routes/accounts.js',
    'lib/routes/auth.js',
    'lib/routes/models.js',
    'lib/routes/settings.js',
  ]

  for (const rel of libFiles) {
    const content = readFileSync(path.join(root, rel), 'utf8')
    const lineCount = content.split('\n').length
    assert.ok(
      lineCount <= 600,
      `Module ${rel} exceeds 600 lines limit: ${lineCount} lines`
    )
  }
})

test('decomposition: all client source files in src/client are <= 500 lines', () => {
  function getJsFiles(dir) {
    let results = []
    const list = readdirSync(dir)
    for (const file of list) {
      const full = path.join(dir, file)
      const stat = statSync(full)
      if (stat && stat.isDirectory()) {
        results = results.concat(getJsFiles(full))
      } else if (file.endsWith('.js')) {
        results.push(full)
      }
    }
    return results
  }

  const clientFiles = getJsFiles(path.join(root, 'src', 'client'))
  assert.ok(clientFiles.length >= 10, 'Expected at least 10 modular client source files')

  for (const full of clientFiles) {
    const rel = path.relative(root, full)
    const content = readFileSync(full, 'utf8')
    const lineCount = content.split('\n').length
    assert.ok(
      lineCount <= 500,
      `Client source file ${rel} exceeds 500 lines limit: ${lineCount} lines`
    )
  }
})

test('decomposition: generated lib/client.js satisfies DSH Store limit (<= 256 KiB)', () => {
  const clientStat = statSync(path.join(root, 'lib', 'client.js'))
  assert.ok(
    clientStat.size <= 262144,
    `lib/client.js size (${clientStat.size} bytes) exceeds 262144 bytes limit`
  )
})

test('decomposition: exported domain functions and objects exist', async () => {
  const access = await import('../lib/access.js')
  assert.equal(typeof access.isTrustedSettingsRequest, 'function')
  assert.equal(typeof access.assertTrustedSettingsRequest, 'function')

  const pool = await import('../lib/account-pool.js')
  assert.equal(typeof pool.resolveAccountPool, 'function')
  assert.equal(typeof pool.rotateToNextAccount, 'function')
  assert.equal(typeof pool.isAccountQuotaExhausted, 'function')

  // Static export checks on peer-dependent modules
  const configSource = readFileSync(path.join(root, 'lib', 'config.js'), 'utf8')
  assert.ok(configSource.includes('export const Config ='), 'Config schema must be exported')
  assert.ok(configSource.includes('export function publicConfig'), 'publicConfig helper must be exported')
  assert.ok(configSource.includes("export const NS = 'dsh-clinebot'"), 'NS must be exported')

  const syncSource = readFileSync(path.join(root, 'lib', 'provider-sync.js'), 'utf8')
  assert.ok(syncSource.includes('export async function buildStatus'), 'buildStatus must be exported')
  assert.ok(syncSource.includes('export async function upsertPiAiProvider'), 'upsertPiAiProvider must be exported')
  assert.ok(syncSource.includes('export async function removePiAiProvider'), 'removePiAiProvider must be exported')

  const settingsRoutes = readFileSync(path.join(root, 'lib', 'routes', 'settings.js'), 'utf8')
  assert.ok(settingsRoutes.includes('export function registerSettingsRoutes'), 'registerSettingsRoutes must be exported')

  const accountsRoutes = readFileSync(path.join(root, 'lib', 'routes', 'accounts.js'), 'utf8')
  assert.ok(accountsRoutes.includes('export function registerAccountsRoutes'), 'registerAccountsRoutes must be exported')

  const modelsRoutes = readFileSync(path.join(root, 'lib', 'routes', 'models.js'), 'utf8')
  assert.ok(modelsRoutes.includes('export function registerModelsRoutes'), 'registerModelsRoutes must be exported')

  const authRoutes = readFileSync(path.join(root, 'lib', 'routes', 'auth.js'), 'utf8')
  assert.ok(authRoutes.includes('export function registerAuthRoutes'), 'registerAuthRoutes must be exported')

  const slash = readFileSync(path.join(root, 'lib', 'slash-command.js'), 'utf8')
  assert.ok(slash.includes('export function registerSlashCommand'), 'registerSlashCommand must be exported')
})
