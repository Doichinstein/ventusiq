import {test} from 'node:test';import assert from 'node:assert/strict';
import {stationTemperatures,stationTemperatureMatches,stationTemperatureEvaluation,stationTemperatureReport} from '../public/station-analogs-core.mjs';
import {StationAnalogsService} from '../lib/station-analogs-service.mjs';
import {WeatherService} from '../lib/weather-service.mjs';
import {database} from './fixtures/push.mjs';
import {dayTime,DAY} from '../public/analogs-core.mjs';
import {stationNow,temperatureStation as station,temperatureWindow as window,temperatureRow as row,temperatureHistory} from './station-analogs-fixture.mjs';
test('daily means preserve missing days and enforce counts and geographic consistency',()=>{
  const data=stationTemperatures([row(),row('2024-06-06',{TEMP:'9999.9'}),row('2024-06-07',{TEMP_ATTRIBUTES:'17'}),row('2024-06-08',{LATITUDE:'40'})],station,window);
  assert.equal(data.rows.find(r=>r.date==='2024-06-05').mean_c,20);assert.equal(data.usable_days,1);assert.equal(data.audit.temperature,1);assert.equal(data.audit.observations,1);assert.equal(data.audit.location,1);assert.equal(data.expected_days,3653);assert.equal(data.years.find(y=>y.year==='2024').expected,366);
});
test('foreign dates, malformed numbers and conflicts cannot become observations',()=>{
  const data=stationTemperatures([row(),row(),row('2024-06-06'),row('2024-06-06',{TEMP:'69'}),row('2024-02-30'),row('2024-06-07',{STATION:'00000000000'}),row('2024-06-08',{TEMP_ATTRIBUTES:''}),row('2024-06-09',{LONGITUDE:''})],station,window);
  assert.equal(data.audit.duplicates,1);assert.equal(data.audit.conflicting,2);assert.equal(data.audit.foreign,2);assert.equal(data.usable_days,1);
  assert.throws(()=>stationTemperatures([null],station,window));assert.throws(()=>stationTemperatures(Array(4201).fill(row()),station,window));
});
test('selection uses only past input values, fixed spacing, and no future outcome availability',()=>{
  const data=temperatureHistory(),target=data.rows.find(r=>r.date==='2024-06-05'),r=stationTemperatureMatches(data.rows,target,'2024-01-01');assert.equal(r.matches.length,20);
  for(const m of r.matches){assert.ok(dayTime(m.date)+2*DAY<=dayTime('2024-01-01'));assert.ok(Math.abs(m.difference_c)<=3);}
  for(let i=0;i<r.matches.length;i++)for(let j=i+1;j<r.matches.length;j++)assert.ok(Math.abs(dayTime(r.matches[i].date)-dayTime(r.matches[j].date))>=7*DAY);
  const future=data.rows.map(row=>row.date>='2024-01-01'?{...row,mean_c:90}:row);assert.deepEqual(stationTemperatureMatches(future,target,'2024-01-01').matches,r.matches);
  assert.throws(()=>stationTemperatureMatches([...data.rows,data.rows[0]],target,'2024-01-01'),/Duplicate/);
});
test('missing following-day values do not affect ranking or silently become zero',()=>{
  const rows=[];for(let year=2000;year<2020;year++){rows.push({date:year+'-06-01',mean_c:20},{date:year+'-06-02',mean_c:30});}
  const target={date:'2024-06-01',mean_c:20},before=stationTemperatureMatches(rows,target,'2024-01-01');
  const after=stationTemperatureMatches(rows.map(r=>r.date.endsWith('06-02')?{...r,mean_c:null}:r),target,'2024-01-01');
  assert.deepEqual(after.matches.map(m=>m.date),before.matches.map(m=>m.date));assert.equal(after.outcome.n,0);assert.equal(after.outcome.median,null);assert.equal(after.sufficient,false);
});
test('48 fixed held-out dates and all baselines share outcomes; later corrections do not change retrieval',()=>{
  const data=temperatureHistory(),first=stationTemperatureEvaluation(data);assert.equal(first.attempted,48);assert.equal(first.evaluated,48);
  const modified=structuredClone(data);modified.rows.find(r=>r.date==='2024-01-08').mean_c=40;const second=stationTemperatureEvaluation(modified);
  const a=first.cases.find(c=>c.date==='2024-01-07'),b=second.cases.find(c=>c.date==='2024-01-07');assert.deepEqual(a.match_dates,b.match_dates);assert.deepEqual(a.prediction,b.prediction);assert.deepEqual(a.baseline,b.baseline);assert.equal(b.actual.mean_c,40);
  const metric=second.diagnostics.cohorts[0].metrics.mean_c;assert.equal(metric.n,metric.pairs.length);assert.equal(metric.interval.n,metric.n);assert.ok(metric.pairs.every(p=>Number.isFinite(p.analog)&&Number.isFinite(p.seasonal)&&Number.isFinite(p.persistence)));
});
test('missing and sparse test cases are explicit and historical references never match themselves',()=>{
  const data=temperatureHistory();data.rows.find(r=>r.date==='2024-01-08').mean_c=null;const v=stationTemperatureEvaluation(data);assert.equal(v.missing,1);assert.equal(v.evaluated,47);
  const sparse={...data,rows:data.rows.map(r=>r.date<'2024-01-01'?{...r,mean_c:null}:r)};assert.equal(stationTemperatureEvaluation(sparse).insufficient,47);
  const report=stationTemperatureReport(data,'2024-06-05',stationNow);assert.ok(report.selected.matches.every(m=>m.date<'2024-06-05'));assert.match(report.scope,/not known at historical decision times/);assert.equal(stationTemperatureReport(data,'1900-01-01').selected,null);
});
const catalog='"USAF","WBAN","STATION NAME","CTRY","STATE","ICAO","LAT","LON","ELEV(M)","BEGIN","END"\n"724050","13743","REAGAN","US","VA","KDCA","38.848","-77.034","4.6","19450101","20250824"\n';
function setup(t){const db=database();t.after(()=>db.close());let now=stationNow/1000,broken=false;const calls=[],weather=new WeatherService(db,{clock:()=>now,fetcher:async(url,options)=>{calls.push({url,options});if(broken)throw Error('NOAA unavailable');return url.endsWith('.csv')?new Response(catalog):Response.json([row()]);}});return {db,weather,calls,service:new StationAnalogsService(weather),advance:s=>now+=s,fail:()=>broken=true};}
test('bounded fixed station window requests retain raw data, cache and source identity',async t=>{
  const s=setup(t),a=await s.service.history(station.id),b=await s.service.history(station.id);assert.equal(a.revision,b.revision);assert.equal(s.calls.length,2);assert.deepEqual(a.raw,[row()]);
  const url=new URL(s.calls[1].url);assert.equal(url.searchParams.get('dataTypes'),'TEMP');assert.equal(url.searchParams.get('includeStationLocation'),'true');assert.equal(url.searchParams.get('startDate'),'2016-01-01');assert.equal(url.searchParams.has('lat'),false);assert.equal(s.calls[1].options.redirect,'manual');assert.equal((await s.weather.statement('SELECT COUNT(*) AS n FROM watches').first()).n,0);
  s.advance(14*86400+1);s.fail();const fallback=await s.service.history(station.id);assert.equal(fallback.stale,true);assert.equal(fallback.checked_at,a.checked_at);assert.equal(fallback.revision,a.revision);
});
test('station allowlist and admission/budget limits cannot become arbitrary upstream queries',async t=>{
  const s=setup(t);await assert.rejects(s.service.history('../evil'),/listed/);assert.equal(s.calls.length,0);await assert.rejects(s.service.history('00000000000'),/listed/);assert.equal(s.calls.length,1);
  await s.weather.statement('INSERT INTO datasets(name,next_fetch,lease_until) VALUES (?,50,0)','limits/station-temperature/day/2026-10-29').run();await assert.rejects(s.service.history(station.id),/budget/);assert.equal(s.calls.length,1);
  for(let i=0;i<128;i++)await s.weather.statement('INSERT INTO datasets(name,next_fetch,lease_until) VALUES (?,0,0)','hazards/station-temperature/fill'+i).run();
  await s.weather.statement('DELETE FROM datasets WHERE name=?',`hazards/station-temperature/${station.id}/2016-01-01/2025-12-31`).run();await assert.rejects(s.service.history(station.id),/full/);
});
