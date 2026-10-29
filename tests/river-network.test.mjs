import {test} from 'node:test';
import assert from 'node:assert/strict';
import {loadRiverNetwork,normalizeRiverNetwork,riverNetworkView,RIVER_NETWORK_METHOD} from '../public/river-network-core.mjs';
import {RiversService} from '../lib/rivers-service.mjs';
import {WeatherService} from '../lib/weather-service.mjs';
import {database} from './fixtures/push.mjs';
const raw=()=>({startingPoint:{LID:'BRKM2',Name:'Little Falls'},upstream:[{LID:'PORM2',Name:'Point of Rocks'},{LID:'EDFM2',Name:'Edwards Ferry'}],downstream:[{LID:'GTND2',Name:'Georgetown'}]});
const response=data=>Response.json(data);

test('NOAA connection order and raw evidence are retained without fabricating distances or source issue time',async()=>{
  const body=raw(),calls=[];const r=await loadRiverNetwork('brkm2',async(url,options)=>{calls.push([url,options]);return response(body);});
  assert.equal(calls[0][0],'https://api.water.noaa.gov/nwps/v1/gauges/BRKM2/riverflow');assert.equal(calls[0][1].headers.Accept,'application/json');assert.deepEqual(r.upstream.map(r=>r.id),['PORM2','EDFM2']);assert.deepEqual(r.raw,body);assert.equal(r.issued_at,null);assert.equal(r.upstream[0].distance_km,undefined);
});
test('duplicates, self references and contradictory directions are audited without guessing a direction',()=>{
  const r=raw();r.upstream.push(r.upstream[0],{LID:'BRKM2',Name:'Self'});r.downstream.push({LID:'PORM2',Name:'Conflicting name'});const n=normalizeRiverNetwork(r,'BRKM2');assert.deepEqual(n.upstream.map(r=>r.id),['EDFM2']);assert.deepEqual(n.ambiguous.map(r=>r.id),['PORM2']);assert.equal(n.audit.duplicates,1);assert.equal(n.audit.self_references,1);assert.deepEqual(n.audit.conflicting_ids,['PORM2']);
});
test('missing identity, partial lists, malformed IDs and oversized lists fail rather than claiming zero connections',()=>{
  for(const mutate of [r=>r.startingPoint.LID='',r=>r.startingPoint.LID='PORM2',r=>delete r.downstream,r=>r.upstream[0].LID='../evil',r=>r.upstream[0].Name=null,r=>r.upstream=Array(1001).fill(r.upstream[0])]){const r=raw();mutate(r);assert.throws(()=>normalizeRiverNetwork(r,'BRKM2'));}
  const r=raw();r.upstream=[];r.downstream=[];assert.equal(normalizeRiverNetwork(r,'BRKM2').upstream.length,0);
});
test('bounded upstream reads reject HTTP errors, redirects and bodies beyond the byte limit',async()=>{
  await assert.rejects(loadRiverNetwork('BRKM2',async()=>new Response('Unavailable',{status:503})),/503/);
  await assert.rejects(loadRiverNetwork('BRKM2',async()=>new Response(' ',{headers:{'content-length':'262145'}})),/oversized/);
  await assert.rejects(loadRiverNetwork('BRKM2',async()=>new Response(' '.repeat(262145))),/Oversized/);
  await assert.rejects(loadRiverNetwork('BRKM2',async()=>({ok:true,redirected:true,headers:new Headers()})),/Unexpected/);
  await assert.rejects(loadRiverNetwork('../BRKM2',async()=>{throw Error('Must not fetch');}),/Invalid gauge/);
});
test('view derives directions from raw evidence and marks missing, future, expired and failed checks delayed',()=>{
  const now=Date.parse('2026-10-29T03:00:00Z'),p={id:'BRKM2',method:RIVER_NETWORK_METHOD,raw:raw(),upstream:[{id:'FAKE1'}],checked_at:new Date(now).toISOString()};assert.equal(riverNetworkView(p,'BRKM2',now).delayed,false);assert.equal(riverNetworkView(p,'BRKM2',now).upstream[0].id,'PORM2');
  for(const patch of [{checked_at:null},{checked_at:new Date(now+61000).toISOString()},{checked_at:new Date(now-1350001).toISOString()},{stale:true},{error:'outage'}])assert.equal(riverNetworkView({...p,...patch},'BRKM2',now).delayed,true);
  assert.throws(()=>riverNetworkView(p,'PORM2',now),/selected gauge/);
});
test('shared river cache reuses collection, archives changes and retains last-good connections on outage',async()=>{
  const db=database();let now=1793242800,calls=0,body=raw(),broken=false;
  const weather=new WeatherService(db,{clock:()=>now,fetcher:async()=>{calls++;if(broken)throw Error('NWPS unavailable');return response(body);}}),service=new RiversService(weather);
  try{const a=await service.network('BRKM2');assert.equal(a.stale,false);await service.network('brkm2');assert.equal(calls,1);now+=901;body=raw();body.upstream.pop();const b=await service.network('BRKM2');assert.notEqual(a.revision,b.revision);assert.equal((await weather.read('hazards/rivers/network/BRKM2',now-1)).data.upstream.length,2);now+=901;broken=true;const c=await service.network('BRKM2');assert.equal(c.revision,b.revision);assert.equal(c.stale,true);assert.match(c.error,/unavailable/);assert.equal(c.checked_at,b.checked_at);await service.network('BRKM2');assert.equal(calls,3);}finally{db.close();}
});
test('NOAA empty starting point fails first collection and cannot replace retained evidence',async()=>{
  const db=database();let now=1793242800,body={startingPoint:{LID:'',Name:''},upstream:[],downstream:[]};const service=new RiversService(new WeatherService(db,{clock:()=>now,fetcher:async()=>response(body)}));
  try{await assert.rejects(service.network('BRKM2'),/unavailable/);now+=121;body=raw();const a=await service.network('BRKM2');now+=901;body={startingPoint:{LID:'',Name:''},upstream:[],downstream:[]};const b=await service.network('BRKM2');assert.equal(b.revision,a.revision);assert.equal(b.stale,true);}finally{db.close();}
});
