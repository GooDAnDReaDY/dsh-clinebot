export function safeDict(source) {
  const out = Object.create(null)
  if (source && typeof source === 'object') {
    for (const key of Object.keys(source)) out[key] = source[key]
  }
  return out
}

export function safeNestedDict(source) {
  const out = Object.create(null)
  if (source && typeof source === 'object') {
    for (const key of Object.keys(source)) out[key] = safeDict(source[key])
  }
  return out
}

export function setOwn(target, key, value) {
  Object.defineProperty(target, key, {
    value,
    writable: true,
    enumerable: true,
    configurable: true,
  })
  return target
}
