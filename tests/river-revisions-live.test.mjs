import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {compareRiverForecasts} from '../public/river-changes-core.mjs';

test('live DeLand revision newly reaches minor flood level without inventing an earlier crossing',()=>{
  const {report}=JSON.parse(readFileSync(new URL('../docs/evidence/river-threshold-DLAF1-2026-10-30.json',import.meta.url),'utf8'));
  const result=compareRiverForecasts(report.current,report.previous,Date.parse(report.evaluated_at));
  assert.equal(result.status,'compared');
  assert.equal(result.current_issued_at,'2026-10-30T12:37:00.000Z');
  assert.equal(result.previous_issued_at,'2026-10-30T00:46:00.000Z');
  assert.equal(result.pairs.length,17);
  assert.equal(result.pairs.filter(p=>Math.abs(p.change)>1e-9).length,12);
  assert.equal(result.high.previous.value,3.9);assert.equal(result.high.current.value,4);
  const minor=result.thresholds.find(t=>t.name==='minor');
  assert.equal(minor.previous_value,4);assert.equal(minor.current_value,4);
  assert.equal(minor.change,'newly_reaches');assert.equal(minor.before.status,'not_reached');
  assert.equal(minor.after.at,'2026-10-31T00:00:00.000Z');
  assert.equal(minor.after.after,null);assert.equal(minor.timing,null);
  assert.equal(result.datum_status,'not_supplied');
  for(const key of ['pairs','thresholds','horizon','largest_change','high'])assert.deepEqual(result[key],report[key]);
  // Retained reports are snapshots. Without a new collection, their expired
  // checks must suppress conclusions when evaluated later.
  const later=compareRiverForecasts(report.current,report.previous,Date.parse('2026-10-31T00:00:01Z'));
  assert.equal(later.status,'stale');
  assert.deepEqual(later.thresholds,[]);
});

test('retained DeLand issues reproduce seven nonzero revisions without inventing a crossing time',()=>{
  const {report}=JSON.parse(readFileSync(new URL('../docs/evidence/river-revisions-DLAF1-2026-10-30.json',import.meta.url),'utf8'));
  const result=compareRiverForecasts(report.current,report.previous,Date.parse(report.evaluated_at));
  assert.equal(result.status,'compared');
  assert.equal(result.current_issued_at,'2026-10-30T00:46:00.000Z');
  assert.equal(result.previous_issued_at,'2026-10-29T12:53:00.000Z');
  assert.equal(result.same_issue_revision,false);
  assert.equal(result.datum_status,'not_supplied');
  assert.equal(result.pairs.length,18);
  assert.equal(result.pairs.filter(p=>Math.abs(p.change)>1e-9).length,7);
  assert.equal(result.largest_change.at,'2026-10-30T12:00:00.000Z');
  assert.ok(Math.abs(result.largest_change.change-.1)<1e-9);
  assert.equal(result.high.previous.value,4);
  assert.equal(result.high.current.value,4);
  assert.equal(result.high.change,0);
  assert.equal(result.horizon.current_future,20);
  assert.equal(result.horizon.previous_future,18);
  for(const name of ['action','minor']){
    const threshold=result.thresholds.find(t=>t.name===name);
    assert.equal(threshold.change,'still_reaches');
    assert.equal(threshold.before.after,null);
    assert.equal(threshold.after.after,null);
    assert.equal(threshold.timing,null);
  }
  for(const key of ['pairs','largest_change','high','horizon','thresholds'])assert.deepEqual(result[key],report[key]);
});
