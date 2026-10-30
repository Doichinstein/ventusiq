import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {comparePM} from '../public/pm-comparison-core.mjs';

const read=name=>JSON.parse(readFileSync(new URL('../docs/evidence/'+name,import.meta.url),'utf8'));
test('real prior CAMS capture reproduces the public PM2.5 pair, exclusions and empty baseline',()=>{
  const initial=read('pm-initial-capture-2026-10-30.json'),live=read('pm-first-outcome-2026-10-30.json');
  const saved=initial.readiness.forecast_source,check=initial.readiness.forecast_check;
  const actual=comparePM({place:live.place,monitor:live.monitor,observations:live.sources.observations,
    now:Date.parse(live.evaluated_at),checks:[{at:Date.parse(check.checked_at)/1000,revision:check.revision}],
    forecasts:new Map([[saved.revision,saved.product]])});
  for(const key of ['pairs','audit','metrics','lead_groups','coverage','readiness','paired_baseline','sources'])
    assert.deepEqual(actual[key],live[key],key);
  assert.equal(actual.pairs[0].forecast_pm25,17.6);
  assert.equal(actual.pairs[0].observed_pm25,6);
  assert.equal(actual.pairs[0].baseline,null);
});
