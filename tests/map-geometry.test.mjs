import {test} from 'node:test';
import assert from 'node:assert/strict';
import '../public/map-geometry.js';
const {displayGeometry} = globalThis.WeatherMapGeometry;
const polygon = ring => ({type:'Polygon',coordinates:[ring]});

test('Aleutian polygon crosses the date line locally without modifying source coordinates', () => {
  const source = polygon([[179,51,2],[-179,51,3],[-179,52,4],[179,51,2]]);
  const before = structuredClone(source), result = displayGeometry(source);
  assert.deepEqual(source,before);
  assert.deepEqual(result.coordinates[0],[[-181,51,2],[-179,51,3],[-179,52,4],[-181,51,2]]);
  assert.notEqual(result.coordinates,source.coordinates);
});

test('national collection keeps mainland, Alaska, Guam, Hawaii, Samoa and Puerto Rico in one Pacific frame', () => {
  const locations = [[-125,48],[-66,25],[179,52],[-170,55],[144,13],[-156,20],[-170,-14],[-66,18]];
  const source = {type:'GeometryCollection',geometries:locations.map(coordinates=>({type:'Point',coordinates}))};
  const result = displayGeometry(source), lons=result.geometries.map(g=>g.coordinates[0]);
  assert.equal(Math.min(...lons),-216); assert.equal(Math.max(...lons),-66);
  assert.equal((Math.min(...lons)+Math.max(...lons))/2,-141);
  assert.deepEqual(source.geometries.map(g=>g.coordinates),locations);
});

test('multipolygons and zone geometry collections transform recursively; absent geometry stays absent', () => {
  const ring = [[144,13],[145,13],[145,14],[144,13]];
  const source = {type:'GeometryCollection',geometries:[{type:'MultiPolygon',coordinates:[[ring]]}]};
  assert.deepEqual(displayGeometry(source).geometries[0].coordinates[0][0],ring.map(([lon,lat])=>[lon-360,lat]));
  assert.equal(displayGeometry(null),null);assert.equal(displayGeometry(undefined),null);
  assert.deepEqual(displayGeometry(polygon([[-125,24],[-66,50],[-125,24]])),polygon([[-125,24],[-66,50],[-125,24]]));
});
