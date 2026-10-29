import {test} from 'node:test';import assert from 'node:assert/strict';
import {smokeFixture} from './smoke-fixture.mjs';
import {journeySmoke,journeySmokeLimit,collectJourneySmoke,smokeValue} from '../public/journey-smoke.mjs';
import {evaluateJourney} from '../public/journey-core.mjs';
const now=Date.parse('2026-10-29T04:00:00Z'),H=3600000,point={lat:39,lon:-77};
test('fractional ETAs use surrounding hourly instantaneous samples and exact-hour ETAs use only one',()=>{
  const p=smokeFixture(now);p.samples[2].value='0.000000030';const r=journeySmoke(p,point,now+H/2,20,now);assert.equal(r.samples.length,2);assert.ok(Math.abs(r.maximum_ug_m3-30)<1e-10);assert.equal(r.exceeds,true);assert.equal(r.complete,true);assert.equal(r.continuous_coverage,false);assert.deepEqual(r.samples.map(s=>s.at),['2026-10-29T04:00:00.000Z','2026-10-29T05:00:00.000Z']);const exact=journeySmoke(p,point,now,20,now);assert.equal(exact.samples.length,1);assert.equal(exact.maximum_ug_m3,12);assert.equal(exact.exceeds,false);
});
test('a missing bracket cannot produce a below-limit result; a known high sample remains explicit',()=>{
  const p=smokeFixture(now);p.samples[1].value='NoData';let r=journeySmoke(p,point,now+H/2,20,now);assert.equal(r.complete,false);assert.equal(r.maximum_ug_m3,12);assert.equal(r.exceeds,null);p.samples[2].value='0.000000030';r=journeySmoke(p,point,now+H/2,20,now);assert.equal(r.exceeds,true);assert.equal(r.complete,false);p.samples[2].value='0';assert.equal(journeySmoke(p,point,now+H,0,now).exceeds,false);
});
test('stale, mismatched, out-of-horizon, recycled and duplicate samples remain unknown',()=>{
  const p=smokeFixture(now);for(const patch of [{stale:true},{checked_at:new Date(now-2*H).toISOString()},{issued_at:new Date(now-31*H).toISOString()},{error:'Source failure'}]){const r=journeySmoke({...p,...patch},point,now,1,now);assert.equal(r.maximum_ug_m3,null);assert.equal(r.exceeds,null);}
  assert.match(journeySmoke(p,{lat:40,lon:-77},now,null,now).reason,/different location/);assert.match(journeySmoke(p,point,now-1,null,now).reason,/horizon/);assert.match(journeySmoke(p,point,now+77*H,null,now).reason,/horizon/);p.samples.push(p.samples[1]);assert.equal(journeySmoke(p,point,now,null,now).complete,false);
});
test('smoke coverage and limits are separate from hourly/gust coverage and vary with departure',()=>{
  const p=smokeFixture(now);p.samples[3].value='0.000000050';const samples=[{...point,elapsed:0}],route={duration:0},options={now,smoke:[p],smokeRequested:true,smokeCeiling:20};const a=evaluateJourney(route,samples,[],{entries:[],unknown_geometry:0},now,options),b=evaluateJourney(route,samples,[],{entries:[],unknown_geometry:0},now+2*H,options);assert.equal(a.covered_samples,0);assert.equal(a.complete_smoke_samples,1);assert.equal(a.smoke_exceedance_samples,0);assert.equal(b.smoke_exceedance_samples,1);assert.equal(b.max_bracketing_smoke,50);assert.equal(b.rows[0].smoke.revision,'smoke-fixture');
  assert.equal(evaluateJourney(route,samples,[],{entries:[],unknown_geometry:0},now,{now}).rows[0].smoke,null);
});
test('sampling uses absolute timestamps across repeated daylight-saving hours',()=>{
  const base=Date.parse('2026-11-01T04:00:00Z'),p=smokeFixture(base);const a=journeySmoke(p,point,Date.parse('2026-11-01T01:30:00-04:00'),null,base),b=journeySmoke(p,point,Date.parse('2026-11-01T01:30:00-05:00'),null,base);assert.equal(Date.parse(b.samples[0].at)-Date.parse(a.samples[0].at),H);
});
test('collector warms catalog once, deduplicates rounded locations and skips unsupported points',async()=>{
  const calls=[],points=[point,{lat:39.001,lon:-77.001},{lat:40,lon:-77},{lat:60,lon:-150}],request=async url=>{calls.push(url);return url==='/api/smoke/catalog'?{}:{tag:url};};const r=await collectJourneySmoke(points,request);assert.equal(calls[0],'/api/smoke/catalog');assert.equal(calls.length,3);assert.equal(r[0],r[1]);assert.match(r[3].error,/coverage/);assert.notEqual(r[0],r[2]);
});
test('catalog failures prevent point collection, per-point failures stay local and cancellation stops new requests',async()=>{
  let calls=0;const failed=await collectJourneySmoke([point],async()=>{calls++;throw Error('catalog down');});assert.equal(calls,1);assert.match(failed[0].error,/catalog down/);
  const partial=await collectJourneySmoke([point,{lat:40,lon:-77}],async url=>{if(url.includes('lat=40'))throw Error('point down');return {ok:true};});assert.equal(partial[0].ok,true);assert.match(partial[1].error,/point down/);
  const abort=new AbortController(),list=Array.from({length:8},(_,i)=>({lat:39+i/10,lon:-77}));calls=0;await collectJourneySmoke(list,async url=>{calls++;if(url.includes('forecast'))abort.abort();return {};},{signal:abort.signal});assert.equal(calls,2);
});
test('limits preserve zero and small concentrations never round to zero',()=>{assert.equal(journeySmokeLimit(''),null);assert.equal(journeySmokeLimit('0'),0);for(const n of [-1,10001,'bad'])assert.throws(()=>journeySmokeLimit(n),/limit/);assert.equal(smokeValue(.0001),'<0.001 µg/m³');assert.equal(smokeValue(0),'0 µg/m³');});
