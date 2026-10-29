// The interactive map can display the last collection while one refreshes.
// The original /api/alerts path still awaits collection for upkeep callers.
export async function mapAlerts(weather, defer, onCollected) {
  const cached = await weather.read('alerts/us');
  if (!cached) {
    const result = await weather.alerts();
    defer(() => onCollected(result));
    return result;
  }
  defer(async () => {
    let result = null;
    try { result = await weather.alerts(); }
    finally { await onCollected(result); }
  });
  return {...cached.data, revision:cached.revision, collected_at:cached.checked_at,
    stale:!!cached.error || weather.clock() * 1000 - Date.parse(cached.checked_at) > 90000,
    error:cached.error || null};
}
