import {test} from 'node:test';import assert from 'node:assert/strict';
import {verifyForwardCohort,outcomeRows,outcomeRequests,collectForwardOutcomes,scoreForwardOutcomes,sha} from '../lib/analog-forward.mjs';
import {cohortFixture,outcomeFixture,registered,evaluation} from './analog-forward-fixture.mjs';
const fixture=()=>{const f=cohortFixture();return {...f,verified:verifyForwardCohort(f.bundle,f.plan)};};

test('cohort verification rejects edits, omitted groups, altered source payloads and unreproducible predictions',()=>{
  const {bundle,plan,verified}=fixture();assert.equal(verified.document.cases.length,3);
  const rehash=b=>{b.integrity.sha256=sha(b.document);return {...plan,cohort_sha256:b.integrity.sha256};};
  let b=structuredClone(bundle);b.document.cases[0].target.high_c=55;assert.throws(()=>verifyForwardCohort(b,plan),/hash/);
  b=structuredClone(bundle);b.document.cases[0].prediction.outcomes.high_c.median=0;assert.throws(()=>verifyForwardCohort(b,rehash(b)),/prediction/);
  b=structuredClone(bundle);Object.values(b.document.sources)[0].raw.grid.lat=40;assert.throws(()=>verifyForwardCohort(b,rehash(b)),/Source revision/);
  const p=structuredClone(plan);Object.values(p.groups)[0].pop();assert.throws(()=>verifyForwardCohort(bundle,p),/groups/);
  b=structuredClone(bundle);b.document.cases[0].forecast_check='2026-10-30T00:00:00Z';assert.throws(()=>verifyForwardCohort(b,rehash(b)),/boundary/);
  verified.document.cases[0].prediction.outcomes.high_c.median=2;assert.throws(()=>outcomeRequests(verified,evaluation),/changed after verification/);
});

test('future outcome days cause no requests and remain pending with null errors',async()=>{
  const {verified}=fixture();let calls=0;const outcomes=await collectForwardOutcomes(verified,{clock:()=>registered+120000,fetcher:async()=>{calls++;throw Error('Must not fetch');}});
  assert.equal(calls,0);assert.equal(outcomeRequests(verified,registered+120000).length,0);
  const report=scoreForwardOutcomes(verified,outcomes,registered+120000);assert.equal(report.metrics.high_c.pending_points,3);assert.equal(report.metrics.high_c.analog_mae,null);assert.equal(report.metrics.high_c.paired_groups,0);
});

test('scores identical analog/baseline cases and weights shared grid days equally, not repeated points',()=>{
  const {verified}=fixture(),report=scoreForwardOutcomes(verified,outcomeFixture(verified),evaluation),m=report.metrics.high_c;
  assert.equal(m.paired_points,3);assert.equal(m.paired_groups,2);assert.equal(m.analog_mae,15);assert.equal(m.seasonal_mae,15);assert.equal(m.difference_seasonal,0);
  assert.deepEqual(m.groups.map(g=>g.paired_points),[2,1]);assert.equal(report.unique_grids,1);assert.equal(report.metrics.rain_mm.analog_mae,0);
});

test('missing variables are excluded from both methods while valid zero outcomes stay eligible',()=>{
  const {verified}=fixture(),o=outcomeFixture(verified,{values:day=>[20,10,0,day==='2026-10-30'?-999:0]});
  const report=scoreForwardOutcomes(verified,o,evaluation);assert.equal(report.metrics.rain_mm.paired_points,1);assert.equal(report.metrics.rain_mm.missing_outcome_points,2);assert.equal(report.metrics.rain_mm.analog_mae,0);assert.equal(report.metrics.wind_ms.paired_points,3);
  const {bundle,plan}=cohortFixture({peak:70}),v=verifyForwardCohort(bundle,plan),insufficient=scoreForwardOutcomes(v,outcomeFixture(v),evaluation);
  assert.equal(insufficient.metrics.high_c.insufficient_prediction_points,3);assert.equal(insufficient.metrics.high_c.paired_points,0);assert.equal(insufficient.metrics.high_c.seasonal_mae,null);
});

test('outcome editions require exact planned UTC/grid/units and a unique, hashed, mature capture',()=>{
  const {verified}=fixture();
  for(const mutate of [o=>o.editions[0].raw.header.time_standard='LST',o=>o.editions[0].raw.parameters.WS10M.units='mph',o=>o.editions[0].raw.geometry.coordinates[0]=0]){
    const o=outcomeFixture(verified);mutate(o);o.editions[0].sha256=sha(o.editions[0].raw);assert.throws(()=>scoreForwardOutcomes(verified,o,evaluation),/Invalid outcome|coordinates/);
  }
  const o=outcomeFixture(verified);o.editions.push(structuredClone(o.editions[0]));assert.throws(()=>scoreForwardOutcomes(verified,o,evaluation),/Ambiguous/);
  const early=outcomeFixture(verified);early.editions[0].fetched_at='2026-10-29T00:00:00Z';assert.throws(()=>scoreForwardOutcomes(verified,early,evaluation),/time or hash/);
  const altered=outcomeFixture(verified);altered.editions[0].raw.header.fill_value=-1000;assert.throws(()=>scoreForwardOutcomes(verified,altered,evaluation),/hash/);
  const e=outcomeFixture(verified).editions[0];e.raw.properties.parameter.T2M_MAX['20261030']=-10;
  const rows=outcomeRows(e.raw,e.grid,e.window);assert.equal(rows[0].high_c,null);assert.equal(rows[0].low_c,null);assert.equal(rows[0].wind_ms,0);
});

test('collector requests one edition per grid, rejects redirects and reports unavailable outcomes without fabricating data',async()=>{
  const {verified}=fixture(),o=outcomeFixture(verified);let calls=0;
  const result=await collectForwardOutcomes(verified,{clock:()=>evaluation,fetcher:async(url,options)=>{calls++;assert.equal(options.redirect,'manual');assert.equal(url,o.editions[0].source_url);return Response.json(o.editions[0].raw);}});
  assert.equal(calls,1);assert.equal(result.editions.length,1);assert.equal(scoreForwardOutcomes(verified,result,evaluation).metrics.high_c.paired_groups,2);
  const failed=await collectForwardOutcomes(verified,{clock:()=>evaluation,fetcher:async()=>new Response(null,{status:302})});assert.equal(failed.editions.length,0);assert.equal(failed.errors.length,1);assert.equal(scoreForwardOutcomes(verified,failed,evaluation).metrics.high_c.missing_outcome_points,3);
});

test('a fetch crossing midnight retains its planned window instead of silently adding the next outcome day',async()=>{
  const {verified}=fixture(),before=Date.parse('2026-10-31T23:59:59Z'),after=Date.parse('2026-11-01T00:00:01Z');let reads=0;
  const o=outcomeFixture(verified,{now:before});
  const result=await collectForwardOutcomes(verified,{clock:()=>reads++===0?before:after,fetcher:async()=>Response.json(o.editions[0].raw)});
  const report=scoreForwardOutcomes(verified,result,after);assert.equal(report.metrics.high_c.paired_points,2);assert.equal(report.metrics.high_c.missing_outcome_points,1);
});
