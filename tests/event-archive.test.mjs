import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import {WeatherService} from '../lib/weather-service.mjs';
import {EventsService,eventWrites} from '../lib/events-service.mjs';
import {eventId,timelineEntries} from '../public/events-core.mjs';
function database(){const sqlite=new DatabaseSync(':memory:');for(const name of readdirSync(new URL('../drizzle/',import.meta.url)).filter(f=>f.endsWith('.sql')).sort())sqlite.exec(readFileSync(new URL('../drizzle/'+name,import.meta.url),'utf8'));return {prepare(sql){const stmt=sqlite.prepare(sql);let values=[];return {bind(...v){values=v;return this;},async first(){return stmt.get(...values)||null;},async all(){return {results:stmt.all(...values)};},async run(){return stmt.run(...values);}};},async batch(statements){sqlite.exec('BEGIN');try{for(const s of statements)await s.run();sqlite.exec('COMMIT');}catch(e){sqlite.exec('ROLLBACK');throw e;}},close(){sqlite.close();}};}
const feature=(id,extra={})=>({type:'Feature',id:'https://api.weather.gov/alerts/'+id,geometry:null,properties:{id,status:'Actual',messageType:'Alert',event:'Flood Warning',areaDesc:'Test County',sent:'2026-10-28T00:00:00Z',...extra}});
function setup(){const db=database();let now=1000,data=[feature('a')],error=false;const details=new Map();const fetcher=async url=>{if(error)throw new Error('NWS outage');return {ok:true,json:async()=>url.includes('/active')?{type:'FeatureCollection',features:data}:details.get(decodeURIComponent(url.split('/').at(-1)))||{}};};const weather=new WeatherService(db,{fetcher,clock:()=>now});return {db,weather,events:new EventsService(weather),set:(at,features)=>{now=at;data=features;},fail:()=>{error=true;},details};}
test('CAP-linked messages share a timeline; future links and bodies never leak into past views',async()=>{
  const s=setup();await s.weather.alerts();const a=await eventId('a'),b=await eventId('b');s.set(1100,[feature('b',{messageType:'Update',references:[{identifier:'a'}],severity:'Severe'})]);await s.weather.alerts();
  const current=await s.events.story(a);assert.equal(new Set(current.transitions.map(t=>t.id)).size,2);assert.ok(current.transitions.some(t=>t.present===0));
  const past=await s.events.story(a,1050);assert.equal(past.transitions.length,1);assert.equal(past.transitions[0].feature.properties.id,'a');assert.equal(await s.events.story(b,1050),null);
  assert.equal((await s.events.story(b)).transitions.length,3);assert.match(timelineEntries(current).find(t=>t.present===0).label,/Left/);s.db.close();
});
test('unchanged polls deduplicate payloads but preserve actual collection times, including upstream rollback',async()=>{
  const s=setup(),id=await eventId('a');await s.weather.alerts();s.set(1100,[feature('a')]);await s.weather.alerts();assert.equal((await s.events.story(id)).transitions.length,1);assert.equal((await s.events.story(id)).last_collection,new Date(1100000).toISOString());
  s.set(1200,[feature('a',{severity:'Severe'})]);await s.weather.alerts();s.set(1300,[feature('a')]);await s.weather.alerts();const story=await s.events.story(id);assert.equal(story.transitions.length,3);assert.equal(story.transitions[0].revision,story.transitions[2].revision);assert.equal((await s.events.story(id,1250)).transitions.at(-1).feature.properties.severity,'Severe');s.db.close();
});
test('outages do not retire messages, while complete empty collections record absence without asserting cancellation',async()=>{
  const s=setup(),id=await eventId('a');await s.weather.alerts();s.set(1100,[]);s.fail();await s.weather.alerts();assert.equal((await s.events.story(id)).transitions.length,1);s.db.close();
  const clean=setup();await clean.weather.alerts();clean.set(1100,[]);await clean.weather.alerts();const story=await clean.events.story(id);assert.equal(story.transitions.at(-1).present,0);assert.equal(story.transitions.at(-1).feature.properties.messageType,'Alert');clean.db.close();
});
test('late retrieval retains true collection time and does not rewrite earlier knowledge',async()=>{
  const s=setup(),a=await eventId('a');s.set(1000,[feature('a',{references:[{identifier:'old'}]})]);await s.weather.alerts();assert.equal((await s.events.story(a)).missing_references.length,1);
  s.details.set('old',feature('old',{sent:'2026-10-27T00:00:00Z'}));s.set(1200,[]);const result=await s.events.resolve(a);assert.equal(result.retrieved,1);assert.equal(result.remaining,0);
  const now=await s.events.story(a),past=await s.events.story(a,1100);assert.equal(now.transitions.length,2);assert.equal(past.transitions.length,1);assert.equal(past.missing_references.length,1);assert.equal(now.transitions.at(-1).present,null);s.db.close();
});
test('a reference arriving later in the same second cannot enter an earlier millisecond cutoff',async()=>{
  const s=setup(),id=await eventId('a');let millis=1000100;s.weather.eventClock=()=>millis;s.set(1000,[feature('a',{references:[{identifier:'old'}]})]);await s.weather.alerts();s.details.set('old',feature('old'));millis=1000800;await s.events.resolve(id);assert.equal((await s.events.story(id)).transitions.length,2);assert.equal((await s.events.story(id,1000.5)).transitions.length,1);s.db.close();
});
test('cycles and multiple references form one bounded graph and explicit cancellation stays explicit',async()=>{
  const s=setup();s.set(1000,[feature('a',{references:[{identifier:'b'}]}),feature('b',{references:[{identifier:'a'},{identifier:'c'}]})]);await s.weather.alerts();s.details.set('c',feature('c',{messageType:'Cancel',references:[{identifier:'a'}]}));s.set(1200,[]);const id=await eventId('a');await s.events.resolve(id);const story=await s.events.story(id);assert.equal(story.transitions.length,3);assert.ok(timelineEntries(story).some(t=>t.label==='Official cancellation collected'));s.db.close();
});
test('newly discovered reference generations can be retrieved without waiting for the previous batch cache',async()=>{
  const s=setup(),id=await eventId('a');s.set(1000,[feature('a',{references:[{identifier:'old'}]})]);await s.weather.alerts();s.details.set('old',feature('old',{references:[{identifier:'oldest'}]}));s.details.set('oldest',feature('oldest'));s.set(1200,[]);
  assert.equal((await s.events.resolve(id)).remaining,1);assert.equal((await s.events.resolve(id)).remaining,0);assert.equal((await s.events.story(id)).transitions.length,3);s.db.close();
});
test('persistent event history survives the rolling 24-hour map archive and service restart',async()=>{
  const s=setup();await s.weather.alerts();const id=await eventId('a');s.set(1000+2*86400,[]);await s.weather.alerts();assert.equal(await s.weather.read('alerts/us',1000),null);const events=new EventsService(s.weather);assert.equal((await events.story(id,1000)).transitions.length,1);assert.equal((await events.list('Flood')).messages.length,1);s.db.close();
});
test('a stale lease cannot commit event records or collection checks',async()=>{
  const s=setup();await s.weather.statement("INSERT INTO datasets(name,lease_token) VALUES ('alerts/us','new-owner')").run();const writes=await eventWrites(s.weather,[feature('a')],1000,'old-owner','alerts/us',true);await s.db.batch(writes);assert.equal((await s.events.list()).messages.length,0);assert.equal(await s.events.story(await eventId('a')),null);s.db.close();
});
test('a concurrently retrieved reference cannot overwrite active-feed state',async()=>{
  const s=setup(),id=await eventId('a');await s.weather.statement("INSERT INTO datasets(name,lease_token) VALUES ('event-reference/test','ref-owner')").run();
  const ref=await eventWrites(s.weather,[feature('a',{severity:'Moderate'})],1000000,'ref-owner','event-reference/test',false);
  s.set(1000,[feature('a',{severity:'Severe'})]);await s.weather.alerts();await s.db.batch(ref);
  assert.equal((await s.events.list()).messages[0].present,1);const story=await s.events.story(id);assert.equal(story.transitions.length,1);assert.equal(story.transitions[0].origin,'active-feed');assert.equal(story.transitions[0].feature.properties.severity,'Severe');s.db.close();
});
test('archive identifiers, future cutoffs and cursors are validated',async()=>{
  const s=setup();await assert.rejects(s.events.story('bad'),/Invalid/);await assert.rejects(s.events.story(await eventId('a'),2000),/Invalid/);await assert.rejects(s.events.list('',"' OR 1=1"),/Invalid/);assert.equal(await eventId('a'),await eventId('https://api.weather.gov/alerts/a'));s.db.close();
});
