/* Exact public NWS archive geometry; unknown/broken entries fall back individually. */
(function(root) {
  'use strict';
  root.fetchZoneBatch = async function(urls, request) {
    const byId = new Map(urls.map(url => [new URL(url).pathname.slice('/zones/'.length),url]));
    const result = await request('/api/map/zones?ids=' + encodeURIComponent([...byId.keys()].join(',')));
    const found = new Map();
    if (result?.encoding !== 'gzip-base64' || !Array.isArray(result.zones) || result.zones.length > 16) return found;
    for (const row of result.zones) {
      const url = byId.get(row.id), checked = Date.parse(row.checked_at);
      if (!url || found.has(url) || typeof row.payload !== 'string' || row.payload.length > 350000
        || !Number.isFinite(checked) || checked > Date.now() || Date.now()-checked > 30*86400000) continue;
      try {
        const bytes = Uint8Array.from(atob(row.payload), char => char.charCodeAt(0));
        const reader = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip')).getReader();
        const chunks=[];let length=0;
        try {
          while(true) { const part=await reader.read();if(part.done)break;
            length+=part.value.length;if(length>3000000)throw new Error('Boundary exceeds batch decode limit');chunks.push(part.value); }
        } finally { await reader.cancel().catch(()=>{}); }
        const data=JSON.parse(await new Blob(chunks).text());
        if (data.geometry) found.set(url,{geometry:data.geometry});
      } catch { /* A corrupt/oversize entry does not hide other boundaries. */ }
    }
    return found;
  };
})(typeof window !== 'undefined' ? window : globalThis);
