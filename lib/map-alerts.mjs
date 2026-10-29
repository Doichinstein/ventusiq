// The interactive map can display the last collection while one refreshes.
// The original /api/alerts path still awaits collection for upkeep callers.
export async function mapAlerts(weather, defer, onCollected) {
  const cached = await weather.read('alerts/us');
  if (!cached) {
    const result = await weather.alerts();
    defer(() => onCollected(result));
    return result;
  }
  const state = await weather.state('alerts/us'), now = weather.clock();
  // A cached response must not strand the browser until the next normal poll
  // when collection is already due, running, or newer than the body we read.
  // Failure cooldowns keep normal polling; this never bypasses the shared lease.
  const waiting = state.lease_until > now || state.next_fetch <= now
    || state.last_success * 1000 > Date.parse(cached.checked_at);
  const refreshAfter = waiting ? 5000 : Math.max(5000, Math.min(30000, (state.next_fetch - now) * 1000 || 30000));
  defer(async () => {
    let result = null;
    try { result = await weather.alerts(); }
    finally { await onCollected(result); }
  });
  return {...cached.data, revision:cached.revision, collected_at:cached.checked_at,
    refresh_after_ms:refreshAfter,
    stale:!!cached.error || weather.clock() * 1000 - Date.parse(cached.checked_at) > 90000,
    error:cached.error || null};
}
