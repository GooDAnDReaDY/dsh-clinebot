const NS = 'dsh-clinebot'
// Plugins page row seat (DSH 0.1.6-alpha.2): key = '<package name>#<row id>'.
const ROW_ID = 'dsh-clinebot'
const ROW_CONFIG_KEY = '@goodandready/dsh-clinebot#' + ROW_ID
const ROUTE_PREFIX = '/dsh-clinebot'
// Stable (frozen) fallback reference: useSyncExternalStore compares snapshots by
// identity (Object.is), so returning a fresh object literal causes an infinite render loop
// (React error #185 "Maximum update depth exceeded"). Keep this module-level.
const SNAPSHOT_READY = Object.freeze({ status: 'ready', view: null })

function readConfigForms(ctx) {
  if (!ctx || typeof ctx.get !== 'function') return undefined
  try { return ctx.get('configForms') || undefined } catch { return undefined }
}

function useConfigFormsSnapshot(ctx) {
  const scope = React.useMemo(() => {
    try { return readConfigForms(ctx)?.get?.(NS) || undefined } catch { return undefined }
  }, [ctx])
  const subscribe = React.useMemo(() => (cb) => {
    try { return scope?.subscribe ? (scope.subscribe(cb) || (() => {})) : () => {} } catch { return () => {} }
  }, [scope])
  const getSnapshot = React.useCallback(() => {
    try { return scope?.getSnapshot?.() || SNAPSHOT_READY } catch { return SNAPSHOT_READY }
  }, [scope])
  return React.useSyncExternalStore(subscribe, getSnapshot, () => SNAPSHOT_READY)?.status || 'loading'
}
