/* Public map data only. Cache failures never block the live feed. */
(function (root) {
  'use strict';
  const NAME = 'ventusiq-map-v1', PREFIX = '/__map_cache__/';
  let writes = Promise.resolve();
  const allowed = key => key === 'alerts' || /^zone\/(county|forecast|fire|coastal|offshore)\/\w{6}$/.test(key);
  root.WeatherMapCache = {
    async read(key, maxAge) {
      if (!allowed(key)) return null;
      try {
        const cache = await root.caches.open(NAME), response = await cache.match(PREFIX + key);
        if (!response) return null;
        const saved = Number(response.headers.get('X-Saved-At'));
        if (!saved || saved > Date.now() || Date.now() - saved > maxAge) { await cache.delete(PREFIX + key); return null; }
        return await response.json();
      } catch { return null; }
    },
    write(key, value) {
      if (!allowed(key)) return Promise.resolve();
      writes = writes.then(async () => {
        const body = JSON.stringify(value);
        if (body.length > 3000000) return;
        const cache = await root.caches.open(NAME);
        await cache.delete(PREFIX + key);
        await cache.put(PREFIX + key, new Response(body, {headers: {'Content-Type':'application/json', 'X-Saved-At':String(Date.now())}}));
        const keys = await cache.keys();
        for (const old of keys.slice(0, Math.max(0, keys.length - 256))) await cache.delete(old);
      }).catch(() => {});
      return writes;
    },
  };
})(window);
