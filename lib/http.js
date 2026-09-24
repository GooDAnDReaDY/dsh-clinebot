export function writeJson(res, code, body) {
  try {
    res.writeHead(code, {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    })
    res.end(JSON.stringify(body))
  } catch {
    /* socket already closed */
  }
}

export function readBody(req, maxBytes = 256 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let size = 0
    req.on('data', (c) => {
      size += c.length
      if (size > maxBytes) {
        reject(new Error('body too large'))
        req.destroy()
        return
      }
      chunks.push(c)
    })
    req.on('end', () => resolve(Buffer.concat(chunks)))
    req.on('error', reject)
  })
}

function header(request, name) {
  const value = request?.headers?.[name.toLowerCase()]
  return Array.isArray(value) ? value[0] : value
}

function isLoopbackAddress(value) {
  const address = String(value || '').toLowerCase().replace(/^\[|\]$/g, '')
  return address === 'localhost' || address === 'localhost.' || address === '::1'
    || address.startsWith('127.')
    || address.startsWith('::ffff:127.')
}

/** Reject cross-site writes while allowing local, LAN, and reverse-proxy UIs. */
export function isTrustedSettingsRequest(request) {
  const secFetchSite = header(request, 'sec-fetch-site')
  if (secFetchSite === 'cross-site') {
    return false
  }

  const host = header(request, 'x-forwarded-host') || header(request, 'host')
  const origin = header(request, 'origin')
  if (origin) {
    try {
      const url = new URL(origin)
      if (host && url.host.toLowerCase() === host.toLowerCase()) {
        return true
      }
      if (isLoopbackAddress(url.hostname) && isLoopbackAddress(request?.socket?.remoteAddress)) {
        return true
      }
      return false
    } catch {
      return false
    }
  }

  const referer = header(request, 'referer')
  if (referer) {
    try {
      const url = new URL(referer)
      if (host && url.host.toLowerCase() === host.toLowerCase()) {
        return true
      }
      if (isLoopbackAddress(url.hostname) && isLoopbackAddress(request?.socket?.remoteAddress)) {
        return true
      }
      return false
    } catch {
      return false
    }
  }

  // Requests without origin/referer (e.g. curl or internal requests): allow if loopback
  if (isLoopbackAddress(request?.socket?.remoteAddress)) {
    return true
  }

  // If sec-fetch-site is explicitly same-origin or same-site, allow
  if (secFetchSite === 'same-origin' || secFetchSite === 'same-site') {
    return true
  }

  return false
}

export function publicUsage(usage) {
  if (!usage || typeof usage !== 'object') return null
  const windowView = (window) => {
    if (!window || typeof window !== 'object') return null
    return {
      percentUsed: window.percentUsed,
      remainingPercent: window.remainingPercent,
      resetsAt: window.resetsAt || null,
    }
  }
  if (usage.ok === false) {
    return {
      ok: false,
      error: typeof usage.error === 'string' ? usage.error : 'usage unavailable',
      checkedAt: usage.checkedAt,
    }
  }
  return {
    ok: true,
    plan: usage.plan || null,
    user: { email: usage.user?.email || null },
    windows: {
      fiveHour: windowView(usage.windows?.fiveHour),
      weekly: windowView(usage.windows?.weekly),
      monthly: windowView(usage.windows?.monthly),
    },
    checkedAt: usage.checkedAt,
  }
}

