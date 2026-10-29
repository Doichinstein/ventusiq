import {test} from 'node:test';
import assert from 'node:assert/strict';
import {AirForecastService} from '../lib/air-forecast-service.mjs';
import {WeatherService} from '../lib/weather-service.mjs';
import {airFixture} from './air-forecast-fixture.mjs';
import {database} from './fixtures/push.mjs';
const start=Date.parse('2026-10-29T06:00:00Z')/1000,gate='limits/air-forecast/request';

test('provider cooldown is shared across points and workers without spending another request budget',async()=>{
  const db=database();let now=start,calls=0;
  const fetcher=async()=>{calls++;return new Response(null,{status:429,headers:{'Retry-After':'1800'}});};
  const w=new WeatherService(db,{clock:()=>now,fetcher});
  const other=new AirForecastService(new WeatherService(db,{clock:()=>now,fetcher}));
  try{
    await assert.rejects(new AirForecastService(w).forecast(39,-77),/paused until 2026-10-29T06:30:00.000Z/);
    now+=121;
    await assert.rejects(other.forecast(40,-78),/temporarily limiting/);
    await assert.rejects(other.forecast(39,-77),/temporarily limiting/);
    assert.equal(calls,1);
    assert.equal((await w.state('limits/air-forecast/day/2026-10-29')).next_fetch,1);
    now=start+1800;
    await assert.rejects(other.forecast(41,-79),/temporarily limiting/);
    assert.equal(calls,2);
  }finally{db.close();}
});

test('retry delay accepts HTTP dates, uses a bounded minimum, and falls back for absent or invalid headers',async()=>{
  for(const [header,seconds] of [[new Date((start+7200)*1000).toUTCString(),7200],['0',120],['15',120],['broken',900],['-1',900],['1.5',900],[null,900]]){
    const db=database();const w=new WeatherService(db,{clock:()=>start,fetcher:async()=>new Response(null,{status:429,headers:header===null?{}:{'Retry-After':header}})});
    try{await assert.rejects(new AirForecastService(w).forecast(39,-77),/temporarily limiting/);assert.equal((await w.state(gate)).next_fetch,start+seconds,header);}
    finally{db.close();}
  }
});

test('rate limiting retains last-good revisions and cached hits, then recovers after the cooldown',async()=>{
  const db=database();let now=start,calls=0,limited=false;
  const w=new WeatherService(db,{clock:()=>now,fetcher:async()=>{calls++;return limited?new Response(null,{status:429}):Response.json(airFixture().raw);}}),s=new AirForecastService(w);
  try{
    const first=await s.forecast(39,-77);limited=true;now+=10;
    await assert.rejects(s.forecast(40,-78),/temporarily limiting/);
    assert.equal((await s.forecast(39,-77)).revision,first.revision);assert.equal(calls,2);
    now=start+3601;
    const stale=await s.forecast(39,-77);assert.equal(stale.revision,first.revision);assert.equal(stale.stale,true);assert.match(stale.error,/temporarily limiting/);
    now+=121;assert.equal((await s.forecast(39,-77)).revision,first.revision);assert.equal(calls,3);
    now=start+4501;limited=false;
    const recovered=await s.forecast(39,-77);assert.equal(recovered.stale,false);assert.equal(recovered.error,null);assert.equal(calls,4);
    assert.equal((await w.state(gate)).error,null);
  }finally{db.close();}
});

test('a late shorter cooldown never overwrites a newer longer provider delay',async()=>{
  const db=database();let now=start,release,started;
  const ready=new Promise(resolve=>started=resolve),pending=new Promise(resolve=>release=resolve);
  const w=new WeatherService(db,{clock:()=>now,fetcher:async url=>{if(new URL(url).searchParams.get('latitude')==='39'){started();return pending;}return new Response(null,{status:429,headers:{'Retry-After':'3600'}});}}),s=new AirForecastService(w);
  try{
    const early=s.forecast(39,-77);const caught=assert.rejects(early,/paused until 2026-10-29T07:00:06.000Z/);
    await ready;now+=6;await assert.rejects(s.forecast(40,-78),/temporarily limiting/);
    release(new Response(null,{status:429,headers:{'Retry-After':'30'}}));await caught;
    assert.equal((await w.state(gate)).next_fetch,start+3606);
  }finally{db.close();}
});
