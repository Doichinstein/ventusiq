import {test} from 'node:test';
import assert from 'node:assert/strict';
import {normalizeRoute,sampleRoute} from '../public/journey-core.mjs';
import {applyJourneyStops} from '../public/journey-stops.mjs';
import {networkExplanation,ROUTE_NETWORK_METHOD} from '../public/journey-network.mjs';
import {JourneyService} from '../lib/journey-service.mjs';
import {WeatherService} from '../lib/weather-service.mjs';
import {database} from './fixtures/push.mjs';

function fixture(){
  const coordinates=Array.from({length:5},(_,i)=>[-77,39+i*.005]);
  return {code:'Ok',waypoints:[coordinates[0],coordinates.at(-1)].map(location=>({location,distance:0})),routes:[{
    geometry:{type:'LineString',coordinates},duration:1200,distance:2000,
    legs:[{annotation:{duration:[300,300,300,300],distance:[500,500,500,500],nodes:[13000000001,2,3,4,13000000005]}}]}]};
}
test('source node references preserve large safe IDs, source geometry and absent version without verification',()=>{
  const raw=fixture(),r=normalizeRoute(raw),n=r.network_references;
  assert.equal(n.status,'retained');assert.equal(n.data_version,null);assert.deepEqual(n.legs[0].node_ids,raw.routes[0].legs[0].annotation.nodes);
  assert.deepEqual(n.legs[0].geometry_coordinates,raw.routes[0].geometry.coordinates);
  for(const key of ['coordinate_identity_verified','agency_crosswalk_verified','direction_verified','closure_attribution_verified'])assert.equal(n[key],false);
  assert.equal(n.legs[0].endpoint_coordinate_identity_verified,false);assert.equal(n.legs[0].counts_match,true);
  raw.routes[0].geometry.coordinates[0][0]=0;raw.routes[0].legs[0].annotation.nodes[0]=1;
  assert.equal(n.legs[0].geometry_coordinates[0][0],-77);assert.equal(n.legs[0].node_ids[0],13000000001);
});
test('unusable IDs leave route timing usable and record a versioned unavailable state',()=>{
  for(const nodes of [undefined,[],[1,0],[1,-1],[1,'2'],[1,2.5],[1,Number.MAX_SAFE_INTEGER+1],Array(50001).fill(2)]){
    const raw=fixture();raw.routes[0].legs[0].annotation.nodes=nodes;const r=normalizeRoute(raw);
    assert.equal(r.duration,1200);assert.equal(r.network_references.status,'unavailable');
    assert.equal(r.network_references.method,ROUTE_NETWORK_METHOD);assert.equal(r.network_references.unavailable_legs.length,1);
  }
});
test('count mismatch retains references separately without inventing coordinate assignments',()=>{
  const raw=fixture();raw.routes[0].legs[0].annotation.nodes=[1,2,3];const n=normalizeRoute(raw).network_references;
  assert.equal(n.legs[0].counts_match,false);assert.equal(n.legs[0].repeated_ids_at_distinct_interior_positions,null);
  assert.match(networkExplanation(n,1),/different node and coordinate counts/);assert.equal(n.coordinate_identity_verified,false);
});
test('repeated IDs at distinct interior positions are explicit; same-position loops and endpoints are excluded',()=>{
  const raw=fixture();raw.routes[0].legs[0].annotation.nodes=[2,2,2,2,2];
  let n=normalizeRoute(raw).network_references;assert.deepEqual(n.legs[0].repeated_ids_at_distinct_interior_positions,[2]);
  assert.match(networkExplanation(n,1),/1 repeated-ID conflicts/);
  raw.routes[0].geometry.coordinates[2]=raw.routes[0].geometry.coordinates[1].slice();raw.routes[0].geometry.coordinates[3]=raw.routes[0].geometry.coordinates[1].slice();
  n=normalizeRoute(raw).network_references;assert.deepEqual(n.legs[0].repeated_ids_at_distinct_interior_positions,[]);
  assert.match(networkExplanation(n,1),/do not verify/);
});
test('partial leg evidence retains original driving geometry when timed stops insert route vertices',()=>{
  const raw=fixture(),a=raw.routes[0].legs[0].annotation;
  raw.waypoints.splice(1,0,{location:raw.routes[0].geometry.coordinates[2],distance:0});
  raw.routes[0].legs=[0,1].map(i=>({duration:600,distance:1000,annotation:{duration:a.duration.slice(i*2,i*2+2),distance:a.distance.slice(i*2,i*2+2),nodes:i?undefined:a.nodes.slice(0,3)}}));
  const base=normalizeRoute(raw);base.sampling=sampleRoute(base);const before=JSON.stringify(base.network_references);
  const stopped=applyJourneyStops(base,[{lat:39.01,lon:-77,minutes:10}]);
  assert.equal(stopped.vertices.length,6);assert.equal(stopped.network_references.status,'partial');
  assert.equal(JSON.stringify(stopped.network_references),before);assert.equal(stopped.network_references.legs[0].geometry_coordinates.length,3);
});
test('network-only legacy cache upgrades once; absent node annotations do not cause repeated fetches',async()=>{
  const db=database(),raw=fixture();delete raw.routes[0].legs[0].annotation.nodes;
  const old=normalizeRoute(raw);delete old.network_references;let calls=0;
  const w=new WeatherService(db,{clock:()=>1793246400,fetcher:async url=>{calls++;assert.equal(new URL(url).searchParams.get('annotations'),'duration,distance,nodes');return Response.json(raw);}});
  try{
    await w.collect('routes/39.0000,-77.0000;39.0200,-77.0000',86400,async()=>({...old,sampling:sampleRoute(old),raw}));
    const service=new JourneyService(w),r=await service.route(39,-77,39.02,-77);assert.equal(r.network_references.status,'unavailable');
    await service.route(39,-77,39.02,-77);assert.equal(calls,1);
  }finally{db.close();}
});
