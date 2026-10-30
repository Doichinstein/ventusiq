import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {normalizeRoadwork,prepareRoadwork,evaluateRoadwork,selectRoadworkFeeds} from '../public/roadwork-core.mjs';
import {collectRoadwork,renderRoadwork,drawRoadwork} from '../public/journey-roadwork.mjs';
import {roadRaw,roadNow,roadRoute} from './roadwork-fixture.mjs';

test('moving and planned moving work retain geometry but cannot project that location to arrival',()=>{
  for(const type of ['moving','planned-moving-area','unsupported',null]){
    const raw=roadRaw();raw.feed_info.version='4.2';raw.features[0].properties.work_zone_type=type;
    const p={...normalizeRoadwork(raw,'md'),checked_at:new Date(roadNow).toISOString()};
    const e=evaluateRoadwork(prepareRoadwork(roadRoute,[p]),roadNow,roadNow).feeds[0].candidates[0];
    assert.equal(e.usable_timing,false);assert.equal(e.motion.fixed_geometry_comparison,false);
    assert.ok(e.passages.length);assert.deepEqual(e.geometry,raw.features[0].geometry);assert.deepEqual(p.raw,raw);
    assert.deepEqual(JSON.parse(JSON.stringify(e)).motion,e.motion);
  }
});

test('static source labels and omitted motion do not claim verified road access',()=>{
  for(const type of ['static',undefined]){
    const raw=roadRaw();if(type)raw.features[0].properties.work_zone_type=type;
    const p={...normalizeRoadwork(raw,'md'),checked_at:new Date(roadNow).toISOString()};
    const e=evaluateRoadwork(prepareRoadwork(roadRoute,[p]),roadNow,roadNow).feeds[0].candidates[0];
    assert.equal(e.usable_timing,true);assert.equal(e.motion.status,type?'reported_static':'unspecified');
    assert.match(e.motion.reason,type?/does not verify/:/does not confirm/);
  }
});

test('real Northern New England edition preserves an unknown record time despite a fresh feed',()=>{
  const evidence=JSON.parse(readFileSync(new URL('../docs/evidence/new-england-roadwork-2026-10-30.json',import.meta.url)));
  const now=Date.parse(evidence.source.collected_at),raw=evidence.subset;
  const p={...normalizeRoadwork(raw,'ne'),checked_at:evidence.source.collected_at};
  const route={vertices:p.events[0].geometry.coordinates.map((coordinate,i)=>({coordinate,elapsed:i*60}))};
  const v=evaluateRoadwork(prepareRoadwork(route,[p]),now,now),e=v.feeds[0].candidates[0];
  assert.equal(v.feeds[0].fresh,true);assert.equal(e.updated_at,null);
  assert.equal(e.event_freshness.status,'unknown');assert.equal(e.usable_timing,false);
  assert.equal(e.motion.status,'unspecified');assert.equal(e.vehicle_impact,'some-lanes-closed');
  assert.equal(e.source_id_listed,true);assert.deepEqual(p.raw,raw);
  assert.match(raw.features[0].properties.core_details.update_date,/^0001-/);
  assert.deepEqual(e.geometry,raw.features[0].geometry);
});

test('feed limit rejects excess or invalid choices before any network request, never silently drops choices',async()=>{
  let calls=[];const request=async path=>{calls.push(path);return {feed:new URL(path,'https://example.test').searchParams.get('feed')};};
  await assert.rejects(collectRoadwork(['md','ia','wa','ne'],request),/up to three/);
  await assert.rejects(collectRoadwork(['ne','bad'],request),/Invalid/);assert.equal(calls.length,0);
  const result=await collectRoadwork(['ne','md','wa','ne'],request);
  assert.deepEqual(result.map(x=>x.feed),['ne','md','wa']);assert.equal(calls.length,3);
  assert.deepEqual(selectRoadworkFeeds([]),[]);
});

test('moving-work warning appears in both detail cards and map popups with uncertain styling',()=>{
  class Element{constructor(){this.children=[];this.text='';}set textContent(v){this.text=String(v);}get textContent(){return this.text+this.children.map(x=>x.textContent).join('');}append(...v){this.children.push(...v);}replaceChildren(...v){this.children=v;}}
  const nodes=new Map(),document={createElement:()=>new Element(),getElementById(id){if(!nodes.has(id))nodes.set(id,new Element());return nodes.get(id);}};
  const raw=roadRaw();raw.features[0].properties.work_zone_type='moving';
  const p={...normalizeRoadwork(raw,'md'),checked_at:new Date(roadNow).toISOString()},view=evaluateRoadwork(prepareRoadwork(roadRoute,[p]),roadNow,roadNow);
  renderRoadwork(document,view,String);assert.match(document.getElementById('journey-roadwork-list').textContent,/cannot be projected/);
  let color,popup;const L={polyline(coords,style){color=style.color;return {addTo(){return this;},bindPopup(value){popup=value;}};}};
  drawRoadwork(L,{},view,document);assert.equal(color,'#9cabbc');assert.match(popup.textContent,/cannot be projected/);
});
