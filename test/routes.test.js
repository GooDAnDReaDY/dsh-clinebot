import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
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
  const routesDir = path.join(root, 'lib', 'routes')
  const routeSources = readdirSync(routesDir)
    .filter((f) => f.endsWith('.js'))
    .map((f) => readFileSync(path.join(routesDir, f), 'utf8'))
  const allSource = [indexSource, ...routeSources].join('\n')
  
  // Anti-patterns check:
  assert.equal(allSource.includes('web.registerRoute'), false, 'Banned method web.registerRoute must not be used')
  assert.equal(allSource.includes('settingsApi?.set'), false, 'Banned method settingsApi.set must not be used (use replace)')
  assert.equal(allSource.includes('settingsApi.set'), false, 'Banned method settingsApi.set must not be used')

  // Find all registered paths
  const pathMatches = Array.from(allSource.matchAll(/path:\s*['"]([^'"]+)['"]/g), (m) => m[1])
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
    assert.ok(pathMatches.includes(exp), `Expected route ${exp} to be registered in server routes`)
  }

  // Check that all paths start with /dsh-clinebot
  for (const p of pathMatches) {
    assert.ok(p.startsWith('/dsh-clinebot'), `Path ${p} must start with /dsh-clinebot`)
  }

  // Check that updater route is also mounted
  assert.ok(indexSource.includes('registerPluginUpdater'), 'registerPluginUpdater must be called in lib/index.js')
})

test('routes: client.js renders error banner with retry button on failure', () => {
  const clientSource = readFileSync(path.join(root, 'lib', 'client.js'), 'utf8')
  assert.ok(clientSource.includes('cb-alert-err'), 'Client must render error banner if loading fails')
  assert.ok(clientSource.includes("t('settings.retry')"), 'Client must render localized retry button')
})

test('commands: lib/index.js registers /cline command with subcommands', () => {
  const indexSource = readFileSync(path.join(root, 'lib', 'index.js'), 'utf8')
  const slashSource = readFileSync(path.join(root, 'lib', 'slash-command.js'), 'utf8')
  const allCmdSource = indexSource + '\n' + slashSource
  assert.ok(allCmdSource.includes("name: 'cline'"), 'Slash command /cline must be registered')
  assert.ok(allCmdSource.includes("subcmd === 'ping'"), 'Subcommand /cline ping must be supported')
  assert.ok(allCmdSource.includes("subcmd === 'test'"), 'Subcommand /cline test must be supported')
  assert.ok(allCmdSource.includes("subcmd === 'rotate'"), 'Subcommand /cline rotate must be supported')
  assert.ok(allCmdSource.includes("|| 'quota'"), 'Default subcommand must be quota')
  assert.ok(allCmdSource.includes("isSupportedModel(param, pub.dynamicModels)"), 'Subcommand /cline test must validate models via isSupportedModel')
  assert.equal(slashSource.includes('Всего моделей'), false, 'slash output must not hardcode Russian')
  assert.ok(slashSource.includes('Total models'), 'models summary is English')
})
