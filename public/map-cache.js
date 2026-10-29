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
        return await response.json();
      } catch { return null; }
    },
    write(key, value) {
      if (!allowed(key)) return Promise.resolve();
      writes = writes.then(async () => {
        const body = JSON.stringify(value);
        if (body.length > 3000000) return;
        const cache = await root.caches.open(NAME);
        if (!sizes) {
          const entries = await Promise.all((await cache.keys()).map(async old => {
            const response = await cache.match(old);
            return [cachePath(old), Number(response?.headers.get('X-Cache-Bytes')) || (await response?.text() || '').length * 3];
          }));
          sizes = new Map(entries);
        }
        await cache.delete(PREFIX + key);
        // Three bytes per UTF-16 code unit conservatively bounds UTF-8 payload size.
        const bytes = body.length * 3;
        sizes.delete(PREFIX + key);
        let total = [...sizes.values()].reduce((a,b) => a+b, 0);
        for (const [old,size] of sizes) {
          if (sizes.size < MAX_ENTRIES && total + bytes <= MAX_BYTES) break;
          await cache.delete(old); sizes.delete(old); total -= size;
        }
        await cache.put(PREFIX + key, new Response(body, {headers: {'Content-Type':'application/json', 'X-Saved-At':String(Date.now()), 'X-Cache-Bytes':String(bytes)}}));
        sizes.set(PREFIX + key, bytes);
      }).catch(() => { sizes = null; });
      return writes;
    },
  };
})(window);
