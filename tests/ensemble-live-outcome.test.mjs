import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {ensembleTargets, ensembleChoices, temperatureEvidence, compareEnsemble} from '../public/ensemble-verification-core.mjs';
import {verificationObservations} from '../public/verification-leads.mjs';

const read=name=>JSON.parse(readFileSync(new URL('../docs/evidence/'+name,import.meta.url),'utf8'));
test('real prospective GEFS capture reproduces the browser pair, exclusions and lead groups',()=>{
  const initial=read('gefs-initial-capture-2026-10-29.json').product;
  const live=read('gefs-first-outcome-2026-10-30.json'),now=Date.parse(live.generated_at);
  const targets=ensembleTargets(now),checks=[{at:Date.parse(initial.checked_at)/1000,revision:initial.revision}];
  const choices=ensembleChoices(checks,targets),forecast=temperatureEvidence(initial,live.point,now);
  const observed=verificationObservations(live.observation_evidence,now);
  const actual=compareEnsemble(targets,choices,new Map([[initial.revision,forecast]]),observed.rows);
  for(const key of ['pairs','skipped','groups','daily','sample_count','eligible_times','median_mae_f','median_bias_f','inside_p10_p90','mean_width_f'])assert.deepEqual(actual[key],live[key],key);
  assert.equal(actual.pairs[0].members.length,31);
  assert.equal(actual.pairs[0].valid_at,'2026-10-30T03:00:00.000Z');
  assert.equal(actual.pairs[0].inside_p10_p90,false);
});
