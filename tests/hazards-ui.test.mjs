// Interaction tests use DOM/Leaflet doubles, not a claim of rendered visual QA.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {mountHazards} from '../public/hazards.js';
class Element{
  constructor(){this.children=[];this.value='';this.checked=false;this.hidden=false;this.style={};this.text='';}
  set textContent(v){this.text=String(v??'');this.children=[];}
  get textContent(){return this.text+this.children.map(c=>c.textContent).join('');}
  append(...children){this.children.push(...children);}
  replaceChildren(...children){this.text='';this.children=children;}
}
const fire=(id,lon=-122)=>({type:'Feature',id,geometry:{type:'Point',coordinates:[lon,37]},properties:{name:'<script>fire</script>',kind:'Wildfire',acres:0,contained:0,state:'CA',updated_at:'2026-10-28T19:00:00Z'}});
async function setup(){
  const ids=[...readFileSync(new URL('../public/index.html',import.meta.url),'utf8').matchAll(/id="([^"]+)"/g)].map(m=>m[1]);
  const nodes=Object.fromEntries(ids.map(id=>[id,new Element()])),attached=new Set(),timers=[],requests=[];
  let now=Date.parse('2026-10-28T20:00:00Z'),failure=false,hold=false;const pending=[];
  const map={removeLayer(layer){attached.delete(layer);},closePopup(){},fitBounds(){}};
  const layer=()=>({events:{},addTo(){attached.add(this);return this;},on(name,fn){this.events[name]=fn;return this;},clearLayers(){this.children=[];},children:[],getLayers(){return this.children;},addLayer(l){this.children.push(l);},getBounds(){return {isValid:()=>true};}});
  const L={layerGroup:layer,geoJSON(data,options){return Object.assign(layer(),{data,options});},tileLayer:{wms(url,options){return Object.assign(layer(),{url,options});}}};
  const window={WEATHER_CONFIG:{mode:'hosted'},WeatherMap:{instance:map,isReplay:()=>false,focus(){}},WeatherPersonal:{current:()=>null},setInterval:fn=>timers.push(fn)};
  const fetcher=async url=>{requests.push(url);if(hold)await new Promise(r=>pending.push(r));if(failure)throw new Error('Unavailable');const stamp=new Date(now).toISOString();const kind=url.split('/').pop();return {ok:true,json:async()=>kind==='satellite'?{date:'2026-10-27',checked_at:stamp}:{type:'FeatureCollection',source:'Test provider',features:kind==='fires'?[fire('a')]:[{...fire('b'),properties:{name:'Monitor',aqi:151,pm25:56,observed_at:stamp}}],checked_at:stamp}};};
  const mounted=mountHazards({document:{getElementById:id=>nodes[id],createElement:()=>new Element()},window,L,fetcher,clock:()=>now});
  return {nodes,window,mounted,attached,timers,requests,advance:ms=>{now+=ms;},fail:()=>{failure=true;},hold:()=>{hold=true;},release:()=>{hold=false;for(const resolve of pending.splice(0))resolve();}};
}
test('map toggles, archive replay and source outages preserve honest last-good layers',async()=>{
  const s=await setup();s.nodes['layer-fires'].checked=true;s.nodes['layer-fires'].onchange();await s.mounted.load('fires');
  assert.equal(s.attached.size,1);assert.match(s.nodes['fire-list'].textContent,/<script>fire<\/script>/);assert.equal(s.nodes['fire-list'].children[0].children[0].children.length,0);
  s.window.WeatherHazards.setReplay(true);assert.equal(s.attached.size,0);assert.equal(s.nodes['hazard-replay'].hidden,false);
  s.window.WeatherHazards.setReplay(false);assert.equal(s.attached.size,1);
  s.advance(901000);s.fail();await s.mounted.load('fires');assert.equal(s.attached.size,1);assert.match(s.nodes['fires-status'].textContent,/Updates delayed/);const count=s.requests.length;await s.mounted.load('fires');assert.equal(s.requests.length,count);
});
test('saved places use distance and recent measurements, never treating missing coverage as good air',async()=>{
  const s=await setup();s.window.WeatherHazards.updatePlace({lat:37,lon:-122});await Promise.all([s.mounted.load('fires'),s.mounted.load('air')]);
  assert.match(s.nodes['place-hazards'].textContent,/AQI 151/);assert.match(s.nodes['place-hazards'].textContent,/0.0 km/);
  s.window.WeatherHazards.updatePlace({lat:0,lon:0});assert.match(s.nodes['place-hazards'].textContent,/Air quality here is unknown/);assert.doesNotMatch(s.nodes['place-hazards'].textContent,/AQI 151/);
  s.advance(4*3600000);s.fail();s.window.WeatherHazards.updatePlace({lat:37,lon:-122});await Promise.all([s.mounted.load('fires'),s.mounted.load('air')]);assert.match(s.nodes['place-hazards'].textContent,/Air quality here is unknown/);
});

test('compound consumers receive source refreshes and stale last-good snapshots after an air outage',async()=>{
  const s=await setup();let refreshed=0;s.window.WeatherCompound={refresh(){refreshed++;}};await s.mounted.load('air');const first=s.window.WeatherHazards.snapshot('air');assert.equal(first.stale,false);assert.equal(refreshed,1);s.advance(901000);s.fail();await s.mounted.load('air');const stale=s.window.WeatherHazards.snapshot('air');assert.equal(stale.stale,true);assert.equal(stale.checked_at,first.checked_at);assert.match(stale.error,/Unavailable/);assert.equal(refreshed,2);
});
test('a changed place wins over an earlier pending source request',async()=>{
  const s=await setup();s.hold();s.window.WeatherHazards.updatePlace({lat:37,lon:-122});s.window.WeatherHazards.updatePlace({lat:0,lon:0});
  s.release();await Promise.all([s.mounted.load('fires'),s.mounted.load('air')]);
  assert.match(s.nodes['place-hazards'].textContent,/Air quality here is unknown/);assert.doesNotMatch(s.nodes['place-hazards'].textContent,/AQI 151/);
});
test('satellite overlay uses the provider day and visibly reports missing tiles',async()=>{
  const s=await setup();s.nodes['layer-satellite'].checked=true;await s.mounted.load('satellite');const overlay=[...s.attached][0];
  assert.equal(overlay.options.time,'2026-10-27');assert.match(overlay.url,/epsg4326/);overlay.events.tileerror();assert.match(s.nodes['satellite-status'].textContent,/coverage is incomplete/);
  s.nodes['layer-satellite'].checked=false;s.nodes['layer-satellite'].onchange();assert.equal(s.attached.size,0);
});
