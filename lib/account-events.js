import { readFileSync, writeFileSync, renameSync, mkdirSync, existsSync } from 'node:fs'
import path from 'node:path'
import { resolvePath } from './stats-storage.js'

const MAX_EVENTS = 200
const EVENT_TYPES = new Set(['cooldown', 'recover', 'route'])

let events = []
let activePath = ''
let saveTimer = null

function clean(value, max = 240) {
  return String(value ?? '').trim().slice(0, max)
}

function sanitize(input = {}) {
  const type = clean(input.type, 20).toLowerCase()
  if (!EVENT_TYPES.has(type)) return null
  const event = {
    at: Number.isFinite(Number(input.at)) ? Number(input.at) : Date.now(),
    type,
    accountId: clean(input.accountId, 160),
    reason: clean(input.reason, 120),
  }
  if (Number.isFinite(Number(input.until))) event.until = Number(input.until)
  if (input.sessionId) event.sessionId = clean(input.sessionId, 160)
  return event.accountId ? event : null
}

export function loadAccountEvents(customPath) {
  const file = customPath ? resolvePath(customPath) : ''
  activePath = file
  events = []
  if (!file || !existsSync(file)) return []
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8'))
    const source = Array.isArray(parsed) ? parsed : parsed?.events
    events = Array.isArray(source) ? source.map(sanitize).filter(Boolean).slice(-MAX_EVENTS) : []
  } catch {
    events = []
  }
  return events
}

export function recordAccountEvent(input) {
  const event = sanitize(input)
  if (!event) return null
  events.push(event)
  if (events.length > MAX_EVENTS) events = events.slice(-MAX_EVENTS)
  if (activePath && !saveTimer) {
    saveTimer = setTimeout(() => {
      saveTimer = null
      flushAccountEvents()
    }, 250)
    saveTimer.unref?.()
  }
  return event
}

export function getAccountEvents(limit = 50) {
  const safeLimit = Math.max(1, Math.min(MAX_EVENTS, Number(limit) || 50))
  return events.slice(-safeLimit).reverse().map((event) => ({ ...event }))
}

export function flushAccountEvents() {
  if (saveTimer) {
    clearTimeout(saveTimer)
    saveTimer = null
  }
  if (!activePath) return
  if (events.length === 0 && !existsSync(activePath)) return
  try {
    mkdirSync(path.dirname(activePath), { recursive: true })
    const temp = `${activePath}.${Date.now()}.tmp`
    writeFileSync(temp, JSON.stringify({ version: 1, events }, null, 2), 'utf8')
    renameSync(temp, activePath)
  } catch {
    /* event history is best-effort */
  }
}

