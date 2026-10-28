import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import {normalizeRoute,sampleRoute,routePassages,prepareRouteAlerts,evaluateJourney,departureTime} from '../public/journey-core.mjs';
import {WeatherService} from '../lib/weather-service.mjs';
import {JourneyService} from '../lib/journey-service.mjs';
const now=Date.parse('2026-11-01T00:00:00Z'),iso=ms=>new Date(ms).toISOString();
const raw=()=>({code:'Ok',waypoints:[{location:[0,0],distance:0},{location:[2,0],distance:3}],routes:[{distance:200000,duration:7200,geometry:{type:'LineString',coordinates:[[0,0],[1,0],[2,0]]},legs:[{annotation:{duration:[1200,2400],distance:[100000,100000]}}]}]});
const polygon=(west,east,south=-1,north=1)=>({type:'Polygon',coordinates:[[[west,south],[east,south],[east,north],[west,north],[west,south]]]});
const forecast=(temperatures=[10,20,30,40,50,60])=>({revision:'revision',checked_at:iso(now),issued_at:iso(now-60000),source_url:'https://api.weather.gov/gridpoints/ABC/1,1/forecast/hourly',metadata:{properties:{timeZone:'America/New_York'}},forecast:{properties:{periods:temperatures.map((t,i)=>({startTime:iso(now+i*3600000),endTime:iso(now+(i+1)*3600000),temperature:t,temperatureUnit:'F',windSpeed:'5 to 10 mph',probabilityOfPrecipitation:{value:20},shortForecast:'Clear'}))}}});
function database(){const sqlite=new DatabaseSync(':memory:');for(const name of readdirSync(new URL('../drizzle/',import.meta.url)).filter(f=>f.endsWith('.sql')).sort())sqlite.exec(readFileSync(new URL('../drizzle/'+name,import.meta.url),'utf8'));return {prepare(sql){let args=[];const s=sqlite.prepare(sql);return {bind(...a){args=a;return this;},async first(){return s.get(...args)||null;},async all(){return {results:s.all(...args)};},async run(){return s.run(...args);}};},async batch(list){sqlite.exec('BEGIN');try{const out=[];for(const s of list)out.push(await s.run());sqlite.exec('COMMIT');return out;}catch(e){sqlite.exec('ROLLBACK');throw e;}},close(){sqlite.close();}};}
test('road annotations distribute route-total time and samples respect both distance and elapsed time',()=>{
  const route=normalizeRoute(raw());assert.equal(route.vertices[1].elapsed,2400);assert.equal(route.vertices[2].elapsed,7200);const s=sampleRoute(route);assert.equal(s.samples[0].elapsed,0);assert.equal(s.samples.at(-1).elapsed,7200);assert.ok(s.max_gap_km<=50);assert.ok(s.max_gap_minutes<=30);assert.equal(s.coarse,false);
});
test('long routes remain bounded and disclose coarse sampling, while broken timing and remote snaps are rejected',()=>{
  const data=raw();data.routes[0].duration=86400;data.routes[0].distance=2000000;const s=sampleRoute(normalizeRoute(data));assert.equal(s.samples.length,25);assert.equal(s.coarse,true);
  const bad=raw();bad.routes[0].legs[0].annotation.duration=[];assert.throws(()=>normalizeRoute(bad),/timing/);const far=raw();far.waypoints[0].distance=1001;assert.throws(()=>normalizeRoute(far),/1 km/);
});
test('segment intersections detect a narrow polygon between samples and honor polygon holes',()=>{
  const route=normalizeRoute(raw());assert.deepEqual(routePassages(route,polygon(0.4,0.6)).map(span=>span.map(Math.round)),[[960,1440]]);
  const donut=polygon(0,2);donut.coordinates.push(polygon(0.5,1.5).coordinates[0]);assert.deepEqual(routePassages(route,donut),[[0,1200],[4800,7200]]);assert.deepEqual(routePassages(route,polygon(3,4)),[]);assert.equal(routePassages(route,null),null);
});
test('multiple polygons merge overlapping passages and date-line crossings take the short arc',()=>{
  const route=normalizeRoute(raw());assert.deepEqual(routePassages(route,{type:'GeometryCollection',geometries:[polygon(0.25,0.75),polygon(0.5,1)]}),[[600,2400]]);
  const across={vertices:[{coordinate:[179,0],elapsed:0},{coordinate:[-179,0],elapsed:100}]};assert.deepEqual(routePassages(across,polygon(179.5,-179.5)),[[25,75]]);
});
test('alert overlap is clipped to route passage and official validity; incomplete geometry and unknown timing stay explicit',()=>{
  const route=normalizeRoute(raw()),feature={id:'a',geometry:polygon(0.4,0.6),coverage_complete:false,properties:{status:'Actual',event:'Flood Warning',onset:iso(now+1000000),expires:iso(now+1300000)}};
  const prepared=prepareRouteAlerts(route,[feature,{id:'missing',properties:{status:'Actual'}}]);assert.equal(prepared.unknown_geometry,2);const sample=sampleRoute(route).samples;
  const r=evaluateJourney(route,sample,sample.map(()=>forecast()),prepared,now,{now,alertCheckedAt:iso(now)});assert.deepEqual(r.alerts[0].spans,[[iso(now+1000000),iso(now+1300000)]]);
  assert.equal(evaluateJourney(route,sample,[],prepared,now+3600000,{now}).alerts.length,0);feature.properties.expires='bad';const unknown=evaluateJourney(route,sample,[],prepareRouteAlerts(route,[feature]),now,{now});assert.equal(unknown.alerts[0].time_unknown,true);assert.equal(unknown.alert_collection_stale,true);
});
test('arrival-time forecasts use different hours along the route and change with departure; no stale or missing-data optimism',()=>{
  const route=normalizeRoute(raw()),samples=[{lat:0,lon:0,elapsed:0},{lat:0,lon:2,elapsed:7200}],prepared={entries:[],unknown_geometry:0};
  const first=evaluateJourney(route,samples,[forecast(),forecast()],prepared,now,{now,alertCheckedAt:iso(now)});assert.deepEqual(first.rows.map(r=>r.temperature),[10,30]);assert.equal(first.covered_samples,2);assert.equal(first.rows[0].wind,10);
  const later=evaluateJourney(route,samples,[forecast(),{...forecast(),stale:true}],prepared,now+3600000,{now,alertCheckedAt:iso(now)});assert.deepEqual(later.rows.map(r=>r.temperature),[20,null]);assert.equal(later.covered_samples,1);assert.equal(later.rows[1].forecast_revision,'revision');
  const absent=forecast();absent.forecast.properties.periods[0].probabilityOfPrecipitation.value=null;assert.equal(evaluateJourney(route,[samples[0]],[absent],prepared,now,{now}).covered_samples,0);
});
test('explicit offsets distinguish repeated DST hours and timezone-free or past departures are rejected',()=>{
  const a=departureTime('2026-11-01T01:30-04:00',now),b=departureTime('2026-11-01T01:30-05:00',now);assert.equal(b-a,3600000);assert.throws(()=>departureTime('2026-11-01T01:30',now),/timezone/);assert.throws(()=>departureTime('2026-10-31T01:30Z',now),/48 hours/);
});
test('routing cache survives service restart and preserves stale route provenance after upstream failure',async()=>{
  const db=database();let seconds=now/1000,calls=0,broken=false;const fetcher=async url=>{calls++;assert.ok(url.startsWith('https://router.project-osrm.org/route/v1/driving/'));if(broken)throw Error('Router outage');return {ok:true,json:async()=>raw()};};const service=()=>new JourneyService(new WeatherService(db,{clock:()=>seconds,fetcher}));const first=await service().route(0,0,0,2);await service().route(0,0,0,2);assert.equal(calls,1);seconds+=86401;broken=true;const stale=await service().route(0,0,0,2);assert.equal(stale.stale,true);assert.equal(stale.checked_at,first.checked_at);assert.equal(stale.revision,first.revision);db.close();
});
test('shared rate admission allows only one outbound request for concurrent distinct routes',async()=>{
  const db=database();let calls=0;const weather=new WeatherService(db,{clock:()=>now/1000,fetcher:async()=>{calls++;return {ok:true,json:async()=>raw()};}}),service=new JourneyService(weather);const outcomes=await Promise.allSettled([service.route(0,0,0,2),service.route(0,1,0,2)]);assert.equal(calls,1);assert.equal(outcomes.filter(x=>x.status==='fulfilled').length,1);assert.match(outcomes.find(x=>x.status==='rejected').reason.message,/busy/);db.close();
});
