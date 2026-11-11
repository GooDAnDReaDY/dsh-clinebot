import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { saveModelsDiskCache } from '../lib/models-cache.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..')

test('#327: AGENTS.md, index.md and deploy.sh exist and deploy.sh is executable', async () => {
  const agentsStat = await fs.stat(path.join(rootDir, 'AGENTS.md'))
  assert.ok(agentsStat.isFile())
  assert.ok(agentsStat.size > 0)

  const indexStat = await fs.stat(path.join(rootDir, 'index.md'))
  assert.ok(indexStat.isFile())
  assert.ok(indexStat.size > 0)

  const deployStat = await fs.stat(path.join(rootDir, 'deploy.sh'))
  assert.ok(deployStat.isFile())
  assert.ok(deployStat.mode & 0o111, 'deploy.sh should be executable')
})

test('#328: scripts/publish-github.sh excludes scripts and test from mirror tree', async () => {
  const scriptContent = await fs.readFile(path.join(rootDir, 'scripts/publish-github.sh'), 'utf8')
  // Extract EXTRA_ALLOW block
  const extraAllowMatch = scriptContent.match(/EXTRA_ALLOW=\(([\s\S]*?)\)/)
  assert.ok(extraAllowMatch, 'EXTRA_ALLOW block found')
  const extraAllowContent = extraAllowMatch[1]
  assert.ok(!extraAllowContent.includes('"scripts"'), 'EXTRA_ALLOW must not include scripts')
  assert.ok(!extraAllowContent.includes('"test"'), 'EXTRA_ALLOW must not include test')

  // Extract FORBIDDEN block
  const forbiddenMatch = scriptContent.match(/FORBIDDEN=\(([\s\S]*?)\)/)
  assert.ok(forbiddenMatch, 'FORBIDDEN block found')
  const forbiddenContent = forbiddenMatch[1]
  assert.ok(forbiddenContent.includes('"scripts"'), 'FORBIDDEN must include scripts')
  assert.ok(forbiddenContent.includes('"test"'), 'FORBIDDEN must include test')
})

test('#329: saveModelsDiskCache logs warning on disk failure when logger is provided', async () => {
  const warnings = []
  const mockLogger = {
    warn: (msg) => warnings.push(msg),
  }
  const illegalPath = '/dev/null/not_a_directory/cache.json'
  const result = await saveModelsDiskCache(illegalPath, [{ id: 'test' }], 0, { logger: mockLogger })
  assert.strictEqual(result, false)
  assert.ok(warnings.length > 0)
  assert.ok(warnings[0].includes('Failed to save models disk cache'))
})
