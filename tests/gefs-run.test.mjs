import {test} from 'node:test';import assert from 'node:assert/strict';
import {normalizeGEFSRun,gefsRunQuery} from '../public/gefs-run-core.mjs';import {ensembleSpread} from '../public/ensemble-core.mjs';import {runProduct,runNow} from './fixtures/gefs-run.mjs';
const run=p=>p.raw.results[0].forecasts[0];
test('identified daily run preserves provenance, lead times, all members and native conversions',()=>{
 const p=runProduct();run(p).ensembleMembers.reverse();const r=ensembleSpread(p,{now:runNow,threshold:32});
 assert.equal(r.complete_rows,24);assert.equal(r.initialization_at,'2026-10-29T00:00:00.000Z');assert.equal(r.snapshot_id,p.raw.results[0].snapshotId);assert.equal(r.run_age_hours,3);assert.equal(r.rows[0].lead_hours,3);assert.equal(r.rows.at(-1).lead_hours,72);assert.deepEqual([r.rows[0].min,r.rows[0].p10,r.rows[0].median,r.rows[0].p90,r.rows[0].max],[32,37.4,59,80.6,86]);assert.equal(r.rows[0].threshold_count,1);assert.equal(r.evidence,p);
 const wind=ensembleSpread(p,{now:runNow,metric:'wind'});assert.ok(Math.abs(wind.rows[0].median-11.184681460272)<1e-10);assert.equal(p.raw.results[0].forecasts[0].ensembleMembers[0].data.temperature_2m[0],30);
});
test('missing components, missing members, strings and implausible values never complete a set',()=>{
 const p=runProduct();run(p).ensembleMembers[0].data.wind_u_10m[1]=null;assert.equal(ensembleSpread(p,{now:runNow,metric:'wind'}).rows[0].valid_members,30);
 run(p).ensembleMembers[1].data.temperature_2m[1]='1';run(p).ensembleMembers[2].data.temperature_2m[1]=999;run(p).ensembleMembers.pop();const r=ensembleSpread(p,{now:runNow});assert.equal(r.rows[0].valid_members,28);assert.equal(r.rows[0].p10,null);
});
test('run identity, grid, units and time alignment are checked before statistics',()=>{
 for(const mutate of [p=>p.raw.results.push(p.raw.results[0]),p=>p.raw.results[0].snapshotId='unknown',p=>p.raw.results[0].dataProduct.id='noaa-gfs',p=>p.raw.results[0].point.selected.grid.latitudeIndex++,p=>p.raw.results[0].point.requested.latitude=40,p=>p.raw.results[0].variables.temperature_2m.unit='K',p=>run(p).initTime='2026-10-29T06:00:00Z',p=>run(p).initTime='2026-10-30T00:00:00Z',p=>run(p).leadTimeHours[1]=6,p=>run(p).validTimes[1]=run(p).validTimes[0],p=>run(p).ensembleMembers[1].member=0,p=>run(p).ensembleMembers[1].member=31,p=>run(p).ensembleMembers[1].data.wind_v_10m.pop()]){const p=runProduct();mutate(p);assert.throws(()=>normalizeGEFSRun(p.raw,p.point,runNow));}
});
test('run age is independent of retrieval age and missing tails stay unknown',()=>{
 const p=runProduct(),now=runNow+40*3600000;p.checked_at=new Date(now).toISOString();const r=ensembleSpread(p,{now});assert.equal(r.collection_recent,true);assert.equal(r.run_recent,false);assert.equal(r.run_age_hours,43);
 assert.equal(ensembleSpread(p,{now:runNow+120*3600000}).complete_rows,0);p.stale=true;assert.equal(ensembleSpread(p,{now}).collection_recent,false);
});
test('run query limits both variables and forecast horizon',()=>{const q=gefsRunQuery(runProduct().point).queries[0];assert.equal(q.maxLeadTimeHours,120);assert.deepEqual(q.variables,['temperature_2m','wind_u_10m','wind_v_10m']);assert.equal(q.dataProductId,'noaa-gefs-forecast-35-day');});
