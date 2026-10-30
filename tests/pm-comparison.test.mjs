import {test} from 'node:test';import assert from 'node:assert/strict';
import {comparePM,comparisonChoices} from '../public/pm-comparison-core.mjs';
import {fixture,HOUR,now,target,reading,observations} from './pm-comparison-fixture.mjs';
test('diagnostic pairs retain signed differences, exact evidence and same-case persistence metrics',()=>{const f=fixture(),r=comparePM(f);assert.equal(r.metrics.count,1);assert.equal(r.metrics.mean_absolute_difference,2);assert.equal(r.metrics.mean_signed_difference,-2);assert.equal(r.paired_baseline.model.mean_absolute_difference,2);assert.equal(r.paired_baseline.persistence.mean_absolute_difference,2);assert.equal(r.pairs[0].collection_lead_hours,2);assert.equal(r.sources.forecasts[0].product,f.forecasts.get('forecast-before'));assert.equal(r.sources.baseline_observations[0].revision,'baseline-before');assert.equal(r.run_age_known,false);assert.equal(r.audit.length,24);});
test('check selection has inclusive 1/24-hour boundaries and excludes late analyses and too-old checks',()=>{for(const lead of [1,24])assert.equal(comparisonChoices([{at:(target-lead*HOUR)/1000,revision:'ok'}],[target])[0].check.revision,'ok');for(const lead of [0.999,24.001,-1])assert.equal(comparisonChoices([{at:Math.round((target-lead*HOUR)/1000),revision:'bad'}],[target])[0].check,null);const f=fixture();f.checks.push({at:target/1000,revision:'later'});f.forecasts.set('later',{...f.forecasts.get('forecast-before'),raw:{}});assert.equal(comparePM(f).pairs[0].forecast_revision,'forecast-before');});
test('a latest eligible bad revision stays excluded rather than cherry-picking an earlier forecast',()=>{for(const mutate of [p=>p.point.lat=40,p=>p.model='other',p=>p.raw.hourly.pm2_5[24]=null,p=>p.raw.hourly_units.pm2_5='mg/m3']){const f=fixture(),p=structuredClone(f.forecasts.get('forecast-before'));mutate(p);f.forecasts.set('latest-invalid',p);f.checks.push({at:(target-HOUR)/1000,revision:'latest-invalid'});assert.equal(comparePM(f).metrics.count,0);}});
test('missing, conflicting, estimated, moved and off-hour measurements never fabricate a pair; zero is valid',()=>{for(const features of [[],[reading(target,null)],[reading(target),reading(target,20,2)],[reading(target+1000)],[{...reading(target),geometry:{type:'Point',coordinates:[-76,39]}}],[{...reading(target),properties:{...reading(target).properties,PM25_Measured:0}}]]){const f=fixture();f.observations=observations(features);assert.equal(comparePM(f).metrics.count,0);}const f=fixture();f.observations=observations([reading(target,0)]);assert.equal(comparePM(f).pairs[0].observed_pm25,0);});
test('persistence cannot use current corrections, same-time editions, future readings or readings over three hours old',()=>{for(const edition of [observations([reading(target-3*HOUR,1)],target-2*HOUR),observations([reading(target-HOUR,1)],target-2.5*HOUR),observations([reading(target-6*HOUR,1)],target-2.5*HOUR)]){const f=fixture();f.baselineEditions.set(f.checks[0].at,edition);const r=comparePM(f);assert.equal(r.metrics.count,1);assert.equal(r.paired_baseline.model.count,0);assert.equal(r.paired_baseline.persistence.mean_absolute_difference,null);}const f=fixture();f.observations.checked_at=new Date(now+1).toISOString();assert.throws(()=>comparePM(f),/collection time/);});
test('model and persistence summaries use identical cases while lead groups account for every pair',()=>{const f=fixture();f.observations=observations([reading(target,10),reading(target-HOUR,20)]);f.checks.push({at:(target-HOUR)/1000,revision:'forecast-before'});f.baselineEditions.clear();f.baselineEditions.set((target-2*HOUR)/1000,observations([reading(target-4*HOUR,11)],target-2.5*HOUR));const r=comparePM(f);assert.equal(r.metrics.count,2);assert.equal(r.paired_baseline.model.count,1);assert.equal(r.paired_baseline.model.mean_absolute_difference,12);assert.equal(r.paired_baseline.persistence.mean_absolute_difference,9);assert.equal(r.lead_groups.reduce((n,g)=>n+g.count,0),2);});


