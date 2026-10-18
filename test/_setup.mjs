/**
 * Test bootstrap, loaded by `npm test` through `node --import ./test/_setup.mjs`.
 *
 * The host half only reaches outside the package for `@deepseek-ai/schemastery`
 * (via `lib/config.js`). DSH itself provides that module at runtime, and it is
 * not installed here, so this registers a resolver that maps the specifier to a
 * local stand-in. That keeps the suite runnable from a bare clone with no
 * `npm install`, and keeps the tested logic the real thing: the stand-in only
 * supplies the builder surface `lib/config.js` calls, while the functions under
 * test (`plainConfig`, `volatileConfig`, `publicConfig`) are the shipped ones.
 *
 * Everything else the suite imports is either a `node:` builtin or a relative
 * path, so no other specifier is rewritten — an unexpected bare import fails
 * loudly instead of resolving to something surprising.
 */
import { register } from 'node:module'

const SUPPORTED = new Set(['@deepseek-ai/schemastery'])

try {
  register(new URL('./stubs/schemastery-resolver.mjs', import.meta.url), { parentURL: import.meta.url })
} catch (err) {
  // `module.register` needs Node >= 20.6. Older runtimes still run every test that
  // does not import lib/config.js; test/config.test.js skips itself in that case.
  console.warn(`[test] module resolver hook unavailable, config tests will be skipped: ${err.message}`)
}

export { SUPPORTED }
