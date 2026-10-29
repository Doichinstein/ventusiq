import {test} from 'node:test';
import assert from 'node:assert/strict';
import {ROADWORK_METHOD,normalizeRoadwork,prepareRoadwork,evaluateRoadwork,roadActivity,roadVerification} from '../public/roadwork-core.mjs';
import {renderRoadwork,drawRoadwork} from '../public/journey-roadwork.mjs';
import {RoadworkService} from '../lib/roadwork-service.mjs';
import {WeatherService} from '../lib/weather-service.mjs';
import {database} from './fixtures/push.mjs';
import {roadRaw,roadNow,roadRoute} from './roadwork-fixture.mjs';
const iso=ms=>new Date(ms).toISOString();
function source(patch={}){const raw=roadRaw();Object.assign(raw.features[0].properties,patch);return raw;}
function view(raw){return evaluateRoadwork(prepareRoadwork(roadRoute,[{...normalizeRoadwork(raw,'md'),checked_at:iso(roadNow)}]),roadNow,roadNow);}

test('verification distinguishes absent, invalid, estimated and verified fields with current-field precedence',()=>{
  assert.deepEqual(roadVerification({},'current','legacy'),{value:null,field:null,status:'unknown'});
  assert.deepEqual(roadVerification({current:false,legacy:'verified'},'current','legacy'),{value:false,field:'current',status:'unverified'});
  for(const current of [null,'true',1])assert.deepEqual(roadVerification({current,legacy:'verified'},'current','legacy'),{value:null,field:'current',status:'invalid'});
  assert.deepEqual(roadVerification({legacy:'verified'},'current','legacy'),{value:true,field:'legacy',status:'verified'});
  assert.equal(roadVerification({legacy:'estimated'},'current','legacy').value,false);
  assert.equal(roadVerification({legacy:'unknown'},'current','legacy').status,'invalid');
});

test('legacy GPS positions and source location references survive normalization without inferred network identity',()=>{
  const raw=source({beginning_accuracy:'verified',ending_accuracy:'estimated',location_method:'sign',beginning_cross_street:'<img src=x onerror=alert(1)>',ending_cross_street:'Second St',beginning_milepost:0,ending_milepost:12});
  const p=normalizeRoadwork(raw,'ia'),e=p.events[0];
  assert.equal(e.start_position_verified,true);assert.equal(e.end_position_verified,false);
  assert.equal(e.verification.start_position.field,'beginning_accuracy');assert.equal(e.location_method,'sign');
  assert.equal(e.beginning_milepost,0);assert.equal(e.ending_milepost,12);assert.deepEqual(p.raw,raw);
  assert.equal(normalizeRoadwork(source(),'md').events[0].start_position_verified,null);
  assert.equal(normalizeRoadwork(source({beginning_milepost:'0'}),'md').events[0].beginning_milepost,null);
});

test('ended and contradictory confirmations are interpreted against the original feed generation time',()=>{
  const future=view(source({is_end_date_verified:true})).feeds[0].candidates[0];
  assert.equal(future.activity.status,'conflicting_end_confirmation');assert.equal(future.usable_timing,false);
  assert.equal(future.activity.reference_time,iso(roadNow));
  const ended=normalizeRoadwork(source({is_end_date_verified:true,start_date:iso(roadNow-7200000),end_date:iso(roadNow-3600000)}),'md').events[0];
  assert.equal(roadActivity(ended,iso(roadNow)).status,'reported_ended');
  assert.equal(roadActivity({...ended,end_ms:null},iso(roadNow)).status,'reported_ended_time_unknown');
  assert.equal(roadActivity(ended,null).usable,false);
  const futureStart=view(source({start_date:iso(roadNow+300000)})).feeds[0].candidates[0];
  assert.equal(futureStart.activity.status,'conflicting_start_confirmation');assert.equal(futureStart.usable_timing,false);
  const prepared=prepareRoadwork(roadRoute,[{...normalizeRoadwork(source({is_end_date_verified:true}),'md'),checked_at:iso(roadNow)}]);
  assert.equal(evaluateRoadwork(prepared,roadNow,roadNow+7200000).feeds[0].candidates[0].activity.status,'conflicting_end_confirmation');
});

