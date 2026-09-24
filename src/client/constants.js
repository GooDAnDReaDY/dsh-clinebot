const NS = 'dsh-clinebot'
// Plugins page row seat (DSH 0.1.6-alpha.2): key = '<package name>#<row id>'.
const ROW_ID = 'dsh-clinebot'
const ROW_CONFIG_KEY = '@goodandready/dsh-clinebot#' + ROW_ID
const ROUTE_PREFIX = '/dsh-clinebot'
const SNAPSHOT_LOADING = Object.freeze({ status: 'loading', view: null })
// Stable (frozen) fallback reference: useSyncExternalStore compares snapshots by
// identity (Object.is), so returning a fresh object literal causes an infinite render loop
// (React error #185 "Maximum update depth exceeded"). Keep this module-level.
const SNAPSHOT_READY = Object.freeze({ status: 'ready', view: null })
