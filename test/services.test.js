import test from 'node:test'
import assert from 'node:assert/strict'
import { migrateLegacyPiAiProvider, service } from '../lib/services.js'

test('services: service() prefers ctx.get and survives a strict proxy', () => {
  const viaGet = { name: 'via-get' }
  assert.equal(service({ get: (name) => (name === 'webServer' ? viaGet : undefined) }, 'webServer'), viaGet)

  const direct = { name: 'direct' }
  const strict = {
    get() { throw new Error('cannot get property without inject') },
    webServer: direct,
  }
  assert.equal(service(strict, 'webServer'), direct)
  assert.equal(service(undefined, 'webServer'), undefined)
})

test('services: legacy llm-pi-ai clinebot provider and proxy token are removed', async () => {
  const mutations = []
  const unset = []
  const ctx = {
    get(name) {
      if (name === 'settings') {
        return {
          describe: () => [{
            ns: 'llm-pi-ai',
            value: { providers: { clinebot: { displayName: 'legacy ClineBot' }, other: { displayName: 'Other' } } },
          }],
          mutate: async (ns, ops) => { mutations.push({ ns, ops }) },
        }
      }
      if (name === 'credentials') {
        return { unset: async (ref) => { unset.push(ref) } }
      }
      return undefined
    },
    logger: { warn() {}, info() {} },
  }

  await migrateLegacyPiAiProvider(ctx)

  assert.equal(mutations.length, 1)
  assert.equal(mutations[0].ns, 'llm-pi-ai')
  assert.deepEqual(mutations[0].ops, [{ op: 'remove', path: ['providers', 'clinebot'] }])
  assert.equal(unset.length, 1)
  assert.ok(
    JSON.stringify(unset[0]).includes('CLINEBOT_LOCAL_PROXY_TOKEN'),
    `unexpected credential reference: ${JSON.stringify(unset[0])}`
  )
})

test('services: migration is a no-op when no legacy provider exists', async () => {
  let mutated = false
  const ctx = {
    get(name) {
      if (name === 'settings') {
        return {
          describe: () => [{ ns: 'llm-pi-ai', value: { providers: { other: { displayName: 'Other' } } } }],
          mutate: async () => { mutated = true },
        }
      }
      if (name === 'credentials') return { unset: async () => {} }
      return undefined
    },
    logger: { warn() {}, info() {} },
  }

  await migrateLegacyPiAiProvider(ctx)
  assert.equal(mutated, false)
})
