import test from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'
import { isSafeDataPath } from '../lib/path-safety.js'

test('path-safety: data paths stay inside DSH_HOME', () => {
  const previous = process.env.DSH_HOME
  const home = path.join(process.env.TEMP || process.env.TMP || '.', 'clinebot-path-safety')
  process.env.DSH_HOME = home
  try {
    assert.equal(isSafeDataPath(home), false)
    assert.equal(isSafeDataPath(path.join(home, 'stats.json')), true)
    assert.equal(isSafeDataPath(path.join(home, 'profiles', 'web', 'package.json')), false)
    assert.equal(isSafeDataPath(path.join(home, 'settings.yaml')), false)
    assert.equal(isSafeDataPath(path.join(home, '..', 'package.json')), false)
    assert.equal(isSafeDataPath(path.join(process.env.TEMP || process.env.TMP || '.', 'outside.json')), false)
    assert.equal(isSafeDataPath(''), true)
  } finally {
    if (previous === undefined) delete process.env.DSH_HOME
    else process.env.DSH_HOME = previous
  }
})
