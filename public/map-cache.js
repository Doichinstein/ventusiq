/* Public map data only. Cache failures never block the live feed. */
(function (root) {
  'use strict';
  const NAME = 'ventusiq-map-v1', PREFIX = '/__map_cache__/';
  let writes = Promise.resolve(), sizes = null;
  const MAX_ENTRIES = 2048, MAX_BYTES = 24 * 1024 * 1024;
  const cachePath = key => typeof key === 'string' ? key : key.url.slice(key.url.indexOf(PREFIX));
  const allowed = key => key === 'alerts' || /^zone\/(county|forecast|fire|coastal|offshore)\/\w{6}$/.test(key);
  root.WeatherMapCache = {
    async read(key, maxAge) {
      if (!allowed(key)) return null;
      try {
        const cache = await root.caches.open(NAME), response = await cache.match(PREFIX + key);
        if (!response) return null;
        const saved = Number(response.headers.get('X-Saved-At'));
        if (!saved || saved > Date.now() || Date.now() - saved > maxAge) { await cache.delete(PREFIX + key); sizes?.delete(PREFIX + key); return null; }
        const decoded = response.headers.get('X-Cache-Encoding') === 'gzip'
          ? new Response(response.body.pipeThrough(new DecompressionStream('gzip'))) : response;
        return await decoded.json();
      } catch { return null; }
    },
    write(key, value) {
      if (!allowed(key)) return Promise.resolve();
      writes = writes.then(async () => {
        const body = JSON.stringify(value);
        if (body.length > 3000000) return;
        let payload = new Blob([body]), encoding = 'identity';
        if (key.startsWith('zone/') && typeof CompressionStream !== 'undefined' && typeof DecompressionStream !== 'undefined') {
          try {
            const compressed = await new Response(payload.stream().pipeThrough(new CompressionStream('gzip'))).blob();
            if (compressed.size < payload.size) { payload = compressed; encoding = 'gzip'; }
          } catch { /* Plain JSON remains a supported cache format. */ }
        }
        const cache = await root.caches.open(NAME);
        if (!sizes) {
          const entries = await Promise.all((await cache.keys()).map(async old => {
            const response = await cache.match(old);
            return [cachePath(old), Number(response?.headers.get('X-Cache-Bytes')) || (await response?.text() || '').length * 3];
          }));
          sizes = new Map(entries);
        }
        await cache.delete(PREFIX + key);
        const bytes = payload.size;
        sizes.delete(PREFIX + key);
        let total = [...sizes.values()].reduce((a,b) => a+b, 0);
        for (const [old,size] of sizes) {
          if (sizes.size < MAX_ENTRIES && total + bytes <= MAX_BYTES) break;
          await cache.delete(old); sizes.delete(old); total -= size;
        }
        await cache.put(PREFIX + key, new Response(payload, {headers: {'Content-Type':encoding === 'gzip' ? 'application/gzip' : 'application/json', 'X-Cache-Encoding':encoding, 'X-Saved-At':String(Date.now()), 'X-Cache-Bytes':String(bytes)}}));
        sizes.set(PREFIX + key, bytes);
      }).catch(() => { sizes = null; });
      return writes;
    },
  };
})(window);
