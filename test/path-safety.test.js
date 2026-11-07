import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { isSafeDataPath } from '../lib/path-safety.js'

test('path-safety: data paths stay inside DSH_HOME', () => {
  const previous = process.env.DSH_HOME
  const home = path.join(process.env.TEMP || process.env.TMP || '.', 'clinebot-path-safety')
  process.env.DSH_HOME = home
  fs.mkdirSync(home, { recursive: true })
  try {
    assert.equal(isSafeDataPath(home), false)
    assert.equal(isSafeDataPath(path.join(home, 'stats.json')), true)
    assert.equal(isSafeDataPath(path.join(home, 'profiles', 'web', 'package.json')), false)
    assert.equal(isSafeDataPath(path.join(home, 'settings.yaml')), false)
    assert.equal(isSafeDataPath(path.join(home, '..', 'package.json')), false)
    assert.equal(isSafeDataPath(path.join(process.env.TEMP || process.env.TMP || '.', 'outside.json')), false)
    assert.equal(isSafeDataPath(''), true)
    assert.equal(isSafeDataPath('~/.dsh/clinebot-stats.json'), true)
    assert.equal(isSafeDataPath('~/.dsh/profiles/web/clinebot-custom.json'), true)
    assert.equal(isSafeDataPath('~/.dsh/../escape.json'), false)
    assert.equal(isSafeDataPath('~/escape.json'), false)

    const outside = path.join(os.tmpdir(), `clinebot-outside-${process.pid}-${Date.now()}.json`)
    fs.writeFileSync(outside, '{}')
    const link = path.join(home, 'linked.json')
    const dangling = path.join(home, 'dangling.json')
    try {
      fs.symlinkSync(outside, link, 'file')
      assert.equal(isSafeDataPath(link), false, 'symlink escape must be rejected')
      fs.symlinkSync(path.join(os.tmpdir(), `clinebot-missing-${process.pid}.json`), dangling, 'file')
      assert.equal(isSafeDataPath(dangling), false, 'dangling symlink escape must be rejected')
    } catch (err) {
      if (err?.code !== 'EPERM') throw err
      // Windows may require symlink privilege; the lexical guard is still covered above.
    } finally {
      try { fs.rmSync(link, { force: true }) } catch {}
      try { fs.rmSync(dangling, { force: true }) } catch {}
      fs.rmSync(outside, { force: true })
    }
  } finally {
    if (previous === undefined) delete process.env.DSH_HOME
    else process.env.DSH_HOME = previous
  }
})
