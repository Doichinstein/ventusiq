import {test} from 'node:test';import assert from 'node:assert/strict';
import {evaluateCompound,COMPOUND_RULES,RULESET_VERSION} from '../public/compound-core.mjs';
import {compoundWatchSetting,evaluateCompoundWatch} from '../public/compound-watch-core.mjs';
import {watchSettings,evaluateWatch} from '../public/watch-core.mjs';
import '../public/weather-core.js';
const now=Date.parse('2026-10-29T04:00:00Z'),stamp=h=>new Date(now+h*3600000).toISOString();
const input=()=>({core:globalThis.WeatherCore,place:{lat:39,lon:-77},now,alerts:{collected_at:stamp(0),features:[]},forecast:{checked_at:stamp(0),issued_at:stamp(-1),metadata:{properties:{forecastZone:'zone'}},revision:'r',forecast:{properties:{periods:Array.from({length:49},(_,i)=>({startTime:stamp(i),endTime:stamp(i+1),temperature:20,temperatureUnit:'F',windSpeed:'30 mph',probabilityOfPrecipitation:{value:80,unitCode:'wmoUnit:percent'}}))}}}});
const selected=['precip-wind'],report=()=>evaluateCompound(input());
function setStatus(status,coverage=status!=='unknown'){const r=report(),rule=r.rules.find(r=>r.id==='precip-wind');rule.status=status;rule.coverage_complete=coverage;if(status!=='matched')rule.windows=[];return r;}
const run=(r,previous=null)=>evaluateCompoundWatch({selected,report:r,previous});

test('selected compound rules are canonical, opt-in, and separate from gauge watches',()=>{
  assert.equal(watchSettings({alerts:true}).compound,undefined);assert.equal(watchSettings({alerts:true,compound:[]}).compound,undefined);
  assert.deepEqual(watchSettings({alerts:false,compound:['precip-wind','precip-wind','heat-air-alerts']}).compound,['heat-air-alerts','precip-wind']);
  for(const compound of [true,'precip-wind',['bad'],Array(7).fill('precip-wind')])assert.throws(()=>compoundWatchSetting(compound),/Invalid/);
  assert.throws(()=>watchSettings({river:{gauge:'TEST1',category:'minor'},compound:selected}),/separate place watch/);
});
test('compound state changes deduplicate and unknown gaps preserve the last known status',()=>{
  const no=run(setStatus('not_detected'));assert.equal(no.changes.length,0);const yes=run(report(),no.snapshot);assert.equal(yes.changes.filter(e=>e.kind==='compound').length,1);assert.equal(run(report(),yes.snapshot).changes.length,0);
  const gap=run(setStatus('unknown'),yes.snapshot);assert.equal(gap.snapshot.rules[0].last_known,'matched');assert.equal(gap.changes.filter(e=>e.kind==='compound').length,0);assert.equal(gap.changes[0].kind,'compound_coverage');assert.equal(run(setStatus('unknown'),gap.snapshot).changes.length,0);
  const restored=run(report(),gap.snapshot);assert.equal(restored.changes.filter(e=>e.kind==='compound').length,0);assert.equal(restored.changes[0].kind,'compound_coverage');
  const ended=run(setStatus('not_detected'),gap.snapshot);assert.equal(ended.changes.find(e=>e.kind==='compound').after.status,'not_detected');assert.match(ended.changes.find(e=>e.kind==='compound').title,/not an all-clear/);
});
test('first usable data and method changes establish a baseline, not a new weather crossing',()=>{
  const gap=run(setStatus('unknown')),known=run(report(),gap.snapshot);assert.ok(known.changes.some(e=>e.kind==='baseline_compound'));assert.ok(!known.changes.some(e=>e.kind==='compound'));
  const prior=run(setStatus('not_detected')).snapshot;prior.ruleset_version='old';const reset=run(report(),prior);assert.deepEqual(reset.changes.map(e=>e.kind),['baseline_compound']);
});
test('partial positive evidence remains explicit and retains only selected premise values and provenance',()=>{
  const result=run(setStatus('matched',false));assert.equal(result.covered,false);assert.equal(result.snapshot.rules.length,1);const r=result.snapshot.rules[0];assert.equal(r.status,'matched');assert.equal(r.evidence.length,48);assert.equal(r.evidence[0].revision,'r');assert.equal(r.evidence[0].values.precipitation_probability_percent,80);assert.equal(r.evidence[0].source_snapshot,undefined);assert.ok(r.windows.flatMap(w=>w.segments).every(s=>s.premises.every(id=>r.evidence.some(e=>e.id===id))));
});
test('a compound-only watch has an initial baseline containing all selected rule evidence',async()=>{
  const data=input(),r=await evaluateWatch({point:'39,-77',settings:{alerts:false,compound:selected},forecast:data.forecast,alerts:data.alerts,compound:report(),now});assert.deepEqual(r.changes.map(e=>e.kind),['baseline']);assert.equal(r.changes[0].after.compound.rules[0].status,'matched');assert.equal(r.snapshot.coverage.compound,true);assert.equal(r.snapshot.sources.compound.forecast.revision,'r');
});
test('shared forecast rules reject unsupported probability units, ambiguous hours and malformed wind',()=>{
  for(const mutate of [p=>p.push({...p[0]}),p=>p[0].startTime=p[0].startTime.slice(0,-1),p=>p[0].endTime=stamp(2)]){const d=input();mutate(d.forecast.forecast.properties.periods);const r=evaluateCompound(d);assert.ok(r.rules.filter(r=>r.kind==='forecast combination').every(r=>r.status==='unknown'));}
  for(const mutate of [p=>p.probabilityOfPrecipitation.unitCode='fraction',p=>p.windSpeed='-30 mph',p=>p.windSpeed='gust 30 mph']){const d=input();d.forecast.forecast.properties.periods.forEach(mutate);assert.equal(evaluateCompound(d).rules.find(r=>r.id==='precip-wind').status,'unknown');}
});
