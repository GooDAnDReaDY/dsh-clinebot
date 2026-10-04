/**
 * Dedicated Loopback Proxy Server (Issues GH #12, #195)
 *
 * Runs an isolated loopback HTTP server bound exclusively to 127.0.0.1 (ephemeral port).
 * Completely bypasses DSH Desktop 2.x DesktopWebServer route fencing (`permits(req)`
 * requiring `x-dsh-desktop-renderer` header), allowing Node.js host LLM requests to
 * connect cleanly to loopback proxy endpoints without encountering HTTP 403 "forbidden".
 */

import http from 'node:http'
import { createChatCompletionsHandler, createModelsHandler } from './routes/proxy.js'

let activeProxyServer = null
let activeProxyPort = null
let startingPromise = null

export function getProxyPort() {
  return activeProxyPort
}

export function resetProxyServerState() {
  if (activeProxyServer) {
    try {
      activeProxyServer.close()
    } catch {
      /* ignore */
    }
  }
  activeProxyServer = null
  activeProxyPort = null
  startingPromise = null
}

export async function detectHostWebServerFence(port) {
  if (!port || typeof port !== 'number' || port <= 0) return false
  try {
    const res = await fetch(`http://127.0.0.1:${port}/dsh-clinebot/v1/models`, {
      method: 'GET',
      signal: AbortSignal.timeout(1000),
    })
    if (res.status === 403) {
      const text = await res.text().catch(() => '')
      if (text.trim().toLowerCase() === 'forbidden') {
        return true
      }
    }
  } catch {
    return false
  }
  return false
}

export async function startLoopbackProxyServer(ctx, routeEnv) {
  if (activeProxyServer && activeProxyPort) {
    return activeProxyPort
  }
  if (startingPromise) {
    return startingPromise
  }

  startingPromise = (async () => {
    try {
      const chatHandler = createChatCompletionsHandler(ctx, routeEnv)
      const modelsHandler = createModelsHandler(ctx, routeEnv)

      const server = http.createServer(async (req, res) => {
        try {
          const rawUrl = req.url || '/'
          const path = rawUrl.split('?')[0].replace(/\/+$/, '')
          if (path === '/dsh-clinebot/v1/chat/completions') {
            await chatHandler(req, res)
            return
          }
          if (path === '/dsh-clinebot/v1/models') {
            await modelsHandler(req, res)
            return
          }
          res.statusCode = 404
          res.setHeader('Content-Type', 'application/json; charset=utf-8')
          res.end(JSON.stringify({ ok: false, error: 'Not found' }))
        } catch (err) {
          if (!res.headersSent) {
            res.statusCode = 500
            res.setHeader('Content-Type', 'application/json; charset=utf-8')
            res.end(JSON.stringify({ ok: false, error: String(err?.message || err) }))
          }
        }
      })

      const port = await new Promise((resolve, reject) => {
        server.on('error', (err) => {
          ctx?.logger?.warn?.(`[dsh-clinebot:proxy-server] Server error: ${err?.message || err}`)
          reject(err)
        })
        server.listen(0, '127.0.0.1', () => {
          const addr = server.address()
          const assignedPort = typeof addr === 'object' && addr?.port ? addr.port : null
          if (!assignedPort) {
            reject(new Error('Failed to obtain assigned ephemeral port'))
            return
          }
          if (typeof server.unref === 'function') {
            server.unref()
          }
          resolve(assignedPort)
        })
      })

      activeProxyServer = server
      activeProxyPort = port
      ctx?.logger?.info?.(`[dsh-clinebot:proxy-server] Dedicated loopback proxy listening on 127.0.0.1:${port}`)
      return port
    } catch (err) {
      ctx?.logger?.warn?.(`[dsh-clinebot:proxy-server] Failed to bind dedicated loopback proxy server: ${err?.message || err}`)
      activeProxyServer = null
      activeProxyPort = null
      return null
    } finally {
      startingPromise = null
    }
  })()

  return startingPromise
}

export async function stopLoopbackProxyServer() {
  if (!activeProxyServer) return
  const server = activeProxyServer
  activeProxyServer = null
  activeProxyPort = null
  startingPromise = null
  return new Promise((resolve) => {
    server.close(() => {
      resolve()
    })
  })
}

export async function getOrStartProxyPort(ctx, routeEnv) {
  if (activeProxyPort) return activeProxyPort
  if (routeEnv) {
    return await startLoopbackProxyServer(ctx, routeEnv)
  }
  return null
}
