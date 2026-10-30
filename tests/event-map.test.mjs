import {test} from 'node:test';
import assert from 'node:assert/strict';
import {archivedEventMap} from '../lib/event-map.mjs';
const geometry={type:'Polygon',coordinates:[[[-78,38],[-77,38],[-77,39],[-78,38]]]},at='2026-10-28T20:00:00.500Z';
const story=(polygon=null)=>({id:'a'.repeat(64),as_of:at,transitions:[{id:'a'.repeat(64),at,revision:'old',present:1,feature:{type:'Feature',id:'https://api.weather.gov/alerts/test',geometry:polygon,properties:{event:'Wind Advisory',affectedZones:['https://api.weather.gov/zones/forecast/VAZ001']}}}]});
test('archive map reads zone versions before its cutoff without collecting current data',async()=>{
 const reads=[],weather={async read(key,cutoff){reads.push([key,cutoff]);return {data:{geometry},revision:'retained-zone',checked_at:'2026-10-27T00:00:00Z'};},collect(){throw Error('Current geography must not be collected');}};
 const result=await archivedEventMap(weather,story());assert.equal(result.features.length,1);assert.equal(result.features[0].properties.revision,'retained-zone');assert.deepEqual(reads,[['/zones/forecast/VAZ001',Math.floor(Date.parse(at)/1000)-1]]);assert.equal(result.complete,true);
});
test('unavailable old zone stays missing and native archived polygons need no zone lookup',async()=>{
 const weather={read:async()=>null};const missing=await archivedEventMap(weather,story());assert.equal(missing.complete,false);assert.equal(missing.features.length,0);assert.equal(missing.missing.length,1);
 const direct=await archivedEventMap({read(){throw Error('Unexpected read');}},story(geometry));assert.deepEqual(direct.features[0].geometry,geometry);assert.equal(direct.kind,'Alert polygon');
});
