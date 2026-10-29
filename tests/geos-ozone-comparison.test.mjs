import {test} from 'node:test';
import assert from 'node:assert/strict';
import {compareGeosOzone} from '../public/geos-ozone-comparison.mjs';
import {ozoneHistory} from '../public/ozone-core.mjs';
import {geosFixture,GEOS_TEST_NOW} from './geos-cf-fixture.mjs';
import {monitor,reading,observations,HOUR} from './ozone-fixture.mjs';
const target=Date.parse('2026-10-29T22:00:00Z'),now=target+2.5*HOUR;
const check={at:GEOS_TEST_NOW/1000,revision:'before'};
function run({features=[reading(target,20)],checks=[check],forecasts=new Map([['before',geosFixture()]]),time=now}={}){
  return compareGeosOzone({trend:ozoneHistory(observations(features,time),monitor,time),checks,forecasts});
}
test('NASA aligns complete hourly means in ppb and preserves distinct collection/run leads and source evidence',()=>{
  const r=run(),row=r.rows.find(r=>r.paired);assert.equal(r.paired_hours,1);assert.equal(row.at,new Date(target).toISOString());assert.equal(row.end,new Date(target+HOUR).toISOString());assert.ok(Math.abs(row.model_mean_ppb-49.360096)<1e-8);assert.equal(row.difference_ppb,row.model_mean_ppb-20);assert.equal(row.forecast_check.collection_lead_hours,1.75);assert.equal(row.model_lead_start_hours,37);assert.equal(row.model_lead_end_hours,38);assert.equal(r.metrics.mean_signed_difference_ppb,row.difference_ppb);assert.equal(r.model_location.grid_to_monitor_km,0);assert.equal(r.forecast_sources[0].product.raw.series.o3,geosFixture().raw.series.o3);
});
test('current or too-late captures never backfill prior readings; 1 and 24 hour boundaries are inclusive',()=>{
  for(const hours of [0,.99,24.01]){const r=run({checks:[{at:(target-hours*HOUR)/1000,revision:'before'}]});assert.equal(r.paired_hours,0);assert.equal(r.metrics.mean_absolute_difference_ppb,null);}
  for(const hours of [1,24])assert.equal(run({checks:[{at:(target-hours*HOUR)/1000,revision:'before'}]}).paired_hours,1);
});
test('bad latest eligible edition cannot fall back to good old data; ambiguous checks remain unknown',()=>{
  const bad=geosFixture();bad.point.lat=40;
  const r=run({checks:[check,{at:(target-HOUR)/1000,revision:'bad'}],forecasts:new Map([['before',geosFixture()],['bad',bad]])});assert.equal(r.paired_hours,0);assert.match(r.rows.find(r=>Date.parse(r.at)===target).reason,/Invalid/);
  const ambiguous=run({checks:[check,{...check,revision:'conflict'}]});assert.equal(ambiguous.paired_hours,0);assert.match(ambiguous.rows.find(r=>Date.parse(r.at)===target).reason,/Conflicting forecast checks/);
});
test('source coordinate QC, missing means, delayed and old-run products cannot enter differences',()=>{
  const bad=geosFixture();bad.raw.series.o3=bad.raw.series.o3.replace(/\[2\]\[0\]\[0\], [^\n]+/,'[2][0][0], NaN');
  for(const p of [bad,{...geosFixture(),stale:true},{...geosFixture(),error:'source failed'}])assert.equal(run({forecasts:new Map([['before',p]])}).paired_hours,0);
  const qcAt=Date.parse('2026-10-30T09:00:00Z');assert.equal(run({features:[reading(qcAt)],time:qcAt+1.5*HOUR}).paired_hours,0);
  const oldAt=Date.parse('2026-10-30T14:00:00Z');assert.equal(run({features:[reading(oldAt)],time:oldAt+1.5*HOUR,checks:[{at:(oldAt-2*HOUR)/1000,revision:'before'}]}).paired_hours,0);
});
test('summary denominators use only paired hours; zero and negative source readings are retained with flags',()=>{
  const r=run({features:[reading(target,0),reading(target+HOUR,-1)]});assert.equal(r.paired_hours,2);assert.equal(r.coverage.negative_measured_pairs,1);assert.equal(r.lead_groups.reduce((n,g)=>n+g.count,0),2);const pairs=r.rows.filter(r=>r.paired);assert.equal(r.metrics.mean_absolute_difference_ppb,pairs.reduce((n,p)=>n+Math.abs(p.difference_ppb),0)/2);assert.match(pairs[1].flags.join(' '),/drift/);
});
test('incomplete or mismatched observation periods cannot receive a difference',()=>{
  const trend=ozoneHistory(observations([reading(target)],now),monitor,now);trend.rows.find(r=>Date.parse(r.at)===target).end=new Date(target+2*HOUR).toISOString();const r=compareGeosOzone({trend,checks:[check],forecasts:new Map([['before',geosFixture()]])});assert.equal(r.paired_hours,0);assert.match(r.rows.find(r=>Date.parse(r.at)===target).reason,/incomplete or invalid/);
});
