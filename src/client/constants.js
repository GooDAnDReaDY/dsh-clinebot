const NS = 'dsh-clinebot'
const ROUTE_PREFIX = '/dsh-clinebot'
// Stable (frozen) fallback reference: useSyncExternalStore compares snapshots by
// identity (Object.is), so returning a fresh object literal causes an infinite render loop
// (React error #185 "Maximum update depth exceeded"). Keep this module-level.
const SNAPSHOT_READY = Object.freeze({ status: 'ready', view: null })

function readConfigForms(ctx) {
  if (!ctx || typeof ctx.get !== 'function') return undefined
  try { return ctx.get('configForms') || undefined } catch { return undefined }
}

// Returns the namespace's ConfigFormController snapshot — `{ status, value, … }`.
// `status` is 'loading' | 'ready' | 'unavailable'; `value` is the decoded config
// object once the namespace is ready. Consumers that only need the status must
// read `snapshot?.status`, not the snapshot itself.
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
  return React.useSyncExternalStore(subscribe, getSnapshot, () => SNAPSHOT_READY) || SNAPSHOT_READY
}
