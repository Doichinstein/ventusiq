import {test} from 'node:test';import assert from 'node:assert/strict';
import {analogDiagnostics} from '../public/analog-diagnostics.mjs';
const entry=(date,actual,analog,seasonal,persistence,range=[analog-1,analog+1])=>({date,actual:{high_c:actual},prediction:{high_c:{n:20,median:analog,p10:range[0],p90:range[1]}},baseline:{high_c:{n:100,median:seasonal}},persistence:{high_c:persistence}});
const evaluate=cases=>analogDiagnostics(cases,cases.map(c=>({date:c.date,status:'evaluated'})),['high_c'],10);
test('same-case differences, bias, wins and spread coverage agree with hand-calculated examples',()=>{
  const r=evaluate([entry('2024-01-07',10,12,15,10,[10,14]),entry('2024-07-21',20,16,19,24,[17,21])]),m=r.cohorts[0].metrics.high_c;
  assert.equal(m.n,2);assert.equal(m.analog_mae,3);assert.equal(m.seasonal_mae,3);assert.equal(m.persistence_mae,2);assert.equal(m.analog_bias,-1);assert.equal(m.difference_seasonal,0);assert.equal(m.difference_persistence,1);assert.deepEqual(m.versus_seasonal,{lower:1,tied:0,higher:1});assert.deepEqual(m.versus_persistence,{lower:0,tied:1,higher:1});assert.equal(m.interval.n,1);assert.equal(m.interval.inside,1);assert.equal(m.interval.mean_width,4);assert.equal(m.pairs[1].interval_result,'unavailable');
});
test('calendar seasons and years retain all scheduled failures without changing scored denominators',()=>{
  const cases=[entry('2024-12-07',1,2,3,4),entry('2025-01-21',1,2,3,4)],trials=[...cases.map(c=>({date:c.date,status:'evaluated'})),{date:'2024-03-07',status:'missing'},{date:'2025-06-21',status:'insufficient'}],r=analogDiagnostics(cases,trials,['high_c'],10);const djf=r.cohorts.find(c=>c.id==='DJF');assert.equal(djf.attempted,2);assert.equal(djf.metrics.high_c.n,2);assert.equal(r.cohorts.find(c=>c.id==='MAM').missing,1);assert.equal(r.cohorts.find(c=>c.id==='JJA').insufficient,1);assert.equal(r.cohorts.find(c=>c.id==='2024').attempted,2);assert.equal(r.cohorts.find(c=>c.id==='2025').evaluated,1);assert.equal(r.cohorts.find(c=>c.id==='SON').metrics.high_c.analog_mae,null);
});
test('missing actual, baseline or persistence excludes a case from every error method',()=>{
  const cases=[entry('2024-01-07',10,12,15,10),entry('2024-01-21',null,12,15,10),entry('2024-02-07',10,12,null,10),entry('2024-02-21',10,12,15,null),entry('2024-03-07',10,12,15,10)];cases[4].prediction.high_c.n=9;const m=evaluate(cases).cohorts[0].metrics.high_c;assert.equal(m.n,1);assert.equal(m.analog_mae,2);assert.equal(m.seasonal_mae,5);assert.equal(m.persistence_mae,0);assert.equal(m.pairs[0].date,'2024-01-07');
});
test('range coverage includes endpoints, preserves zero-width spreads and never invents a missing interval',()=>{
  const m=evaluate([entry('2024-01-07',0,0,0,0,[0,0]),entry('2024-01-21',1,2,2,2,[2,3]),entry('2024-02-07',4,2,2,2,[1,3]),entry('2024-02-21',2,2,2,2,[null,null])]).cohorts[0].metrics.high_c;assert.equal(m.interval.n,3);assert.equal(m.interval.inside,1);assert.equal(m.interval.below,1);assert.equal(m.interval.above,1);assert.equal(m.interval.mean_width,1);
});
test('empty cohorts have null errors and duplicate or inconsistent test identities fail',()=>{
  const r=analogDiagnostics([],[{date:'2024-01-07',status:'missing'}],['high_c'],10);assert.equal(r.cohorts[0].metrics.high_c.n,0);assert.equal(r.cohorts[0].metrics.high_c.analog_bias,null);assert.equal(r.cohorts[0].metrics.high_c.interval.mean_width,null);assert.throws(()=>analogDiagnostics([],[{date:'2024-01-07',status:'evaluated'}],['high_c'],10),/schedule/);assert.throws(()=>analogDiagnostics([],Array(2).fill({date:'2024-01-07',status:'missing'}),['high_c'],10),/schedule/);
});
