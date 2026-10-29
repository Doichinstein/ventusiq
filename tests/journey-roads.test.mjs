import {test} from 'node:test';
import assert from 'node:assert/strict';
import {normalizeRoute,sampleRoute} from '../public/journey-core.mjs';
import {applyJourneyStops} from '../public/journey-stops.mjs';
import {nearbyRoadLabels,roadLabel,ROAD_CONTEXT_METHOD} from '../public/journey-roads.mjs';
import {readRouteResponse,JourneyService} from '../lib/journey-service.mjs';
import {WeatherService} from '../lib/weather-service.mjs';
import {database} from './fixtures/push.mjs';
import {prepareRoadwork,evaluateRoadwork,normalizeRoadwork} from '../public/roadwork-core.mjs';
import {roadRaw,roadNow} from './roadwork-fixture.mjs';

export function roadsFixture(){
  const points=[[-77,39],[-77,39.01],[-77,39.02]];
  const step=(i,name,ref)=>({name,ref,mode:'driving',duration:600,distance:1000,
    geometry:{type:'LineString',coordinates:points.slice(i,i+2)},maneuver:{type:i?'turn':'depart',bearing_after:0,location:points[i]}});
  return {code:'Ok',data_version:'2026-10-01T00:00:00Z',waypoints:[points[0],points[2]].map(location=>({location,distance:0})),routes:[{
    geometry:{type:'LineString',coordinates:points},duration:1200,distance:2000,legs:[{
      annotation:{duration:[600,600],distance:[1000,1000]},steps:[step(0,'First Street','I 95'),step(1,'Second Street','I 495'),
        {name:'Second Street',mode:'driving',duration:0,distance:0,maneuver:{type:'arrive'},geometry:{type:'LineString',coordinates:[points[2],points[2]]}}]}]}]};
}
function viaFixture(){const raw=roadsFixture(),leg=raw.routes[0].legs[0];raw.waypoints.splice(1,0,{location:raw.routes[0].geometry.coordinates[1],distance:0});raw.routes[0].legs=[0,1].map(i=>({duration:600,distance:1000,annotation:{duration:[600],distance:[1000]},steps:[leg.steps[i]]}));return raw;}
test('road steps retain source labels and exact vertex/time provenance without heading-to-direction inference',()=>{
  const raw=roadsFixture(),r=normalizeRoute(raw),c=r.road_context;
  assert.equal(c.status,'available');assert.equal(c.segments.length,2);assert.equal(c.data_version,raw.data_version);
  assert.deepEqual(c.segments.map(s=>[s.start_vertex,s.end_vertex,s.start_elapsed,s.end_elapsed]),[[0,1,0,600],[1,2,600,1200]]);
  assert.equal(c.segments[0].source.maneuver.bearing_after,0);assert.equal(c.direction_verified,false);
});
test('looped geometry uses ordered step positions, never the first occurrence of a coordinate',()=>{
  const raw=roadsFixture();raw.routes[0].geometry.coordinates[2]=[-77,39];raw.waypoints[1].location=[-77,39];
  raw.routes[0].legs[0].steps[1].geometry.coordinates[1]=[-77,39];raw.routes[0].legs[0].steps.pop();
  const c=normalizeRoute(raw).road_context;assert.equal(c.status,'available');assert.equal(c.segments[1].end_vertex,2);
});
test('missing or reordered step geometry withholds that leg but leaves weather geometry usable',()=>{
  const raw=viaFixture();raw.routes[0].legs[1].steps[0].geometry.coordinates.reverse();
  const r=normalizeRoute(raw);assert.equal(r.vertices.length,3);assert.equal(r.road_context.status,'partial');assert.equal(r.road_context.segments.length,1);
  assert.match(r.road_context.unavailable_legs[0].reason,/geometry/);
  delete raw.routes[0].legs[0].steps;assert.equal(normalizeRoute(raw).road_context.status,'unavailable');
});
test('invalid arrivals, truncated paths and oversized step lists do not establish coverage',()=>{
  for(const mutate of [r=>r.routes[0].legs[0].steps.at(-1).duration=1,r=>r.routes[0].legs[0].steps.splice(1),
    r=>r.routes[0].legs[0].steps=Array(2001).fill(r.routes[0].legs[0].steps[0])]){
    const raw=roadsFixture();mutate(raw);assert.equal(normalizeRoute(raw).road_context.status,'unavailable');
  }
});
test('stops shift road vertex/time indices while retaining original indices and leave stopped intervals unassigned',()=>{
  const base=normalizeRoute(viaFixture());base.sampling=sampleRoute(base);const r=applyJourneyStops(base,[{lat:39.01,lon:-77,minutes:10}]);
  assert.deepEqual(r.road_context.segments.map(s=>[s.start_vertex,s.end_vertex,s.start_elapsed,s.end_elapsed]),[[0,1,0,600],[2,3,1200,1800]]);
  for(const s of r.road_context.segments){assert.equal(r.vertices[s.start_vertex].elapsed,s.start_elapsed);assert.equal(r.vertices[s.end_vertex].elapsed,s.end_elapsed);}
  assert.equal(r.road_context.segments[1].source_start_vertex,1);
  assert.equal(nearbyRoadLabels(r.road_context,{roads:['I-95']},[[600,1200]]).status,'unavailable');
});
test('label comparison handles refs but preserves suffixes, direction words and adjacent roads',()=>{
  const r=normalizeRoute(roadsFixture());let evidence=nearbyRoadLabels(r.road_context,{roads:['I-95']},[[20,100]]);
  assert.equal(evidence.status,'shared_label');assert.deepEqual(evidence.segments[0].shared_labels,['i 95']);
  assert.equal(evidence.closure_attribution_verified,false);assert.equal(evidence.direction_verified,false);
  assert.equal(nearbyRoadLabels(r.road_context,{roads:['I-95']},[[610,700]]).status,'no_shared_label');
  assert.notEqual(roadLabel('US 1 Alternate'),roadLabel('US 1'));assert.notEqual(roadLabel('Main Street North'),roadLabel('Main Street South'));
  assert.notEqual(roadLabel('I 95 ramp'),roadLabel('I 95'));assert.equal(nearbyRoadLabels(r.road_context,{roads:['I-95']},[[600,600]]).status,'unavailable');
});
test('unnamed steps remain unknown and omitted labels are counted without losing closure limits',()=>{
  const c=normalizeRoute(roadsFixture()).road_context;c.segments[0].name='';c.segments[0].ref='';
  assert.equal(nearbyRoadLabels(c,{roads:['Main Street']},[[0,100]]).status,'unavailable');
  c.segments=Array.from({length:120},(_,i)=>({...c.segments[1],start_elapsed:i,end_elapsed:i+1}));
  const e=nearbyRoadLabels(c,{roads:['I 495']},[[0,120]]);assert.equal(e.segments.length,100);assert.equal(e.omitted_segments,20);assert.equal(e.closure_attribution_verified,false);
});
test('agency applicability clips road-label context to the selected departure and event window',()=>{
  const route=normalizeRoute(roadsFixture()),raw=roadRaw();raw.features[0].geometry=route.vertices.length?{type:'LineString',coordinates:route.vertices.map(v=>v.coordinate)}:null;
  raw.features[0].properties.core_details.road_names=['I-95'];raw.features[0].properties.start_date=new Date(roadNow+650000).toISOString();raw.features[0].properties.end_date=new Date(roadNow+900000).toISOString();
  const p={...normalizeRoadwork(raw,'md'),checked_at:new Date(roadNow).toISOString()};const prepared=prepareRoadwork(route,[p]);
  const first=evaluateRoadwork(prepared,roadNow,roadNow).feeds[0].candidates[0];assert.equal(first.road_labels.status,'no_shared_label');assert.equal(first.road_labels.segments[0].name,'Second Street');
  const later=evaluateRoadwork(prepared,roadNow+600000,roadNow).feeds[0].candidates[0];assert.equal(later.road_labels.status,'shared_label');
});
test('routing body is bounded while streaming and rejects redirects or malformed UTF-8',async()=>{
  let cancelled=false;const body=new ReadableStream({pull(c){c.enqueue(new Uint8Array(1024*1024));},cancel(){cancelled=true;}});
  await assert.rejects(readRouteResponse(new Response(body)),/8 MiB/);assert.equal(cancelled,true);
  await assert.rejects(readRouteResponse(new Response(null,{status:302})),/302/);
  await assert.rejects(readRouteResponse(new Response(new Uint8Array([255]))));
});
test('legacy route upgrades once under shared rate control and retains prior route on failure',async()=>{
  const db=database();let now=1793246400,calls=0,broken=true;const raw=roadsFixture(),old=normalizeRoute(raw);delete old.road_context;
  const w=new WeatherService(db,{clock:()=>now,fetcher:async(url,options)=>{calls++;assert.match(url,/steps=true/);assert.equal(options.redirect,'manual');if(broken)throw Error('Router unavailable');return Response.json(raw);}});
  try{
    const name='routes/39.0000,-77.0000;39.0200,-77.0000';await w.collect(name,86400,async()=>({...old,sampling:sampleRoute(old),raw}));
    const service=new JourneyService(w),first=await service.route(39,-77,39.02,-77);assert.equal(first.stale,true);assert.equal(first.road_context,undefined);
    await service.route(39,-77,39.02,-77);assert.equal(calls,1);now+=121;broken=false;
    const upgraded=await service.route(39,-77,39.02,-77);assert.equal(upgraded.road_context.method,ROAD_CONTEXT_METHOD);assert.equal(upgraded.road_context.status,'available');
    await service.route(39,-77,39.02,-77);assert.equal(calls,2);
  }finally{db.close();}
});
