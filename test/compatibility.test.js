import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))

test('compatibility: DSH 0.2.1 prerelease line is accepted', () => {
  const range = '>=0.2.1-rc.2 <0.2.2-0'
  assert.equal(manifest.engines.dsh, range)
  assert.equal(manifest.dsh.compatibility.dsh, range)
  assert.equal(manifest.dsh.compatibility.dshReleases['0.2.1-rc.2'], 'compatible')
  assert.equal(manifest.dsh.compatibility.dshReleases['0.2.1-rc.3'], 'compatible')
  for (const peer of [
    '@deepseek-ai/dsh-attachment',
    '@deepseek-ai/dsh-commands',
    '@deepseek-ai/dsh-credentials',
    '@deepseek-ai/dsh-host-webserver',
    '@deepseek-ai/dsh-llm',
    '@deepseek-ai/dsh-settings',
    '@deepseek-ai/dsh-web',
  ]) {
    assert.equal(manifest.peerDependencies[peer], range, peer)
  }
})
