/* Cache reads must not wait behind slow network misses. Public boundaries only. */
(function (root) {
  'use strict';
  root.createZoneLoader = function ({readCache, fetchZone, onResult, onError}) {
    let cacheQueue = [], networkQueue = [], cacheActive = 0, networkActive = 0;
    const pending = new Set(), urgent = new Set();
    function finish(url, data, error) {
      try { if (error) onError(url, error); else onResult(url, data); }
      finally { pending.delete(url); urgent.delete(url); }
    }
    function pumpNetwork() {
      while (networkActive < 4 && networkQueue.length) {
        const url = networkQueue.shift(); networkActive++;
        Promise.resolve().then(() => fetchZone(url))
          .then(data => finish(url, data), error => finish(url, null, error))
          .finally(() => { networkActive--; pumpNetwork(); });
      }
    }
    function pumpCache() {
      while (cacheActive < 12 && cacheQueue.length) {
        const url = cacheQueue.shift(); cacheActive++;
        Promise.resolve().then(() => readCache(url)).catch(() => null).then(data => {
          if (data?.geometry) finish(url, data);
          else { if (urgent.has(url)) networkQueue.unshift(url); else networkQueue.push(url); pumpNetwork(); }
        }).finally(() => { cacheActive--; pumpCache(); });
      }
    }
    return {
      enqueue(urls, priority = false) {
        const requested = new Set(urls);
        for (const url of requested) {
          if (priority) urgent.add(url);
          if (!pending.has(url)) { pending.add(url); cacheQueue.push(url); }
        }
        if (priority) {
          const promote = queue => [...queue.filter(url => requested.has(url)), ...queue.filter(url => !requested.has(url))];
          cacheQueue = promote(cacheQueue); networkQueue = promote(networkQueue);
        }
        pumpCache(); pumpNetwork();
      },
    };
  };
})(window);
