import {test} from 'node:test';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {readStationCohort,verifyStationCohort} from '../scripts/verify-station-cohort.mjs';

const bundle=await readStationCohort(fileURLToPath(new URL('../docs/evidence/station-regional-2026-10-29.json.gz',import.meta.url)));

test('retained six-station source evidence reproduces all fixed holdout cases and exclusions',()=>{
  const report=verifyStationCohort(bundle);
  assert.equal(report.aggregate.scheduled_stations,6);
  assert.equal(report.aggregate.scheduled_cases,288);
  assert.equal(report.aggregate.paired_cases,237);
  assert.equal(report.aggregate.analog_lower_than_seasonal,6);
  assert.equal(report.aggregate.analog_lower_than_persistence,1);
  assert.equal(report.stations.reduce((n,s)=>n+s.missing,0),48);
  assert.equal(report.stations.reduce((n,s)=>n+s.insufficient,0),3);
  assert.ok(report.aggregate.analog_mae>report.aggregate.persistence_mae);
});

test('source tampering, changed scores and omitted stations cannot produce a successful reproduction',()=>{
  const raw=structuredClone(bundle);raw.results[0].history.raw[0].TEMP='99.9';
  assert.throws(()=>verifyStationCohort(raw),/hash/);
  const score=structuredClone(bundle);score.results[0].validation.evaluated=48;
  assert.throws(()=>verifyStationCohort(score),/Held-out results/);
  const missing=structuredClone(bundle);missing.results.pop();
  assert.throws(()=>verifyStationCohort(missing),/membership/);
});

test('station/window mismatch and post-capture selection timestamps are rejected',()=>{
  const station=structuredClone(bundle);station.results[0].history.station.lat+=1;
  assert.throws(()=>verifyStationCohort(station),/Station lat/);
  const dates=structuredClone(bundle);dates.plan.history_window.holdout_start='2023-01-01';
  assert.throws(()=>verifyStationCohort(dates),/Fixed history window/);
  const time=structuredClone(bundle);time.selections[0].captured_at='2099-01-01T00:00:00Z';
  assert.throws(()=>verifyStationCohort(time),/capture order/);
});
