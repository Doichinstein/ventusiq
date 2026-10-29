import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import {WeatherService} from '../lib/weather-service.mjs';
import {UpkeepService} from '../lib/upkeep-service.mjs';

function setup(t) {
  const sqlite = new DatabaseSync(':memory:');
  for (const file of readdirSync(new URL('../drizzle/',import.meta.url)).filter(f=>f.endsWith('.sql')).sort()) sqlite.exec(readFileSync(new URL('../drizzle/'+file,import.meta.url),'utf8'));
  t.after(()=>sqlite.close());
  const db = {prepare(sql){const statement=sqlite.prepare(sql);let args=[];return {bind(...values){args=values;return this;},async first(){return statement.get(...args)||null;},async run(){return statement.run(...args);}};}};
  let now=1000;
  const weather=new WeatherService(db,{clock:()=>now,fetcher:()=>{throw Error('No network allowed');}});
  const calls=[];
  const tasks={watches:async alerts=>{calls.push(['watches',alerts]);},push:async()=>{calls.push(['push']);},webhooks:async()=>{calls.push(['webhooks']);}};
  return {weather,tasks,calls,advance(seconds){now+=seconds;},service(overrides={}){return new UpkeepService(weather,{...tasks,...overrides});}};
}
test('status reads are passive, empty service remains never, and completion has no private details',async t=>{
  const s=setup(t),service=s.service();
  assert.equal((await service.status()).state,'never');assert.equal(s.calls.length,0);
  await service.run({secret:'location'});
  assert.deepEqual((await service.status()),{state:'finished',started_at:1000,completed_at:1000,last_outcome:'finished',phases:{watches:'finished',push:'finished',webhooks:'finished'},age_seconds:0});
  assert.deepEqual(s.calls.map(x=>x[0]),['watches','push','webhooks']);
  assert.doesNotMatch(JSON.stringify(await service.status()),/location|lease|token/);
});
test('concurrent requests share one claim and cooldown survives a service restart',async t=>{
  const s=setup(t);let release,entered;
  const started=new Promise(r=>entered=r),pending=new Promise(r=>release=r);
  const run=s.service({watches:async()=>{entered();await pending;}}).run(null);await started;
  assert.equal((await s.service().status()).state,'running');
  assert.deepEqual(await s.service().run(null),{claimed:false});release();await run;
  assert.deepEqual(await s.service().run(null),{claimed:false});s.advance(60);
  assert.equal((await s.service().run(null)).claimed,true);
});
test('watch failure does not starve delivery queues and private errors are omitted',async t=>{
  const s=setup(t);
  await s.service({watches:async()=>{throw Error('private address / credential');}}).run(null);
  const status=await s.service().status();assert.equal(status.state,'partial');assert.equal(status.phases.watches,'failed');
  assert.deepEqual(s.calls.map(x=>x[0]),['push','webhooks']);assert.doesNotMatch(JSON.stringify(status),/private|credential|address/);
});
test('one delivery dispatcher failing does not hide the other result',async t=>{
  const s=setup(t);await s.service({push:async()=>{throw Error('failure');}}).run(null);
  assert.deepEqual((await s.service().status()).phases,{watches:'finished',push:'failed',webhooks:'finished'});
});
test('expired lease reports interruption; superseded worker cannot overwrite new completion',async t=>{
  const s=setup(t);let release,entered;const started=new Promise(r=>entered=r),pending=new Promise(r=>release=r);
  const old=s.service({watches:async()=>{entered();await pending;}}).run(null);await started;
  s.advance(91);assert.equal((await s.service().status()).state,'interrupted');
  await s.service({push:async()=>{throw Error('latest failure');}}).run(null);
  release();assert.equal((await old).recorded,false);
  const status=await s.service().status();assert.equal(status.state,'partial');assert.equal(status.completed_at,1091);
});
test('overdue status preserves last outcome and new running pass preserves prior completion',async t=>{
  const s=setup(t);await s.service().run(null);s.advance(4501);
  const status=await s.service().status();assert.equal(status.state,'overdue');assert.equal(status.last_outcome,'finished');
  let release,entered;const started=new Promise(r=>entered=r),pending=new Promise(r=>release=r);
  const run=s.service({watches:async()=>{entered();await pending;}}).run(null);await started;
  assert.equal((await s.service().status()).completed_at,1000);release();await run;
  assert.equal((await s.service().status()).state,'finished');
});
