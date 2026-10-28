import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import {WeatherService,pack,unpack,pointKey} from '../lib/weather-service.mjs';
import {HazardsService} from '../lib/hazards-service.mjs';
function database(){
  const sqlite=new DatabaseSync(':memory:');
  for(const file of readdirSync(new URL('../drizzle/',import.meta.url)).filter(f=>f.endsWith('.sql')).sort())sqlite.exec(readFileSync(new URL('../drizzle/'+file,import.meta.url),'utf8'));
  return {prepare(sql){const statement=sqlite.prepare(sql);let args=[];return {bind(...values){args=values;return this;},async first(){return statement.get(...args)||null;},async all(){return {results:statement.all(...args)};},async run(){return statement.run(...args);}};},async batch(statements){sqlite.exec('BEGIN');try{const results=[];for(const s of statements)results.push(await s.run());sqlite.exec('COMMIT');return results;}catch(e){sqlite.exec('ROLLBACK');throw e;}},close(){sqlite.close();}};
}
const alert=(id='one',extra={})=>({type:'Feature',id:'https://api.weather.gov/alerts/'+id,geometry:null,properties:{id,status:'Actual',messageType:'Alert',event:'Flood Warning',areaDesc:'Test',...extra}});
const collection=(...features)=>({type:'FeatureCollection',features,updated:'2026-10-28T00:00:00Z'});
const hourly=temp=>({properties:{updateTime:'2026-10-28T00:00:00Z',periods:[{startTime:'2026-10-28T01:00:00Z',endTime:'2026-10-28T02:00:00Z',temperature:temp,temperatureUnit:'F'}]}});
test('hazard snapshots survive service restart and outages retain timestamped last-good data',async()=>{
  const db=database();let now=1000,calls=0,broken=false;
  const fetcher=async url=>{calls++;if(broken)throw new Error('Provider unavailable');return {ok:true,json:async()=>url.includes('/query?')?{type:'FeatureCollection',features:[{type:'Feature',id:1,geometry:{type:'Point',coordinates:[-122,37]},properties:{OBJECTID:1,IncidentName:'Test fire',PercentContained:0}}]}:{}};};
  const service=()=>new HazardsService(new WeatherService(db,{fetcher,clock:()=>now}));
  const first=await service().get('fires');assert.equal(first.features.length,1);assert.equal(first.stale,false);await service().get('fires');assert.equal(calls,2);
  now=2000;broken=true;const stale=await service().get('fires');assert.equal(stale.stale,true);assert.equal(stale.checked_at,first.checked_at);assert.equal(stale.error,'Provider unavailable');await service().get('fires');assert.equal(calls,3);db.close();
});
test('gzip archive preserves unicode and structured values',async()=>{
  const original={text:'Weather → VentusIQ',zero:0,missing:null,features:[alert()]};
  assert.deepEqual(await unpack(await pack(original)),original);
});
test('shared collection deduplicates reads and persists replay through a service restart',async()=>{
  const db=database();let now=1000,calls=0,data=collection(alert());
  const fetcher=async()=>{calls++;return {ok:true,json:async()=>data};};
  let service=new WeatherService(db,{fetcher,clock:()=>now});
  await service.alerts();service=new WeatherService(db,{fetcher,clock:()=>now});await service.alerts();assert.equal(calls,1);
  now=1061;data=collection(alert('two',{references:[{identifier:'one'}],messageType:'Update'}));await service.alerts();
  assert.equal((await service.read('alerts/us',1030)).data.features[0].properties.id,'one');
  const changes=await service.changes();assert.equal(changes[0].kind,'updated');assert.equal(changes.some(c=>c.kind==='left active feed'),false);
  assert.equal((await service.history('alerts/us')).length,2);db.close();
});
test('outage preserves last good collection and persistent backoff prevents request storms',async()=>{
  const db=database();let now=1000,calls=0,broken=false;
  const fetcher=async()=>{calls++;if(broken)throw new Error('Outage');return {ok:true,json:async()=>collection(alert())};};
  const service=new WeatherService(db,{fetcher,clock:()=>now});await service.alerts();now=1100;broken=true;
  assert.equal((await service.alerts()).features.length,1);assert.equal((await service.health()).last_error,'Outage');
  await new WeatherService(db,{fetcher,clock:()=>now}).alerts();assert.equal(calls,2);db.close();
});
test('simultaneous cold requests acquire one database collection lease',async()=>{
  const db=database();let calls=0,release;const pending=new Promise(r=>release=r);
  const fetcher=async()=>{calls++;await pending;return {ok:true,json:async()=>collection()};};
  const first=new WeatherService(db,{fetcher,clock:()=>1000}),second=new WeatherService(db,{fetcher,clock:()=>1000});
  const active=first.alerts();for(let i=0;i<8;i++)await Promise.resolve();
  await assert.rejects(second.alerts(),/warming up/);release();await active;assert.equal(calls,1);db.close();
});
test('forecast history preserves rollback and cannot use a future collection',async()=>{
  const db=database();let now=1000,temp=60;
  const fetcher=async url=>({ok:true,json:async()=>url.includes('/points/')?{properties:{forecastHourly:'https://api.weather.gov/gridpoints/MTR/1,1/forecast/hourly'}}:hourly(temp)});
  const service=new WeatherService(db,{fetcher,clock:()=>now});const first=await service.forecast(37,-122);
  now=1700;temp=70;await service.forecast(37,-122);now=2400;temp=60;const rollback=await service.forecast(37,-122);
  assert.equal(first.revision,rollback.revision);
  assert.equal((await service.read('forecast/37.0000,-122.0000',1800)).data.forecast.properties.periods[0].temperature,70);
  assert.equal((await service.read('forecast/37.0000,-122.0000',2500)).data.forecast.properties.periods[0].temperature,60);
  assert.equal(await service.read('forecast/37.0000,-122.0000',999),null);db.close();
});
test('invalid coordinates and off-origin pagination do not enter the archive',async()=>{
  for(const args of [[null,0],['',0],['nan',0],[0,181]])assert.throws(()=>pointKey(...args));
  const db=database(),service=new WeatherService(db,{clock:()=>1000,fetcher:async()=>({ok:true,json:async()=>({...collection(alert()),pagination:{next:'https://evil.invalid'}})})});
  await assert.rejects(service.alerts(),/Untrusted/);assert.equal(await service.read('alerts/us'),null);db.close();
});
