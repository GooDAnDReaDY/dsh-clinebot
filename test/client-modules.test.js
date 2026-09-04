import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import vm from "node:vm"
import { fileURLToPath } from "node:url"
import path from "node:path"

const root = fileURLToPath(new URL("../", import.meta.url))

const ReactStub = { createElement: () => null }

function loadClientRecord() {
  const source = readFileSync(path.join(root, "lib", "client.js"), "utf8")
  const records = []
  const sandbox = {
    window: {
      __ModuleLoader__: {
        load(record) {
          records.push(record)
        },
      },
    },
  }
  vm.createContext(sandbox)
  vm.runInContext(source, sandbox, { filename: "lib/client.js" })
  assert.equal(records.length, 1)
  return records[0]
}

function strictRequire(seen) {
  return (spec) => {
    if (spec === "react") {
      seen.push(spec)
      return ReactStub
    }
    throw new Error("client-modules: require(" + JSON.stringify(spec) + ") missed the module table")
  }
}

test("client: bundle registers under the kernel module loader id", () => {
  const record = loadClientRecord()
  assert.equal(record.id, "@goodandready/dsh-clinebot")
})

test("client: factory materializes with a strict module table", () => {
  const record = loadClientRecord()
  const seen = []
  const exports = record.factory(strictRequire(seen))
  assert.deepEqual(Array.from(exports.inject), ["slots"])
  assert.equal(typeof exports.apply, "function")
  assert.equal(seen.includes("@deepseek-ai/dsh-client-ui-primitives"), false)
})

test("client: apply registers settings.section and settings.plugin.item", () => {
  const record = loadClientRecord()
  const exports = record.factory(strictRequire([]))
  const registrations = []
  const injected = []
  const ctx = {
    slots: {
      inject(name, cb) {
        injected.push(name)
        cb()
      },
      register(decl) {
        registrations.push(decl)
      },
    },
  }
  exports.apply(ctx)
  assert.deepEqual(injected.slice().sort(), ["settings.plugin.item", "settings.section"])
  assert.equal(registrations.length, 2)
})

test("client: dsh.client.inject names only modules the factory resolves", () => {
  const pkg = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8"))
  const source = readFileSync(path.join(root, "lib", "client.js"), "utf8")
  const specifiers = Array.from(source.matchAll(/require\((\x22)(.+?)\1\)/g), (m) => m[2])
  for (const spec of specifiers) {
    assert.equal(spec.startsWith("@deepseek-ai/"), false, "client.js requires a module missing from the kernel table: " + spec)
  }
  const inject = (pkg.dsh && pkg.dsh.client && pkg.dsh.client.inject) || []
  for (const name of inject) {
    assert.equal(name.startsWith("@deepseek-ai/"), false, "dsh.client.inject names a module missing from the kernel table: " + name)
    assert.ok(specifiers.includes(name), "dsh.client.inject names a module the factory never requires: " + name)
  }
})
