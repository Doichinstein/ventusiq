import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mapAlerts} from '../lib/map-alerts.mjs';

test('map responds with original cache times before deferred collection starts, then runs upkeep on fresh data',async()=>{
  const jobs=[],now=Date.parse('2026-10-29T16:00:00Z'),seen=[];
  const cached={data:{type:'FeatureCollection',features:[]},revision:'old',checked_at:new Date(now-120000).toISOString()};
  let collected=0;const fresh={revision:'fresh'};
  const result=await mapAlerts({read:async()=>cached,clock:()=>now/1000,alerts:async()=>{collected++;return fresh;}},fn=>jobs.push(fn),async value=>seen.push(value));
  assert.equal(collected,0);assert.equal(result.revision,'old');assert.equal(result.collected_at,cached.checked_at);assert.equal(result.stale,true);
  await jobs[0]();assert.equal(collected,1);assert.deepEqual(seen,[fresh]);
});
test('first collection is awaited with no archive, and failures do not fabricate an empty collection',async()=>{
  const jobs=[],weather={read:async()=>null,alerts:async()=>({revision:'first'})};
  const result=await mapAlerts(weather,fn=>jobs.push(fn),async()=>{});assert.equal(result.revision,'first');assert.equal(jobs.length,1);
  weather.alerts=async()=>{throw Error('Source down');};await assert.rejects(mapAlerts(weather,()=>{},()=>{}),/Source down/);
});
