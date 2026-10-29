import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import {WeatherService} from '../lib/weather-service.mjs';
import {SmokeService} from '../lib/smoke-service.mjs';
function database(){const sqlite=new DatabaseSync(':memory:');for(const name of readdirSync(new URL('../drizzle/',import.meta.url)).filter(n=>n.endsWith('.sql')).sort())sqlite.exec(readFileSync(new URL('../drizzle/'+name,import.meta.url),'utf8'));return {prepare(sql){const s=sqlite.prepare(sql);let args=[];return {bind(...v){args=v;return this;},async first(){return s.get(...args)||null;},async run(){return s.run(...args);},async all(){return {results:s.all(...args)};}};},async batch(statements){sqlite.exec('BEGIN');try{for(const s of statements)await s.run();sqlite.exec('COMMIT');}catch(e){sqlite.exec('ROLLBACK');throw e;}},close(){sqlite.close();}};}

function setup(){
 const db=database();let now=Date.parse('2026-10-28T10:30:00Z')/1000,broken=false,calls=0;
 const issued=Date.parse('2026-10-28T03:00:00Z'),attributes={objectid:1,idp_subset:'conus',idp_issueddate:issued,idp_validtime:issued+8*3600000};
 const weather=new WeatherService(db,{clock:()=>now,fetcher:async url=>{calls++;if(broken)throw Error('Smoke outage');const u=new URL(url);return {ok:true,json:async()=>u.pathname.endsWith('/query')?{features:[{attributes}]}:{samples:[{rasterId:1,attributes,value:'0.000000012',location:JSON.parse(u.searchParams.get('geometry'))}]}};}});
 return {db,weather,service:new SmokeService(weather),calls:()=>calls,advance:()=>now+=3601,break:()=>broken=true};
}
test('smoke shares rounded point and catalog caches and preserves raw evidence',async()=>{const s=setup();const a=await s.service.forecast(38.581,-121.503),calls=s.calls();const b=await s.service.forecast(38.58,-121.5);assert.equal(a.revision,b.revision);assert.equal(s.calls(),calls);assert.equal(a.samples[0].value,'0.000000012');await s.service.forecast(38.59,-121.5);assert.equal(s.calls(),calls+1);assert.equal((await s.weather.read('hazards/smoke-point/38.58,-121.5')).revision,a.revision);s.db.close();});
test('failed smoke refresh preserves last-good evidence and marks it delayed',async()=>{const s=setup();const a=await s.service.forecast(38.58,-121.5);s.advance();s.break();const b=await s.service.forecast(38.58,-121.5);assert.equal(a.revision,b.revision);assert.equal(a.checked_at,b.checked_at);assert.equal(b.stale,true);assert.equal(b.error,'Smoke outage');s.db.close();});
test('invalid coordinates and point admission cap prevent unbounded source requests',async()=>{const s=setup();await assert.rejects(s.service.forecast(null,null),/Invalid/);assert.equal(s.calls(),0);for(let i=0;i<500;i++)await s.weather.statement('INSERT INTO datasets(name) VALUES (?)','hazards/smoke-point/'+i).run();await assert.rejects(s.service.forecast(38.58,-121.5),/capacity/);assert.equal(s.calls(),0);s.db.close();});
