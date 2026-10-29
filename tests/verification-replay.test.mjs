import {test} from 'node:test';
import assert from 'node:assert/strict';
import {verificationWindow} from '../public/verification-window.mjs';
import {WeatherService} from '../lib/weather-service.mjs';
import {ObservationsService} from '../lib/observations-service.mjs';
import {database} from './fixtures/push.mjs';
const day=86400,hour=3600,now=Date.parse('2026-10-29T04:00:00Z')/1000,iso=s=>new Date(s*1000).toISOString();
const nearKey='observations/near/39.0000,-77.0000',obsKey='observations/station/KAAA';
const near={stations:[{id:'KAAA',name:'Archived station',lat:39,lon:-77,distance_km:0,time_zone:'UTC'}]};
const sample=(at,temp=68)=>({type:'FeatureCollection',station:'KAAA',window_start:iso(at-7*day),window_end:iso(at),features:[{type:'Feature',id:'measurement',properties:{station:'https://api.weather.gov/stations/KAAA',timestamp:iso(at-hour),temperature:{value:temp,unitCode:'wmoUnit:degF',qualityControl:'V'}}}]});
const forecast=(at,temp=70)=>({forecast:{properties:{updateTime:iso(at-8*hour),periods:[{startTime:iso(at-hour),endTime:iso(at),temperature:temp,temperatureUnit:'F'}]}}});
function setup(){const db=database();let time=now,calls=0;const weather=new WeatherService(db,{clock:()=>time,fetcher:async()=>{calls++;throw Error('Historical mode must not fetch');}});return {db,weather,service:new ObservationsService(weather),at:t=>time=t,calls:()=>calls};}
async function seed(s,end){s.at(end-8*hour);await s.weather.collect('forecast/39.0000,-77.0000',0,async()=>forecast(end));s.at(end-2);await s.weather.collect(nearKey,0,async()=>near);return s.weather.collect(obsKey,0,async()=>sample(end));}

test('replay bounds require a timezone and allow transit headroom for the 28-day UI choice',()=>{
  assert.equal(verificationWindow(null,now*1000).historical,false);
  assert.equal(verificationWindow(iso(now-28*day),now*1000+5000).historical,true);
  assert.equal(verificationWindow(iso(now-29*day),now*1000).window_start,iso(now-36*day));
  for(const value of ['',NaN,iso(now+1),iso(now-29*day-1),iso(now).slice(0,-1),'yesterday'])assert.throws(()=>verificationWindow(value,now*1000),/Invalid verification archive time/);
  assert.equal(verificationWindow('2026-10-28T21:00:00-07:00',now*1000).as_of,iso(now));
});

test('historical comparison excludes later corrections, preserves raw evidence and survives a service restart',async()=>{
  const s=setup(),end=now-21*day;try{const original=await seed(s,end);s.at(end+hour);await s.weather.collect(obsKey,0,async()=>sample(end,80));await s.weather.collect(nearKey,0,async()=>({stations:[]}));s.at(now);
    const r=await new ObservationsService(s.weather).verification(39,-77,'KAAA',iso(end));assert.equal(r.status,'compared');assert.equal(r.sample_count,1);assert.equal(r.mae_f,2);assert.equal(r.observation_revision,original.revision);assert.equal(r.observation_evidence.features[0].properties.temperature.value,68);assert.equal(r.station.name,'Archived station');assert.equal(r.window.as_of,iso(end));assert.equal(r.generated_at,iso(now));assert.equal(s.calls(),0);assert.ok(r.lead_analysis.groups.flatMap(g=>g.pairs).every(p=>p.forecast_checked_at<iso(end)));
  }finally{s.db.close();}
});

test('a collection in the cutoff second cannot leak into historical evidence',async()=>{
  const s=setup(),end=now-7*day;try{const original=await seed(s,end);s.at(end);await s.weather.collect(obsKey,0,async()=>sample(end,90));s.at(now);const before=await s.service.verification(39,-77,'KAAA',iso(end+.999));assert.equal(before.observation_revision,original.revision);assert.equal(before.mae_f,2);const after=await s.service.verification(39,-77,'KAAA',iso(end+1));assert.equal(after.mae_f,20);assert.notEqual(after.observation_revision,original.revision);assert.equal(s.calls(),0);}finally{s.db.close();}
});

test('missing historical discovery or observations return explicit absence without collecting replacements',async()=>{
  const s=setup(),end=now-day;try{const empty=await s.service.verification(39,-77,'KAAA',iso(end));assert.equal(empty.status,'not_collected_by_cutoff');assert.deepEqual(empty.missing,['station discovery']);s.at(end-2);await s.weather.collect(nearKey,0,async()=>near);s.at(now);const missing=await s.service.verification(39,-77,'KAAA',iso(end));assert.deepEqual(missing.missing,['station observations']);assert.equal(s.calls(),0);await assert.rejects(s.service.verification(39,-77,'KBBB',iso(end)),/Invalid station/);}finally{s.db.close();}
});

test('historical age is evaluated at the selected cutoff and newer forecast checks do not exhaust its read limit',async()=>{
  const s=setup(),end=now-14*day;try{await seed(s,end);const row=await s.weather.state('forecast/39.0000,-77.0000');for(let i=0;i<2001;i++)await s.weather.statement('INSERT INTO checks(dataset,at,revision) VALUES (?,?,?)',row.name,end+day+i,row.revision).run();s.at(now);const fresh=await s.service.verification(39,-77,'KAAA',iso(end));assert.equal(fresh.stale,false);assert.equal(fresh.sample_count,1);const old=await s.service.verification(39,-77,'KAAA',iso(end+2*hour));assert.equal(old.stale,true);assert.equal(old.sample_count,1);assert.equal(s.calls(),0);}finally{s.db.close();}
});

test('observation checks survive 30 days then prune while other hazard lanes keep seven days',async()=>{
  const s=setup();try{for(const key of [obsKey,nearKey,'observations/event-stations/VA','hazards/test','routes/test']){s.at(now-31*day);const expired=await s.weather.collect(key,0,async()=>({version:1}));s.at(now-30*day);const boundary=await s.weather.collect(key,0,async()=>({version:2}));s.at(now-8*day);const older=await s.weather.collect(key,0,async()=>({version:3}));s.at(now);const current=await s.weather.collect(key,0,async()=>({version:4}));const checks=(await s.weather.statement('SELECT revision FROM checks WHERE dataset=? ORDER BY at',key).all()).results.map(r=>r.revision);assert.deepEqual(checks,key.startsWith('observations/')?[boundary.revision,older.revision,current.revision]:[current.revision]);assert.equal(await s.weather.statement('SELECT revision FROM revisions WHERE dataset=? AND revision=?',key,expired.revision).first(),null);}
    s.at(now+40*day);const last=await s.weather.collect(obsKey,0,async()=>{throw Error('Provider outage');});assert.equal(last.data.version,4);assert.equal(last.stale,true);
  }finally{s.db.close();}
});
