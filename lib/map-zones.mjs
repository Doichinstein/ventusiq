// Read-only public boundary batches. Missing/old/large entries use the normal
// single-zone collector; this endpoint never fans out requests to NWS.
export async function mapZones(weather, ids) {
  const requested = typeof ids === 'string' ? ids.split(',') : [];
  if (!requested.length || requested.length > 16 || requested.some(id => !/^(county|forecast|fire|coastal|offshore)\/\w{6}$/.test(id)))
    throw new Error('Invalid boundary batch: supply 1–16 zone IDs');
  const names = [...new Set(requested)].map(id => '/zones/' + id), now = weather.clock();
  // At most 5.6 MB of base64 archive data, with no decompression in the Worker.
  const rows = await weather.statement(`SELECT d.name,d.last_success,d.revision,r.payload
    FROM datasets d JOIN revisions r ON r.dataset=d.name AND r.revision=d.revision
    WHERE d.name IN (${names.map(() => '?').join(',')}) AND d.last_success>=?
    AND d.last_success<=? AND d.error IS NULL AND length(r.payload)<=350000`,
    ...names, now - 30 * 86400, now).all();
  return {encoding:'gzip-base64',zones:rows.results.map(row => ({id:row.name.slice('/zones/'.length),
    checked_at:new Date(row.last_success * 1000).toISOString(),revision:row.revision,payload:row.payload}))};
}
