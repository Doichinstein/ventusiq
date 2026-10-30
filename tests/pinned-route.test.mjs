import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {normalizePinnedRoute,pinnedRouterConfig,decodePolyline6} from '../lib/pinned-route.mjs';
import {JourneyService} from '../lib/journey-service.mjs';
import {WeatherService} from '../lib/weather-service.mjs';
import {applyJourneyStops} from '../public/journey-stops.mjs';
import {networkExplanation} from '../public/journey-network.mjs';
import {nearbyRoadLabels} from '../public/journey-roads.mjs';
import {database} from './fixtures/push.mjs';
const probe=JSON.parse(readFileSync(new URL('../docs/evidence/route-network-probe-2026-10-30.json',import.meta.url)));
const points=probe.requests.route.locations.map(p=>[p.lon,p.lat]),pin=probe.graph_sha256,now=Date.parse(probe.checked_at);
const config={url:'https://router.example.test/route',graph:pin,token:'testOnlyToken_notARealSecret123456789'};
const envelope=()=>({schema:'ventusiq-pinned-route/1',graph_sha256:pin,engine_version:'3.9.1',checked_at:probe.checked_at,requested_waypoints:structuredClone(points),legs:[structuredClone(probe)]});
const normalize=data=>normalizePinnedRoute(data,pin,points,now);
test('retained native route becomes timed Journey geometry and preserves directed source evidence',()=>{
  const route=normalize(envelope());assert.equal(route.vertices.length,44);assert.equal(route.road_context.segments.length,40);
  assert.equal(route.duration,195.493);assert.equal(route.distance,2717);assert.equal(route.legs[0].end_vertex,43);
  assert.deepEqual(route.network_references.legs[0].probe,probe);assert.equal(route.network_references.graph_sha256,pin);
  assert.equal(route.sampling.samples[0].elapsed,0);assert.equal(route.sampling.samples.at(-1).elapsed,route.duration);
  assert.ok(route.waypoints[0].snap_distance>15&&route.waypoints[0].snap_distance<17);
  assert.match(networkExplanation(route.network_references,1),/closure attribution remain unverified/);
  assert.equal(nearbyRoadLabels(route.road_context,{roads:['US-75']},[[0,5]]).status,'shared_label');
  for(let i=1;i<route.vertices.length;i++){assert.ok(route.vertices[i].elapsed>=route.vertices[i-1].elapsed);assert.ok(route.vertices[i].distance>=route.vertices[i-1].distance);}
});
test('graph request source identity and elapsed times must agree',()=>{
  const mutations=[d=>d.graph_sha256='a'.repeat(64),d=>d.engine_version='other',d=>d.checked_at=new Date(now-300001).toISOString(),d=>d.checked_at=new Date(now+60001).toISOString(),
    d=>d.requested_waypoints[0][0]++,d=>d.legs[0].graph_sha256='a'.repeat(64),d=>d.legs[0].requests.route.locations[0].lat++,
    d=>d.legs[0].trace_attributes.shape+='?',d=>d.legs[0].trace_attributes.osm_changeset=null,d=>d.legs[0].route.trip.units='miles',
    d=>d.legs[0].trace_attributes.edges[1].node_id++,d=>d.legs[0].trace_attributes.edges[1].begin_shape_index=0,
    d=>d.legs[0].trace_attributes.edges[1].end_node.elapsed_time=-1,d=>d.legs[0].trace_attributes.edges[0].source_percent_along=null,
    d=>d.legs[0].trace_attributes.edges[1].source_percent_along=.1,d=>d.legs[0].trace_attributes.edges.pop(),
    d=>d.legs[0].trace_attributes.edges[0].names=[{}],d=>d.legs[0].route.trip.legs[0].summary.time=500];
  for(const mutate of mutations){const data=envelope();mutate(data);assert.throws(()=>normalize(data));}
});
function syntheticLeg(a,b,shape){return {schema:'ventusiq-route-network-probe/1',graph_sha256:pin,requests:{route:{costing:'auto',locations:[{lon:a[0],lat:a[1]},{lon:b[0],lat:b[1]}]},trace:{shape_match:'edge_walk',encoded_polyline:shape}},route:{trip:{units:'kilometers',status:0,legs:[{shape,summary:{time:60,length:1}}]}},trace_attributes:{shape,osm_changeset:12,edges:[{id:1,way_id:2,node_id:3,end_node:{node_id:4,elapsed_time:60},begin_shape_index:0,end_shape_index:1,forward:false,length:1,names:['Synthetic road']}]}};}
test('multiple connected legs retain boundaries and planned stop timing',()=>{
  const requested=[[0,0],[0,.01],[0,.02]],legs=[syntheticLeg(requested[0],requested[1],'??_pR?'),syntheticLeg(requested[1],requested[2],'_pR?_pR?')];
  const data={...envelope(),requested_waypoints:requested,legs},route=normalizePinnedRoute(data,pin,requested,now);
  assert.equal(route.legs.length,2);assert.deepEqual(route.legs.map(l=>[l.start_vertex,l.end_vertex]),[[0,1],[1,2]]);
  const stopped=applyJourneyStops(route,[{lat:.01,lon:0,minutes:30}]);assert.equal(stopped.duration,1920);assert.equal(stopped.stops[0].arrival_elapsed,60);assert.equal(stopped.stops[0].departure_elapsed,1860);
  assert.equal(stopped.road_context.segments[1].start_elapsed,1860);assert.equal(stopped.network_references.legs[1].probe,legs[1]);
  data.legs[1].trace_attributes.osm_changeset=13;assert.throws(()=>normalizePinnedRoute(data,pin,requested,now),/datasets/);
  data.legs[1].trace_attributes.osm_changeset=12;data.legs[1].trace_attributes.shape='apR?_pR?';data.legs[1].route.trip.legs[0].shape='apR?_pR?';data.legs[1].requests.trace.encoded_polyline='apR?_pR?';assert.throws(()=>normalizePinnedRoute(data,pin,requested,now),/snapped waypoint/);
});
test('bounded polyline decoding and complete environment configuration',()=>{
  assert.deepEqual(decodePolyline6('??_pR?'),[[0,0],[0,.01]]);
  for(const s of ['', '?','??_','??\x00?','~'.repeat(40)])assert.throws(()=>decodePolyline6(s));
  assert.equal(pinnedRouterConfig({}),null);
  const env={VENTUSIQ_PINNED_ROUTER_URL:config.url,VENTUSIQ_PINNED_GRAPH_SHA256:pin,VENTUSIQ_PINNED_ROUTER_TOKEN:config.token};assert.deepEqual(pinnedRouterConfig(env),config);
  for(const url of ['http://router.example.test/route','https://u:p@router.example.test/route','https://router.example.test/route?token=x','https://router.example.test/other'])assert.throws(()=>pinnedRouterConfig({...env,VENTUSIQ_PINNED_ROUTER_URL:url}),/configuration/);
  assert.throws(()=>pinnedRouterConfig({...env,VENTUSIQ_PINNED_ROUTER_TOKEN:''}),/configuration/);
});
test('configured service posts authenticated bounded coordinates and caches only within its graph identity',async()=>{
  const db=database();let calls=0,seconds=now/1000,broken=false;
  const weather=new WeatherService(db,{clock:()=>seconds,fetcher:async(url,options)=>{calls++;assert.equal(url,config.url);assert.equal(options.method,'POST');assert.equal(options.redirect,'manual');assert.equal(options.headers.Authorization,'Bearer '+config.token);assert.deepEqual(JSON.parse(options.body),{points});if(broken)throw Error('Pinned backend outage');return Response.json(envelope());}});
  try{const service=new JourneyService(weather,{pinnedRouter:config});const first=await service.route(points[0][1],points[0][0],points[1][1],points[1][0]);await service.route(points[0][1],points[0][0],points[1][1],points[1][0]);assert.equal(calls,1);assert.equal(JSON.stringify(first).includes(config.token),false);assert.equal(first.network_references.graph_sha256,pin);
    seconds+=86401;broken=true;const stale=await service.route(points[0][1],points[0][0],points[1][1],points[1][0]);assert.equal(stale.stale,true);assert.equal(stale.checked_at,first.checked_at);
    seconds+=3;const changed=new JourneyService(weather,{pinnedRouter:{...config,graph:'a'.repeat(64)}});await assert.rejects(changed.route(points[0][1],points[0][0],points[1][1],points[1][0]),/outage/);assert.equal(calls,3);
  }finally{db.close();}
});
test('wrong-graph response cannot create a cached route or fall back to OSRM',async()=>{
  const db=database();let calls=0;const weather=new WeatherService(db,{clock:()=>now/1000,fetcher:async url=>{calls++;assert.equal(url,config.url);const data=envelope();data.graph_sha256='f'.repeat(64);return Response.json(data);}});
  try{await assert.rejects(new JourneyService(weather,{pinnedRouter:config}).route(43.075,-96.1757,43.096,-96.1757),/identity/);assert.equal(calls,1);assert.equal((await weather.statement('SELECT COUNT(*) AS n FROM revisions').first()).n,0);}finally{db.close();}
});
