import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mapAlerts} from '../lib/map-alerts.mjs';
import {database} from './fixtures/push.mjs';
import {WeatherService} from '../lib/weather-service.mjs';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

test('map responds with original cache times before deferred collection starts, then runs upkeep on fresh data',async()=>{
  const jobs=[],now=Date.parse('2026-10-29T16:00:00Z'),seen=[];
  const cached={data:{type:'FeatureCollection',features:[]},revision:'old',checked_at:new Date(now-120000).toISOString()};
  let collected=0;const fresh={revision:'fresh'};
  const result=await mapAlerts({read:async()=>cached,state:async()=>({next_fetch:now/1000-60}),clock:()=>now/1000,alerts:async()=>{collected++;return fresh;}},fn=>jobs.push(fn),async value=>seen.push(value));
  assert.equal(collected,0);assert.equal(result.revision,'old');assert.equal(result.collected_at,cached.checked_at);assert.equal(result.stale,true);
  assert.equal(result.refresh_after_ms,5000);
  await jobs[0]();assert.equal(collected,1);assert.deepEqual(seen,[fresh]);
});

test('follow-up reads observe completed collection without duplicate upstream requests, and failures retain cooldown',async()=>{
  const db=database();let now=1793304000,calls=0,fail=false,release;
  const weather=new WeatherService(db,{clock:()=>now,fetcher:async()=>{
    calls++;if(release)await release.promise;if(fail)throw Error('NWS unavailable');
    return Response.json({type:'FeatureCollection',features:[],updated:new Date(now*1000).toISOString()});
  }});
  const jobs=[],read=()=>mapAlerts(weather,fn=>jobs.push(fn),async()=>{});
  try{
    await weather.alerts();const original=await read();assert.equal(original.refresh_after_ms,30000);await jobs.shift()();assert.equal(calls,1);
    now+=60;let finish;release={promise:new Promise(resolve=>finish=resolve)};
    const due=await read();assert.equal(due.refresh_after_ms,5000);assert.equal(due.collected_at,original.collected_at);
    const collecting=jobs.shift()();
    // Wait for the real collector lease, rather than a wall-clock sleep.
    for(let i=0;i<100&&!(await weather.state('alerts/us')).lease_token;i++)await Promise.resolve();
    now+=5;const pending=await read();assert.equal(pending.refresh_after_ms,5000);assert.equal(pending.collected_at,original.collected_at);
    await jobs.shift()();finish();await collecting;release=null;
    const fresh=await read();assert.equal(fresh.collected_at,new Date(now*1000).toISOString());assert.equal(fresh.refresh_after_ms,30000);assert.equal(fresh.stale,false);await jobs.shift()();assert.equal(calls,2);
    now+=50;assert.equal((await read()).refresh_after_ms,10000);await jobs.shift()();assert.equal(calls,2);
    now+=10;fail=true;await read();await jobs.shift()();
    const failed=await read();assert.equal(failed.refresh_after_ms,30000);assert.equal(failed.stale,true);assert.match(failed.error,/NWS unavailable/);assert.equal(failed.collected_at,fresh.collected_at);await jobs.shift()();assert.equal(calls,3);
  }finally{db.close();}
});

test('a newer stored check requests a short follow-up without relabelling the cached body',async()=>{
  const now=1793304000,cached={data:{type:'FeatureCollection',features:[]},revision:'old',checked_at:new Date((now-120)*1000).toISOString()};
  const result=await mapAlerts({read:async()=>cached,state:async()=>({last_success:now,next_fetch:now+60}),clock:()=>now},()=>{},()=>{});
  assert.equal(result.refresh_after_ms,5000);assert.equal(result.stale,true);assert.equal(result.collected_at,cached.checked_at);
});

const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
const refreshCode=app.slice(app.indexOf('async function refresh()'),app.indexOf('async function refreshAuxiliary()'));
function client(data,mode='hosted',extra={}){
  const state={config:{mode},direct:false,refreshInterval:mode==='hosted'?30000:60000,refreshing:false,replayAt:null,replayLoading:false,nextFetch:0,snapshotGeneration:0,liveData:null,geometryRevision:0,lastSuccess:null,lastError:null,
    Date:class extends Date{static now(){return 1000000;}},request:async()=>data,window:{},$:()=>({}),validFeature:()=>true,render(){},queueGeometry(){},updateTimeline(){},refreshAuxiliary(){},updateHealth(){},emptyFeed(){},...extra};
  vm.createContext(state);vm.runInContext(refreshCode,state);return state;
}
test('browser uses bounded hosted follow-ups, preserves source freshness and keeps manual/hidden/replay guards',async()=>{
  for(const [delay,expected] of [[5000,5000],[10000,10000],[1,5000],[Infinity,30000],['5000',30000],[undefined,30000],[90000,30000]]){
    const data={type:'FeatureCollection',features:[],collected_at:'2026-10-29T12:00:00Z',stale:true,refresh_after_ms:delay},c=client(data);
    await c.refresh();assert.equal(c.nextFetch,1000000+expected);assert.equal(c.lastSuccess,data.collected_at);assert.equal(c.lastError,'Source collection delayed');
  }
  const daemon=client({type:'FeatureCollection',features:[],refresh_after_ms:5000},'daemon');await daemon.refresh();assert.equal(daemon.nextFetch,1060000);
  const replay=client(null,'hosted',{replayAt:'historical',request:()=>{throw Error('must not fetch');}});await replay.refresh();assert.equal(replay.nextFetch,0);
  const failure=client(null,'hosted',{request:async()=>{throw Error('network unavailable');}});await failure.refresh();assert.equal(failure.nextFetch,1030000);assert.equal(failure.lastError,'network unavailable');
  assert.match(app,/if \(autoRefresh && !document.hidden\) refresh\(\)/);
});
test('first collection is awaited with no archive, and failures do not fabricate an empty collection',async()=>{
  const jobs=[],weather={read:async()=>null,alerts:async()=>({revision:'first'})};
  const result=await mapAlerts(weather,fn=>jobs.push(fn),async()=>{});assert.equal(result.revision,'first');assert.equal(jobs.length,1);
  weather.alerts=async()=>{throw Error('Source down');};await assert.rejects(mapAlerts(weather,()=>{},()=>{}),/Source down/);
});
