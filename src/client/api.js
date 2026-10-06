async function fetchWithTimeout(url, opts = {}, ms = 30000) {
  const controller = new AbortController()
  const timer = setTimeout(() => {
    controller.abort()
  }, ms)
  const signal = opts.signal || controller.signal
  try {
    const res = await fetch(url, { ...opts, signal })
    return res
  } catch (err) {
    if (err && (err.name === 'AbortError' || controller.signal.aborted)) {
      const sec = Math.round(ms / 1000)
      const tFn = typeof opts.t === 'function' ? opts.t : null
      const msg = tFn ? tFn('api.timeout', { seconds: sec }) : ('Request timed out (' + sec + 's)')
      throw new Error(msg)
    }
    throw err
  } finally {
    clearTimeout(timer)
  }
}
