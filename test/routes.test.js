import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const root = fileURLToPath(new URL('../', import.meta.url))

test('routes: client ROUTE_PREFIX matches registered server base path', () => {
  const clientSource = readFileSync(path.join(root, 'lib', 'client.js'), 'utf8')
  const match = clientSource.match(/const ROUTE_PREFIX = ['"]([^'"]+)['"]/)
  assert.ok(match, 'ROUTE_PREFIX must be defined in lib/client.js')
  assert.equal(match[1], '/dsh-clinebot', 'Client ROUTE_PREFIX must match server /dsh-clinebot')
})

test('routes: lib/index.js registers webServer routes with kind exact and /dsh-clinebot path prefix', () => {
  const indexSource = readFileSync(path.join(root, 'lib', 'index.js'), 'utf8')
  
  // Anti-patterns check:
  assert.equal(indexSource.includes('web.registerRoute'), false, 'Banned method web.registerRoute must not be used')
  assert.equal(indexSource.includes('settingsApi?.set'), false, 'Banned method settingsApi.set must not be used (use replace)')
  assert.equal(indexSource.includes('settingsApi.set'), false, 'Banned method settingsApi.set must not be used')

  // Find all registered paths
  const pathMatches = Array.from(indexSource.matchAll(/path:\s*['"]([^'"]+)['"]/g), (m) => m[1])
  const expectedPaths = [
    '/dsh-clinebot/status',
    '/dsh-clinebot/config',
    '/dsh-clinebot/save-key',
    '/dsh-clinebot/usage',
    '/dsh-clinebot/register',
    '/dsh-clinebot/unregister',
    '/dsh-clinebot/smoke',
    '/dsh-clinebot/models/sync',
    '/dsh-clinebot/models/toggle',
  ]

  for (const exp of expectedPaths) {
    assert.ok(pathMatches.includes(exp), `Expected route ${exp} to be registered in lib/index.js`)
  }

  // Check that all paths start with /dsh-clinebot
  for (const p of pathMatches) {
    assert.ok(p.startsWith('/dsh-clinebot'), `Path ${p} must start with /dsh-clinebot`)
  }
})

test('routes: client.js renders error banner with retry button on failure', () => {
  const clientSource = readFileSync(path.join(root, 'lib', 'client.js'), 'utf8')
  assert.ok(clientSource.includes('cb-alert-err'), 'Client must render error banner if loading fails')
  assert.ok(clientSource.includes('Повторить попытку'), 'Client must render retry button')
})
