import {test} from 'node:test';
import assert from 'node:assert/strict';
import {waterValue,waterTime,riverRegion,loadRiverRegion,loadGauge,gaugeId,riverSummary} from '../public/rivers-core.mjs';
const now=Date.parse('2026-10-28T20:00:00Z'),at=h=>new Date(now+h*3600000).toISOString();
export function product(){return {metadata:{lid:'TEST1',name:'Test River',latitude:37,longitude:-91,flood:{stageUnits:'ft',flowUnits:'cfs',categories:{action:{stage:5,flow:1000},minor:{stage:10,flow:2000},moderate:{stage:15,flow:-9999},major:{stage:20,flow:-9999}},impacts:[{stage:10,statement:'Low road flooding.'},{stage:20,statement:'Major impacts.'}]},status:{forecast:{floodCategory:'minor'}},datums:{vertical:{value:[]}}},series:{observed:{primaryName:'Stage',primaryUnits:'ft',data:[{validTime:at(-1),primary:4}]},forecast:{primaryName:'Stage',primaryUnits:'ft',issuedTime:at(-2),data:[{validTime:at(1),primary:6},{validTime:at(3),primary:12},{validTime:at(5),primary:9}]}}};}
test('missing sentinels never become water levels, and legitimate zero or negative stage survives',()=>{
  for(const n of [-999,-9999,-99999,null,undefined,'1',Infinity])assert.equal(waterValue(n),null);
  assert.equal(waterValue(0),0);assert.equal(waterValue(-2),-2);assert.equal(waterTime('0001-01-01T00:00:00Z'),null);
});
test('regional requests quantize cache keys, preserve date-line coverage and reject bad coordinates',()=>{
  assert.equal(riverRegion(37.1,-91.1).key,riverRegion(37.2,-91.2).key);
  const r=riverRegion(60,179.9);assert.equal(r.boxes.length,2);assert.ok(r.boxes.every(b=>b[0]>=-180&&b[2]<=180));
  for(const p of [[null,1],['',1],[91,0],[0,NaN]])assert.throws(()=>riverRegion(...p),/Invalid/);
});
test('forecast highs and threshold windows retain sample timing without asserting a crest',()=>{
  const s=riverSummary(product(),now);assert.equal(s.peak.value,12);assert.equal(s.peak.at,at(3));assert.equal(s.peak.atEnd,false);
  assert.equal(s.crossings.find(c=>c.name==='minor').after,at(1));assert.equal(s.crossings.find(c=>c.name==='minor').at,at(3));assert.equal(s.crossings.find(c=>c.name==='major').at,null);
  assert.equal(s.crossings.find(c=>c.name==='action').after,null);assert.equal(s.impacts.length,2);
});
test('stale issue, missing forecast, source status, and delayed collections suppress timing',()=>{
  const p=product();p.series.forecast.issuedTime=at(-25);assert.equal(riverSummary(p,now).usableForecast,false);
  p.series.forecast.issuedTime=at(-2);p.stale=true;assert.equal(riverSummary(p,now).peak,null);p.stale=false;p.metadata.status.forecast.floodCategory='fcst_not_current';assert.equal(riverSummary(p,now).peak,null);
  p.metadata.status.forecast.floodCategory='minor';p.series.forecast.data=[];assert.equal(riverSummary(p,now).peak,null);
});
test('a forecast-only gauge remains useful without relabeling incompatible observed values',()=>{
  const p=product();p.series.observed={data:[]};const s=riverSummary(p,now);assert.equal(s.latest,null);assert.equal(s.peak.value,12);assert.equal(s.observed.unit,'ft');
  p.series.observed={primaryName:'Unknown',primaryUnits:'other',data:[{validTime:at(-1),primary:12}]};assert.equal(riverSummary(p,now).usableForecast,false);
});
test('flow and stage convert consistently; incompatible units never produce crossings',()=>{
  const p=product();p.series.observed.primaryUnits='m';p.series.observed.data[0].primary=1;p.series.forecast.primaryUnits='m';p.series.forecast.data[0].primary=4;
  assert.ok(Math.abs(riverSummary(p,now).latest.value-3.28084)<.0001);
  for(const kind of ['observed','forecast']){p.series[kind].primaryName='Flow';p.series[kind].primaryUnits='kcfs';}p.series.observed.data[0].primary=1;p.series.forecast.data=[{validTime:at(2),primary:3}];
  const s=riverSummary(p,now);assert.equal(s.latest.value,1000);assert.equal(s.peak.value,3000);assert.equal(s.thresholds.find(t=>t.name==='minor').value,2000);assert.equal(s.impacts.length,0);
  p.series.forecast.primaryUnits='unknown';assert.equal(riverSummary(p,now).usableForecast,false);
});
test('forecast gaps do not imply a precise crossing and repeated terminal highs are qualified',()=>{
  const p=product();p.series.forecast.data=[{validTime:at(1),primary:6},{validTime:at(2),primary:-999},{validTime:at(4),primary:12},{validTime:at(6),primary:12}];const s=riverSummary(p,now);
  assert.equal(s.crossings.find(c=>c.name==='minor').after,null);assert.equal(s.peak.repeated,true);assert.equal(s.peak.atEnd,true);
  p.series.forecast.data=[{validTime:at(1),primary:6},{validTime:at(20),primary:12}];assert.equal(riverSummary(p,now).crossings.find(c=>c.name==='minor').after,null);
});
test('inconsistent thresholds and future observations are not interpreted as current conditions',()=>{
  const p=product();p.metadata.flood.categories.minor.stage=3;p.series.observed.data=[{validTime:at(2),primary:100},{validTime:at(-7),primary:4}];const s=riverSummary(p,now);assert.equal(s.thresholds.length,0);assert.equal(s.thresholdsInvalid,true);assert.equal(s.latest.value,4);assert.equal(s.observationStale,true);
});
test('regional adapters deduplicate identifiers and preserve source status times',async()=>{
  const g={lid:'TEST1',name:'Test',latitude:60,longitude:179,status:{observed:{primary:-999,validTime:'0001-01-01T00:00:00Z'}}};let count=0;
  const r=await loadRiverRegion(riverRegion(60,180),async()=>{count++;return {ok:true,json:async()=>({gauges:[g]})};});assert.equal(count,2);assert.equal(r.features.length,1);assert.equal(r.features[0].properties.observed.value,null);assert.equal(r.features[0].properties.observed.at,null);
});
test('gauge URLs reject injection and malformed products do not enter the archive',async()=>{
  assert.throws(()=>gaugeId('../secrets'),/Invalid/);await assert.rejects(loadGauge('TEST1',async()=>({ok:true,json:async()=>({lid:'WRONG'})})),/Incomplete/);
  const p=product();const result=await loadGauge('test1',async url=>({ok:true,json:async()=>url.endsWith('stageflow')?p.series:p.metadata}));assert.equal(result.official_url,'https://water.noaa.gov/gauges/test1');
});