test('invalid confirmations withhold applicability while ordinary windows never claim continuous activity',()=>{
  for(const patch of [{is_start_date_verified:'true'},{is_end_date_verified:null}]){
    const e=view(source(patch)).feeds[0].candidates[0];assert.equal(e.activity.status,'invalid_confirmation');assert.equal(e.usable_timing,false);
  }
  for(const event_status of ['cancelled','completed'])assert.equal(view(source({event_status})).feeds[0].candidates[0].activity.status,'reported_'+event_status);
  const raw=source();delete raw.features[0].properties.is_start_date_verified;delete raw.features[0].properties.is_end_date_verified;
  const e=view(raw).feeds[0].candidates[0];assert.equal(e.activity.status,'not_confirmed_active');assert.equal(e.usable_timing,true);
  assert.match(e.activity.reason,/do not confirm continuous work/);
});

test('older cached editions are reinterpreted without mutating their revision or bypassing outage backoff',async()=>{
  const db=database();let now=roadNow/1000,calls=0;
  const w=new WeatherService(db,{clock:()=>now,fetcher:async()=>{calls++;return new Response(null,{status:503});}});
  const legacy={...normalizeRoadwork(source({beginning_accuracy:'verified'}),'ia'),method:'2026-10-29.1'};
  legacy.events[0].start_position_verified=false;delete legacy.events[0].verification;
  try{
    const original=await w.collect('roadwork/wzdx/ia',300,async()=>legacy),s=new RoadworkService(w);
    const current=await s.feed('ia');assert.equal(calls,0);assert.equal(current.method,ROADWORK_METHOD);assert.equal(current.archived_method,legacy.method);
    assert.equal(current.revision,original.revision);assert.equal(current.events[0].start_position_verified,true);
    now+=301;const stale=await s.feed('ia');assert.equal(calls,1);assert.equal(stale.stale,true);assert.match(stale.error,/503/);
    assert.equal(stale.events[0].start_position_verified,true);assert.equal(stale.revision,original.revision);
    await s.feed('ia');assert.equal(calls,1);assert.deepEqual((await w.read('roadwork/wzdx/ia')).data,legacy);
  }finally{db.close();}
});

class Element{
  constructor(tag){this.tag=tag;this.children=[];this.text='';}
  set textContent(value){this.text=String(value);this.children=[];}
  get textContent(){return this.text+this.children.map(c=>c.textContent).join('');}
  append(...nodes){this.children.push(...nodes);}
  replaceChildren(...nodes){this.children=nodes;}
}
test('cards and map disclose conflicting evidence, preserve zero mileposts and render agency markup as text',()=>{
  const nodes=new Map(),document={getElementById(id){if(!nodes.has(id))nodes.set(id,new Element('div'));return nodes.get(id);},createElement:tag=>new Element(tag)};
  const v=view(source({is_end_date_verified:true,beginning_accuracy:'verified',beginning_cross_street:'<img src=x onerror=alert(1)>',beginning_milepost:0}));
  renderRoadwork(document,v,String);
  const body=document.getElementById('journey-roadwork-list').textContent;
  assert.match(body,/end date later than the feed generation/);assert.match(body,/reported verified \(beginning_accuracy\)/);
  assert.match(body,/unknown \(field not supplied\)/);assert.match(body,/Mileposts: 0 to unknown/);
  const all=n=>[n,...n.children.flatMap(all)];const textNode=all(document.getElementById('journey-roadwork-list')).find(n=>n.tag==='p'&&n.text.includes('<img'));
  assert.ok(textNode);assert.equal(textNode.children.length,0);
  const drawn=[],L={polyline(coords,style){const row={coords,style};drawn.push(row);return {addTo(){return this;},bindPopup(p){row.popup=p;return this;}};}};
  drawRoadwork(L,{},v,document);assert.equal(drawn[0].style.color,'#9cabbc');assert.match(drawn[0].popup.textContent,/end date later/);
  drawRoadwork(L,{},view(source()),document);assert.equal(drawn[1].style.color,'#e7c579');
});
