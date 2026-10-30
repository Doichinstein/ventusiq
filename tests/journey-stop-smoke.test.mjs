import {test} from 'node:test';
import assert from 'node:assert/strict';
import {stopSmoke,journeyStopSmoke} from '../public/journey-stop-smoke.mjs';
import {smokeFixture} from './smoke-fixture.mjs';
import {evaluateJourney} from '../public/journey-core.mjs';
const now=Date.parse('2026-10-29T04:00:00Z'),H=3600000;
const stop={index:1,coordinate:[-77,39],arrival_elapsed:900,departure_elapsed:4500,duration:3600};
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);
function product(){const p=smokeFixture(now);for(const [i,value] of [[1,10],[2,30],[3,10]])p.samples[i].value=String(value/1e9);return p;}
test('clipped stop intervals integrate independently, including rising and falling threshold crossings',()=>{
  const r=stopSmoke(product(),stop,now,20,now);
  assert.equal(r.complete,true);near(r.mean_ug_m3,23.75);near(r.minutes_above_limit,45);near(r.covered_minutes,60);
  assert.equal(r.segments.length,2);near(r.segments[0].start_ug_m3,15);near(r.segments[1].end_ug_m3,25);
  assert.equal(r.source.revision,'smoke-fixture');assert.deepEqual(r.source_point,{lat:39,lon:-77});
});
test('missing middle values never bridge a gap; partial coverage withholds the whole-stop mean',()=>{
  const p=product();p.samples[2].value='NoData';const r=stopSmoke(p,stop,now,20,now);
  assert.equal(r.mean_ug_m3,null);assert.equal(r.minutes_above_limit,null);assert.equal(r.covered_minutes,0);assert.equal(r.unknown_minutes,60);
  const q=product();q.samples[3].value='NoData';const partial=stopSmoke(q,stop,now,20,now);
  assert.equal(partial.covered_minutes,45);assert.equal(partial.unknown_minutes,15);assert.equal(partial.mean_ug_m3,null);
  near(partial.segments[0].minutes_above_limit,30);
});
test('stale, duplicate, recycled, mismatched and out-of-range evidence cannot produce estimates',()=>{
  for(const mutate of [p=>p.stale=true,p=>p.checked_at=new Date(now-2*H).toISOString(),p=>p.point.lat=40,p=>p.samples.push(p.samples[2]),p=>p.samples[2].attributes={...p.samples[2].attributes,idp_issueddate:now}]){
    const p=product();mutate(p);const r=stopSmoke(p,stop,now,20,now);assert.equal(r.complete,false);assert.equal(r.mean_ug_m3,null);
  }
  for(const s of [{...stop,departure_elapsed:100000},{...stop,arrival_elapsed:-1},{...stop,departure_elapsed:900}])assert.equal(stopSmoke(product(),s,now,null,now).complete,false);
  assert.equal(stopSmoke(null,stop,now,null,now).mean_ug_m3,null);
});
test('flat and zero values preserve exact threshold semantics and optional limits',()=>{
  const p=smokeFixture(now),a=stopSmoke(p,stop,now,12,now),b=stopSmoke(p,stop,now,0,now);
  near(a.minutes_above_limit,0);near(b.minutes_above_limit,60);assert.equal(stopSmoke(p,stop,now,null,now).minutes_above_limit,null);
  for(const sample of p.samples)sample.value='0';near(stopSmoke(p,stop,now,0,now).mean_ug_m3,0);
});
test('stop lookup uses its own point evidence, omits pass-throughs, and follows departure offsets in exports',()=>{
  const route={duration:7200,stops:[stop,{...stop,index:2,duration:0}]},samples=[{lat:38,lon:-76,elapsed:0},{lat:39,lon:-77,stop_index:1,elapsed:900}];
  assert.equal(journeyStopSmoke(route,samples,[null,product()],now,20,now).length,1);
  const options={now,smokeRequested:true,smokeCeiling:20,smoke:[null,product()]};
  const r=evaluateJourney(route,samples,[],{entries:[],unknown_geometry:0},now,options);
  near(r.smoke_stops[0].mean_ug_m3,23.75);
  const later=evaluateJourney(route,samples,[],{entries:[],unknown_geometry:0},now+2*H,options);
  assert.equal(Date.parse(later.smoke_stops[0].start)-Date.parse(r.smoke_stops[0].start),2*H);
  assert.equal(evaluateJourney(route,samples,[],{entries:[],unknown_geometry:0},now,{now}).smoke_stops.length,0);
});
test('absolute stop durations survive the repeated daylight-saving hour',()=>{
  const departure=Date.parse('2026-11-01T01:30:00-04:00'),p=smokeFixture(departure);
  const r=stopSmoke(p,{...stop,arrival_elapsed:0,departure_elapsed:3600},departure,null,departure);
  assert.equal(r.start,'2026-11-01T05:30:00.000Z');assert.equal(r.end,'2026-11-01T06:30:00.000Z');near(r.mean_ug_m3,12);near(r.covered_minutes,60);
});