test('hourly outcomes and persistence must be complete at their collection cutoff',()=>{const f=fixture();f.observations=observations([reading(target)],target+HOUR/2);assert.equal(comparePM(f).metrics.count,0);const b=fixture();b.baselineEditions.set(b.checks[0].at,observations([reading(target-3*HOUR,12)],target-2.5*HOUR));assert.equal(comparePM(b).paired_baseline.model.count,0);const c=fixture();c.observations=observations([reading(target+HOUR)],now);assert.equal(comparePM(c).metrics.count,0);});

test('a mid-hour capture waits for one-hour lead and a full measurement period without scoring its future sample',()=>{
  const f=fixture();f.checks=[{at:now/1000,revision:'forecast-before'}];
  const r=comparePM(f);
  assert.equal(r.readiness.status,'awaiting_completed_hour');
  assert.equal(r.readiness.target_at,'2026-10-29T08:00:00.000Z');
  assert.equal(r.readiness.period_ends_at,'2026-10-29T09:00:00.000Z');
  assert.equal(r.readiness.forecast_check.collection_lead_hours,1.5);
  assert.equal(r.readiness.forecast_source.product,f.forecasts.get('forecast-before'));
  assert.equal(r.metrics.count,0);assert.equal(r.metrics.mean_absolute_difference,null);
  assert.equal(r.coverage.forecast_checks,0);assert.equal(r.sources.forecasts.length,0);
});

test('readiness uses an exact lead boundary and advances only after the measurement hour ends',()=>{
  const f=fixture();f.checks=[{at:(target+HOUR)/1000,revision:'forecast-before'}];
  let r=comparePM(f);assert.equal(r.readiness.target_at,'2026-10-29T07:00:00.000Z');
  f.now=Date.parse('2026-10-29T07:59:59Z');r=comparePM(f);assert.equal(r.readiness.status,'awaiting_completed_hour');assert.equal(r.readiness.target_at,'2026-10-29T07:00:00.000Z');
  f.now=Date.parse('2026-10-29T08:00:00Z');r=comparePM(f);assert.equal(r.readiness.status,'measurement_unavailable');assert.equal(r.readiness.target_at,'2026-10-29T07:00:00.000Z');
  f.observations=observations([reading(Date.parse('2026-10-29T07:00:00Z'))],f.now);
  r=comparePM(f);assert.equal(r.metrics.count,1);assert.equal(r.readiness.status,'paired');
});

test('pending readiness rejects invalid latest products, missing samples and future-dated checks without fallback',()=>{
  for(const mutate of [p=>p.point.lat=40,p=>p.model='other',p=>p.raw.hourly.pm2_5.fill(null),p=>p.raw.hourly_units.pm2_5='mg/m3']){
    const f=fixture(),bad=structuredClone(f.forecasts.get('forecast-before'));mutate(bad);
    f.forecasts.set('invalid-latest',bad);f.checks=[{at:(now-60000)/1000,revision:'forecast-before'},{at:now/1000,revision:'invalid-latest'}];
    const r=comparePM(f);assert.equal(r.readiness.status,'no_pending_forecast');assert.equal(r.metrics.count,0);
  }
  const f=fixture();f.checks=[{at:(now+HOUR)/1000,revision:'forecast-before'}];assert.equal(comparePM(f).readiness.status,'no_pending_forecast');
});
