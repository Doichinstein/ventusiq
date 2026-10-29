import {test} from 'node:test';
import assert from 'node:assert/strict';
import {forecastStability} from '../public/forecast-stability-core.mjs';
import {ForecastStabilityService} from '../lib/forecast-stability-service.mjs';
import {WeatherService} from '../lib/weather-service.mjs';
import {database} from './fixtures/push.mjs';
const now=Date.parse('2026-11-01T05:00:00Z'),HOUR=3600000,iso=t=>new Date(t).toISOString();
function edition(check=now,temp=50,rain=20){const url='https://api.weather.gov/gridpoints/LWX/1,1/forecast/hourly';return {revision:'r'+check,checked_at:iso(check),issued_at:iso(check-HOUR),data:{source_url:url,metadata:{properties:{forecastHourly:url,timeZone:'America/New_York'}},forecast:{properties:{updateTime:iso(check-HOUR),periods:Array.from({length:48},(_,i)=>({startTime:iso(now+i*HOUR),endTime:iso(now+(i+1)*HOUR),temperature:temp,temperatureUnit:'F',probabilityOfPrecipitation:{value:rain,unitCode:'wmoUnit:percent'}}))}}}};}
const report=(current=edition(),earlier=edition(now-24*HOUR,40,0),extra={})=>forecastStability({point:'39.0000,-77.0000',current,earlier,now,lookback_hours:24,...extra});

test('same future hours retain signed temperature and percentage-point changes with source evidence',()=>{
  const current=edition(),earlier=edition(now-24*HOUR,10,0);for(const p of earlier.data.forecast.properties.periods)p.temperatureUnit='C';
  const r=report(current,earlier);assert.equal(r.status,'compared');assert.equal(r.summary.temperature_paired_hours,48);assert.equal(r.summary.rain_paired_hours,48);
  assert.equal(r.rows[0].temperature_change_f,0);assert.equal(r.rows[0].rain_change_percentage_points,20);
  assert.equal(r.rows[1].at,'2026-11-01T06:00:00.000Z');assert.equal(r.time_zone,'America/New_York');assert.deepEqual(r.evidence,{current,earlier});
  assert.equal(report(edition(now,30,0)).rows[0].temperature_change_f,-10);
});
test('source gaps, duplicate/overlapping periods and unsupported units never become zero change',()=>{
  for(const mutate of [p=>p.shift(),p=>p.push({...p[0]}),p=>p[0].endTime=iso(now+2*HOUR),p=>p[0].temperatureUnit='K',p=>p[0].temperature=null]){
    const old=edition(now-24*HOUR);mutate(old.data.forecast.properties.periods);const r=report(edition(),old);assert.equal(r.rows[0].temperature_change_f,null);assert.ok(r.summary.temperature_paired_hours<48);
  }
  const old=edition(now-24*HOUR);delete old.data.forecast.properties.periods[0].probabilityOfPrecipitation.unitCode;
  assert.equal(report(edition(),old).rows[0].rain_change_percentage_points,null);
  old.data.forecast.properties.periods[1].startTime='not a time';assert.equal(report(edition(),old).summary.temperature_paired_hours,0);
});
test('missing, too-old and later checks or changing grid identity withhold comparisons',()=>{
  for(const earlier of [null,edition(now-20*HOUR),edition(now-28*HOUR)]){const r=report(edition(),earlier);assert.equal(r.status,'unavailable');assert.equal(r.summary.temperature_paired_hours,0);}
  const old=edition(now-24*HOUR);old.data.source_url='https://api.weather.gov/gridpoints/LWX/2,2/forecast/hourly';old.data.metadata.properties.forecastHourly=old.data.source_url;
  assert.match(report(edition(),old).reason,/grid identity/);assert.match(report(edition(now+1)).reason,/evaluation time/);
  const futureIssued=edition();futureIssued.issued_at=iso(now+HOUR);assert.match(report(futureIssued).reason,/source issue time/);
  assert.equal(report(edition(),edition(now-27*HOUR)).status,'compared');
});
test('source rollback, same edition and delayed collection remain explicit and never become accuracy scores',()=>{
  const current=edition(now-3*HOUR),earlier=edition(now-24*HOUR);current.revision=earlier.revision;current.issued_at=iso(now-48*HOUR);
  const r=report(current,earlier);assert.equal(r.current_delayed,true);assert.equal(r.source_issue_moved_back,true);assert.equal(r.same_revision,true);
  assert.match(r.interpretation,/not measured errors or calibrated confidence/);assert.equal(report({...edition(),error:'source down'}).current_delayed,true);
});
test('archive service pins cutoffs, retains rollbacks, excludes later editions and performs no collection',async()=>{
  const db=database();let clock=(now-24*HOUR)/1000,fetches=0;
  const w=new WeatherService(db,{clock:()=>clock,fetcher:async()=>{fetches++;throw Error('No upstream call expected');}}),key='forecast/39.0000,-77.0000',s=new ForecastStabilityService(w);
  try{
    const earlier=await w.collect(key,1,async()=>edition(now-24*HOUR,40).data);
    clock=now/1000;const current=await w.collect(key,1,async()=>edition(now,50).data);
    clock=(now+HOUR)/1000;await w.collect(key,1,async()=>edition(now+HOUR,90).data);
    clock=now/1000;const result=await s.compare(39,-77,24);assert.equal(result.rows[0].temperature_change_f,10);assert.equal(result.evidence.current.revision,current.revision);assert.equal(result.evidence.earlier.revision,earlier.revision);
    const missing=await s.compare(40,-77,24);assert.equal(missing.status,'unavailable');assert.equal(fetches,0);
    assert.equal((await w.statement('SELECT COUNT(*) AS n FROM datasets WHERE name=?','forecast/40.0000,-77.0000').first()).n,0);
    await assert.rejects(s.compare(null,-77,24),/Coordinates/);await assert.rejects(s.compare(39,-77,8),/Invalid/);
  }finally{db.close();}
});

