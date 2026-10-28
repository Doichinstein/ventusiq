import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import {quantity,nearbyStations,observations,forecastChoices,compareTemperatures,verificationHours,HOUR} from '../public/observations-core.mjs';
import {WeatherService} from '../lib/weather-service.mjs';
import {ObservationsService} from '../lib/observations-service.mjs';
const now=Date.parse('2026-11-02T12:00:00Z'),stamp=h=>new Date(now+h*HOUR).toISOString();
const station=(id='KAAA',lat=38.9,lon=-77)=>({type:'Feature',geometry:{type:'Point',coordinates:[lon,lat]},properties:{stationIdentifier:id,name:id,timeZone:'America/New_York'}});
const feature=(h=0,value=20,qc='V',id='KAAA')=>({type:'Feature',id:'https://api.weather.gov/stations/'+id+'/observations/'+stamp(h),properties:{station:'https://api.weather.gov/stations/'+id,timestamp:stamp(h),temperature:{value,unitCode:'wmoUnit:degC',qualityControl:qc},windSpeed:{value:0,unitCode:'wmoUnit:km_h-1',qualityControl:'V'},windGust:{value:null,unitCode:'wmoUnit:km_h-1',qualityControl:'Z'}}});
const collection=(...features)=>({type:'FeatureCollection',features});
const forecast=(temp=70,issue=-8)=>({forecast:{properties:{updateTime:stamp(issue),periods:[{startTime:stamp(0),endTime:stamp(1),temperature:temp,temperatureUnit:'F'}]}}});
function db(){const sqlite=new DatabaseSync(':memory:');for(const name of readdirSync(new URL('../drizzle/',import.meta.url)).filter(f=>f.endsWith('.sql')).sort())sqlite.exec(readFileSync(new URL('../drizzle/'+name,import.meta.url),'utf8'));return {prepare(sql){let args=[];const s=sqlite.prepare(sql);return {bind(...a){args=a;return this;},async first(){return s.get(...args)||null;},async all(){return {results:s.all(...args)};},async run(){return s.run(...args);}};},async batch(list){sqlite.exec('BEGIN');try{const out=[];for(const s of list)out.push(await s.run());sqlite.exec('COMMIT');return out;}catch(e){sqlite.exec('ROLLBACK');throw e;}},close(){sqlite.close();}};}
test('units, failed QC, null gusts, future readings and duplicate timestamps retain honest semantics',()=>{
  assert.equal(quantity({value:null,unitCode:'wmoUnit:degC'},'temperature'),null);assert.equal(quantity({value:0,unitCode:'wmoUnit:degC'},'temperature'),32);assert.equal(quantity({value:1,unitCode:'alien'},'wind'),null);
  const rows=observations(collection(feature(-1,0),feature(-1,30),feature(0,20,'Q'),feature(1)),now);assert.equal(rows.length,2);assert.equal(rows[0].temperature,32);assert.equal(rows[0].wind,0);assert.equal(rows[0].gust,null);assert.equal(rows[1].temperature,null);
});
test('station candidates sort by actual place distance, exclude invalid geometry and cross the date line',()=>{
  const rows=nearbyStations(collection(station('KFAR',0,170),station('KBBB',0,-179.9),station('KAAA',0,179.95),{properties:{stationIdentifier:'BAD'}}),0,179.9);assert.deepEqual(rows.map(r=>r.id),['KAAA','KBBB']);assert.ok(rows[1].distance_km<25);
});
test('as-of choices honor rollbacks and never choose a future check with an earlier source issue',()=>{
  const checks=[{at:now/1000-7*3600,revision:'first'},{at:now/1000-6*3600,revision:'rollback'},{at:now/1000-5*3600,revision:'future'}];assert.equal(forecastChoices(checks,[now])[0].check.revision,'rollback');assert.equal(forecastChoices([{at:now/1000-25*3600,revision:'old'}],[now]).length,0);
});
test('temperature comparison matches timestamps, carries provenance, and uses correct error arithmetic',()=>{
  const choice={at:now,check:{at:now/1000-7*3600,revision:'early'}},result=compareTemperatures([now],[choice],new Map([['early',forecast()]]),observations(collection(feature(-1/12)),now));
  assert.equal(result.sample_count,1);assert.ok(Math.abs(result.mae_f-2)<1e-9);assert.equal(result.bias_f,2);assert.equal(result.rmse_f,2);assert.equal(result.pairs[0].lead_hours,8);assert.equal(result.pairs[0].forecast_revision,'early');assert.equal(result.pairs[0].observation_at,stamp(-1/12));
});
test('poor QC is excluded without cherry-picking a farther good reading; unknown or future issue times cannot be graded',()=>{
  const choice={at:now,check:{at:now/1000-7*3600,revision:'early'}},rows=observations(collection(feature(0,20,'Z'),feature(-1/6,20,'V')),now);
  const result=compareTemperatures([now],[choice],new Map([['early',forecast()]]),rows);assert.equal(result.sample_count,0);assert.equal(result.skipped.quality_excluded,1);
  for(const issue of [-5,-30])assert.equal(compareTemperatures([now],[choice],new Map([['early',forecast(70,issue)]]),observations(collection(feature()),now)).skipped.forecast_unavailable,1);
  const unknown=forecast();unknown.forecast.properties.updateTime=null;assert.equal(compareTemperatures([now],[choice],new Map([['early',unknown]]),observations(collection(feature()),now)).sample_count,0);
});
test('UTC windows span DST without duplicated hours, include missing-archive coverage and do not reuse a boundary observation',()=>{
  const hours=verificationHours(now);assert.equal(hours.length,168);assert.equal(new Set(hours).size,168);assert.equal(compareTemperatures(hours,[],new Map(),[]).skipped.no_archive,168);
  const raw=forecast();raw.forecast.properties.periods.push({...raw.forecast.properties.periods[0],startTime:stamp(1),endTime:stamp(2)});const choices=[now,now+HOUR].map(at=>({at,check:{at:now/1000-7*3600,revision:'early'}}));const result=compareTemperatures([now,now+HOUR],choices,new Map([['early',raw]]),observations(collection(feature(0.5)),now+HOUR));assert.equal(result.sample_count,1);
});
test('hosted observations paginate with fixed bounds, persist across restart and retain last good data during outage',async()=>{
  const database=db();let time=now/1000,broken=false;const urls=[];const fetcher=async url=>{urls.push(url);if(broken)throw Error('Observation outage');const u=new URL(url);assert.equal(u.searchParams.get('limit'),'500');assert.ok(u.searchParams.has('start'));assert.ok(u.searchParams.has('end'));return {ok:true,json:async()=>u.searchParams.has('cursor')?collection(feature(-2)):{...collection(feature(-1)),pagination:{next:'https://api.weather.gov/stations/KAAA/observations?cursor=next'}}};};
  const service=()=>new ObservationsService(new WeatherService(database,{fetcher,clock:()=>time}));const first=await service().station('kaaa');assert.equal(first.features.length,2);assert.equal(first.truncated,false);await service().station('KAAA');assert.equal(urls.length,2);time+=1801;broken=true;const stale=await service().station('KAAA');assert.equal(stale.stale,true);assert.equal(stale.checked_at,first.checked_at);assert.equal(stale.features.length,2);await service().station('KAAA');assert.equal(urls.length,3);database.close();
});
test('malformed and foreign-station records do not become successful collections',async()=>{
  const database=db(),service=new ObservationsService(new WeatherService(database,{clock:()=>now/1000,fetcher:async()=>({ok:true,json:async()=>collection(feature(0,20,'V','KBBB'))})}));await assert.rejects(service.station('KAAA'),/Invalid observation record/);await assert.rejects(service.station('../secret'),/Invalid station/);database.close();
});
test('bounded pagination reports partial coverage explicitly',async()=>{
  const database=db();let page=0;const service=new ObservationsService(new WeatherService(database,{clock:()=>now/1000,fetcher:async()=>({ok:true,json:async()=>({...collection(feature(-++page)),pagination:{next:'https://api.weather.gov/stations/KAAA/observations?cursor='+page}})})}));const result=await service.station('KAAA');assert.equal(page,6);assert.equal(result.truncated,true);database.close();
});
test('end-to-end archive verification uses an actual earlier check and later measurement, without enrolling background collection',async()=>{
  const database=db();let time=now/1000-8*3600;
  const fetcher=async url=>({ok:true,json:async()=>url.includes('/points/')?{properties:{observationStations:'https://api.weather.gov/gridpoints/LWX/1,1/stations'}}:url.includes('/gridpoints/')?collection(station()):collection(feature())});
  const weather=new WeatherService(database,{clock:()=>time,fetcher});await weather.collect('forecast/38.9000,-77.0000',600,async()=>forecast());time=now/1000+3600;
  const report=await new ObservationsService(weather).verification(38.9,-77,'KAAA');assert.equal(report.sample_count,1);assert.equal(report.mae_f,2);assert.equal(report.station.distance_km,0);assert.match(report.method,/no calibrated/);assert.equal((await weather.state('observations/station/KAAA')).next_fetch,time+1800);database.close();
});
