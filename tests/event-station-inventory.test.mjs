import {test} from 'node:test';
import assert from 'node:assert/strict';
import {loadEventStationInventory} from '../lib/event-station-inventory.mjs';
import {eventStationCandidates} from '../public/event-observations-core.mjs';
import {stationFeature,observationContext} from './fixtures/event-observations.mjs';
const next=n=>'https://api.weather.gov/stations?state%5B0%5D=AK&limit=500&cursor='+n;
const page=(features,link)=>({type:'FeatureCollection',features,pagination:link?{next:link}:{}});
test('a matching airport on the second page becomes discoverable and page provenance is retained',async()=>{
  const calls=[],signal=AbortSignal.timeout(1000),airport=stationFeature();airport.properties.stationIdentifier='PAAK';
  const outside=stationFeature();outside.geometry.coordinates=[-80,40];
  const r=await loadEventStationInventory('AK',async(url,s)=>{assert.equal(s,signal);calls.push(url);return calls.length===1?page([outside],next('second')):page([airport]);},signal);
  assert.equal(calls.length,2);assert.match(calls[1],/state=AK&limit=500&cursor=second$/);assert.equal(r.truncated,false);assert.equal(r.pages.length,2);
  assert.equal(r.pages[0].pagination_next,next('second'));assert.equal(eventStationCandidates([r],observationContext().areas).stations[0].id,'PAAK');
});
test('four-page bound preserves an explicit truncated result without requesting page five',async()=>{
  let calls=0;const r=await loadEventStationInventory('AK',async()=>page([stationFeature()],next(String(++calls))),AbortSignal.timeout(1000));
  assert.equal(calls,4);assert.equal(r.features.length,4);assert.equal(r.truncated,true);assert.equal(r.page_limit,4);
});
test('rejects links that escape the fixed origin, endpoint, state, page size or cursor contract before fetching them',async()=>{
  for(const link of ['https://evil.example/stations?state=AK&limit=500&cursor=x','https://api.weather.gov/alerts?state=AK&limit=500&cursor=x',next('x').replace('AK','TX'),next('x').replace('500','501'),next('x')+'&state=AK',next('x')+'&foo=bar',next('x')+'#fragment','more','',17]){
    let calls=0;await assert.rejects(loadEventStationInventory('AK',async()=>{calls++;return {type:'FeatureCollection',features:[stationFeature()],pagination:{next:link}};},AbortSignal.timeout(1000)),/pagination/);assert.equal(calls,1);
  }
});
test('repeated cursors and oversized pages cannot masquerade as complete inventories',async()=>{
  let calls=0;await assert.rejects(loadEventStationInventory('AK',async()=>{calls++;return page([stationFeature()],next('loop'));},AbortSignal.timeout(1000)),/Repeated/);assert.equal(calls,2);
  await assert.rejects(loadEventStationInventory('AK',async()=>page(Array(501).fill(stationFeature())),AbortSignal.timeout(1000)),/Invalid station inventory/);
});
test('NWS empty terminal page may still supply a next cursor without causing another request',async()=>{
  let calls=0;const r=await loadEventStationInventory('AK',async()=>++calls===1?page([stationFeature()],next('empty')):page([],next('beyond')),AbortSignal.timeout(1000));
  assert.equal(calls,2);assert.equal(r.features.length,1);assert.equal(r.truncated,false);assert.equal(r.stop_reason,'empty_page');assert.equal(r.pages[1].pagination_next,next('beyond'));
});
test('a later-page outage rejects the partial collection',async()=>{
  let calls=0;await assert.rejects(loadEventStationInventory('AK',async()=>{if(++calls===2)throw Error('NWS outage');return page([stationFeature()],next('two'));},AbortSignal.timeout(1000)),/NWS outage/);
});
