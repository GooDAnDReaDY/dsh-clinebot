import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8')

function keysOf(file, variable) {
  const sandbox = {}
  vm.runInNewContext(`${read(file)}\n;__keys = Object.keys(${variable})`, sandbox)
  return sandbox.__keys
}

function walk(rel) {
  const dir = path.join(root, rel)
  const files = []
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name)
    if (fs.statSync(full).isDirectory()) files.push(...walk(path.join(rel, name)))
    else if (full.endsWith('.js')) files.push(full)
  }
  return files
}

test('locales: dictionaries stay aligned and do not accumulate dead keys', () => {
  const en = keysOf('src/client/locales.js', 'en')
  const zh = keysOf('src/client/locales-zh.js', 'zh')
  const missingZh = en.filter((key) => !zh.includes(key))
  const missingEn = zh.filter((key) => !en.includes(key))
  assert.equal(missingZh.length, 0, 'keys missing from zh: ' + missingZh.join(', '))
  assert.equal(missingEn.length, 0, 'keys missing from en: ' + missingEn.join(', '))

  const usage = [
    ...walk('src/client').filter((file) => !/locales(-zh)?\.js$/.test(file)),
    ...walk('lib'),
  ].map((file) => fs.readFileSync(file, 'utf8')).join('\n')
  const dynamicPrefixes = [...usage.matchAll(/t\(\s*`([^`]*)`/g)]
    .map((match) => match[1].split('${')[0])
    .filter(Boolean)
  const candidates = en.filter((key) => (
    !usage.includes(key) && !dynamicPrefixes.some((prefix) => key.startsWith(prefix))
  ))
  assert.equal(candidates.length, 0, 'unused locale keys found: ' + candidates.join(', '))
})
