/**
 * Resolver hook: send the one DSH specifier the host half imports to the local
 * stand-in. Loaded by test/_setup.mjs through `module.register`.
 */
const STUB = new URL('./schemastery.mjs', import.meta.url).href

export async function resolve(specifier, context, nextResolve) {
  if (specifier === '@deepseek-ai/schemastery') {
    return { url: STUB, shortCircuit: true }
  }
  return nextResolve(specifier, context)
}
