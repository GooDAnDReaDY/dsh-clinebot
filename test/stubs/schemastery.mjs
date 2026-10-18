/**
 * Minimal stand-in for `@deepseek-ai/schemastery`, for tests only.
 *
 * `lib/config.js` builds its schema at import time, so importing it at all needs
 * this builder surface to exist. Three behaviours matter to the code under test,
 * and all three are reproduced faithfully:
 *
 *  - every builder method is chainable and returns the same schema object, so the
 *    `.default(...).description(...).volatile()` chains in `lib/config.js` read
 *    exactly as they do against the real module;
 *  - schemas inherit from a shared prototype, which `lib/config.js` patches when
 *    the installed version lacks `.volatile()` — the real module exposes one too,
 *    so that branch has something to write to;
 *  - a field schema records `meta.volatile` when `.volatile()` is called, and
 *    `z.object()` exposes its field map as `.dict` — the two internals
 *    `volatileConfig()` reads to decide which fields DSH publishes.
 *
 * Nothing here validates or coerces values: `Config` itself is never exercised by
 * the suite, only the plain-function helpers around it.
 */

const proto = {}

function schema(meta = {}) {
  const s = Object.create(proto)
  s.meta = meta
  s.dict = {}
  s.default = (value) => { s.meta.default = value; return s }
  s.description = (text) => { s.meta.description = text; return s }
  s.required = () => { s.meta.required = true; return s }
  s.volatile = () => { s.meta.volatile = true; return s }
  s.extra = (key, value) => { s.meta[key] = value; return s }
  return s
}

const z = {
  prototype: proto,
  object(fields) {
    const s = schema()
    s.dict = fields && typeof fields === 'object' ? fields : {}
    return s
  },
  dict: () => schema(),
  array: () => schema(),
  union: () => schema(),
  string: () => schema(),
  boolean: () => schema(),
  number: () => schema(),
  any: () => schema(),
}

export default z
