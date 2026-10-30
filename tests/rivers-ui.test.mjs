// DOM/Leaflet interaction doubles; these do not replace rendered browser QA.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {mountRivers} from '../public/rivers.js';
class Element{
  constructor(tag='div'){this.tagName=tag;this.children=[];this.value='';this.hidden=false;this.text='';this.style={};this.attrs={};this.classList={toggle(){}};}
  set textContent(v){this.text=String(v??'');this.children=[];}
  get textContent(){return this.text+this.children.map(c=>c.textContent).join('');}
  append(...children){this.children.push(...children);}
  replaceChildren(...children){this.text='';this.children=children;}
  setAttribute(k,v){this.attrs[k]=v;}
}
const base=Date.parse('2026-10-28T20:00:00Z'),at=h=>new Date(base+h*3600000).toISOString();
function gauge(id){return {metadata:{lid:id,name:'<script>River</script> '+id,latitude:37,longitude:-91,flood:{stageUnits:'ft',categories:{action:{stage:5},minor:{stage:10}},impacts:[{stage:10,statement:'Low road flooding.'}]},status:{observed:{primary:4,primaryUnit:'ft',validTime:at(-1)},forecast:{floodCategory:'minor'}}},series:{observed:{primaryName:'Stage',primaryUnits:'ft',data:[{validTime:at(-1),primary:4}]},forecast:{primaryName:'Stage',primaryUnits:'ft',issuedTime:at(-2),data:[{validTime:at(1),primary:6},{validTime:at(3),primary:12},{validTime:at(5),primary:9}]}},official_url:'https://water.noaa.gov/gauges/'+id.toLowerCase(),checked_at:at(0)};}
function setup(){
  const nodes=Object.fromEntries([...readFileSync(new URL('../public/index.html',import.meta.url),'utf8').matchAll(/id="([^"]+)"/g)].map(m=>[m[1],new Element()]));
  const attached=new Set(),timers=[],waits=new Map(),held=new Set(),requests=[];let now=base,broken=false;
  const layer=()=>({addTo(){attached.add(this);return this;},getBounds(){return {isValid:()=>true};}});
  const map={getCenter:()=>({lat:37,lng:-91}),removeLayer:l=>attached.delete(l),fitBounds(){}};
  const L={geoJSON(data,options){return Object.assign(layer(),{data,options});}};
  const window={WEATHER_CONFIG:{mode:'hosted'},WeatherMap:{instance:map,isReplay:()=>false,focus(){},goLive(){window.WeatherRivers?.setReplay(false);}},WeatherPersonal:{current:()=>null,show(){window.WeatherRivers?.hide();}},setInterval:fn=>timers.push(fn)};
  const fetcher=async url=>{requests.push(url);const id=new URL('https://example.test'+url).searchParams.get('id');if(held.has(id))await new Promise(r=>waits.set(id,r));if(broken)throw new Error('Upstream outage');return {ok:true,json:async()=>id?gauge(id):{type:'FeatureCollection',checked_at:at(0),features:[{type:'Feature',id:'TEST1',geometry:{type:'Point',coordinates:[-91,37]},properties:{name:'Test river',state:'MO',observed:{value:4,unit:'ft',at:at(-1),category:'no_flooding'}}}]}};};
  const mounted=mountRivers({document:{getElementById:id=>nodes[id],createElement:tag=>new Element(tag),createElementNS:(_,tag)=>new Element(tag)},window,L,fetcher,clock:()=>now});
  return {nodes,window,mounted,attached,timers,requests,advance:ms=>{now+=ms;},break:()=>{broken=true;},hold:id=>held.add(id),release:id=>{held.delete(id);waits.get(id)();}};
}
test('gauge selection renders separate observations, forecasts, thresholds, official impacts and accessible chart',async()=>{
  const s=setup();await s.mounted.openGauge('TEST1');assert.equal(s.nodes['river-detail'].hidden,false);assert.match(s.nodes['river-summary'].textContent,/12 ft/);assert.match(s.nodes['river-crossings'].textContent,/Rises to this level between/);assert.match(s.nodes['river-impacts'].textContent,/Low road flooding/);
  assert.equal(s.nodes['river-chart'].children[0].attrs.role,'img');assert.equal(s.nodes['river-table'].children.length,4);assert.equal(s.nodes['river-title'].textContent,'<script>River</script> TEST1');assert.equal(s.nodes['river-title'].children.length,0);assert.match(s.nodes['river-datum'].textContent,/Vertical datum details are not supplied/);
});
test('a late old gauge cannot overwrite the newer selection',async()=>{
  const s=setup();s.hold('TEST1');const first=s.mounted.openGauge('TEST1');await s.mounted.openGauge('TEST2');s.release('TEST1');await first;assert.match(s.nodes['river-title'].textContent,/TEST2$/);
});
test('outage keeps observations and suppresses stale forecast decisions',async()=>{
  const s=setup();await s.mounted.openGauge('TEST1');s.advance(901000);s.break();await s.mounted.openGauge('TEST1');assert.match(s.nodes['river-status'].textContent,/Updates delayed/);assert.match(s.nodes['river-summary'].textContent,/4 ft/);assert.match(s.nodes['river-summary'].textContent,/No current forecast/);assert.doesNotMatch(s.nodes['river-summary'].textContent,/12 ft/);
});
test('regional markers hide in replay and nearby gauges do not imply local flood coverage',async()=>{
  const s=setup();await s.mounted.search({lat:37,lon:-91});s.nodes['river-region-map'].onclick();assert.equal(s.attached.size,1);s.window.WeatherRivers.setReplay(true);assert.equal(s.attached.size,0);assert.match(s.nodes['river-map-status'].textContent,/hidden during alert replay/);s.window.WeatherRivers.setReplay(false);assert.equal(s.attached.size,1);
  s.window.WeatherRivers.updatePlace({lat:0,lon:0});await s.mounted.load('near/0,0');await Promise.resolve();assert.match(s.nodes['place-rivers'].textContent,/Local flood conditions are unknown/);s.nodes['river-map-clear'].onclick();assert.equal(s.attached.size,0);
});
test('visible map gauges refresh while the river workspace is closed and label a failed update',async()=>{
  const s=setup();await s.mounted.search({lat:37,lon:-91});s.nodes['river-region-map'].onclick();s.advance(901000);s.break();s.timers[0]();await s.mounted.load('near/37,-91');await Promise.resolve();
  assert.equal(s.attached.size,1);assert.match(s.nodes['river-map-status'].textContent,/updates delayed/);
});

test('entering this workspace suspends the main smoke animation',async()=>{const s=setup(),visibility=[];s.window.WeatherSmokeMap={setVisible:v=>visibility.push(v)};s.nodes['nav-rivers'].onclick();assert.deepEqual(visibility,[false]);});


test('Rivers automatically maps selected gauges and removes its overlays on workspace exit',async()=>{
 const s=setup();await s.mounted.openGauge('TEST1');assert.equal(s.attached.size,1);
 s.window.WeatherRivers.hide();assert.equal(s.attached.size,0);
 s.advance(901000);s.hold('TEST2');const pending=s.mounted.openGauge('TEST2');s.window.WeatherRivers.hide();s.release('TEST2');await pending;assert.equal(s.attached.size,0);
});
