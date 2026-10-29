/* NWS map display coordinates. Apache-2.0. Source geometry stays unchanged. */
(function(root) {
  'use strict';
  const cache = new WeakMap();
  // One world copy centered on the US (-100 degrees): Guam and both sides of
  // the Aleutians belong west of the mainland, not on opposite map edges.
  // Use this only for rendering NWS coverage, never for geographic decisions.
  function displayGeometry(geometry) {
    if (!geometry) return null;
    if (cache.has(geometry)) return cache.get(geometry);
    if (geometry.type === 'GeometryCollection') {
      const result = {...geometry, geometries: geometry.geometries.map(displayGeometry)};
      cache.set(geometry, result);
      return result;
    }
    function coordinates(value) {
      if (!Array.isArray(value)) return value;
      if (typeof value[0] === 'number') {
        const [lon, ...rest] = value;
        return [lon > 80 ? lon - 360 : lon, ...rest];
      }
      return value.map(coordinates);
    }
    const result = {...geometry, coordinates: coordinates(geometry.coordinates)};
    cache.set(geometry, result);
    return result;
  }
  root.WeatherMapGeometry = {displayGeometry};
})(typeof window !== 'undefined' ? window : globalThis);
