import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import path from "node:path"

const root = fileURLToPath(new URL("../", import.meta.url))

test("host: lib/index.js registers settings namespace via ctx.inject(['settings'])", () => {
  const indexSource = readFileSync(path.join(root, "lib", "index.js"), "utf8")

  // 1. Must use ctx.inject(['settings'], ...)
  assert.ok(
    indexSource.includes("ctx.inject(['settings']") || indexSource.includes('ctx.inject(["settings"]'),
    "lib/index.js must register settings inside ctx.inject(['settings'], (sctx) => ...)"
  )

  // 2. Must register NS, Config with base options
  assert.ok(
    indexSource.includes("sctx.settings.register(NS, Config, { base: config })"),
    "sctx.settings.register must be called with NS, Config, { base: config }"
  )

  // 3. Must not call bare ctx.get('settings') synchronously in apply
  assert.ok(
    !indexSource.includes("const settingsService = ctx.get('settings')"),
    "Synchronous ctx.get('settings') must not be used in apply"
  )

  // 4. Must use scope.watch to sync live provider state
  assert.ok(
    indexSource.includes("scope.watch"),
    "scope.watch must be used to observe settings changes"
  )
})

test("host: resolveKeyValue uses ctx.get('credentials') safely without bare property access", () => {
  const indexSource = readFileSync(path.join(root, "lib", "index.js"), "utf8")

  // Check safe credentials resolution:
  assert.ok(
    indexSource.includes("(ctx?.get && ctx.get('credentials')) || ctx?.credentials"),
    "resolveKeyValue must check ctx.get('credentials')"
  )
  assert.ok(
    !indexSource.includes("if (ctx?.credentials && typeof ctx.credentials.resolve"),
    "Unsafe bare ctx.credentials property access must not be used"
  )
})