import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseHTML} from 'linkedom';
import {mountWorkspaceExplorer} from '../public/workspace-explorer.mjs';
import {coordinateQuery,locationMatches} from '../public/location-entry-core.mjs';
import {geocodeResult} from '../public/geocode-core.mjs';
const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
const raw=JSON.parse(readFileSync(new URL('./fixtures/geocode.json',import.meta.url),'utf8'));
const tick=()=>new Promise(r=>setImmediate(r));
function setup(mode='hosted',mount=true){
  const {document}=parseHTML(html),get=id=>document.getElementById(id),layers=new Set(),calls=[],previews=[],runs=[],clears=[];let center,hold=false,release,broken=false,exported,now=10000;
  const originalMap=get('map'),map={setView:p=>center=p,fitBounds:p=>center=p,removeLayer:l=>layers.delete(l)};
  const window={WEATHER_CONFIG:{mode},navigator:{},WeatherMap:{instance:map,setOverlayFit(){}},WeatherPersonal:{current:()=>null,preview(...args){previews.push(args);},clearPreview(){clears.push('personal');}},WeatherJourney:{clear(){clears.push('journey');},async run(){runs.push([get('journey-from-lat').value,get('journey-to-lat').value]);}},WeatherRivers:{search:p=>runs.push(p)},L:{latLngBounds:p=>p,circleMarker(){const layer={addTo(){layers.add(layer);return layer;},bindTooltip(){return layer;}};return layer;}},URL:{createObjectURL:b=>{exported=b;return 'blob:match';},revokeObjectURL(){}},setTimeout:f=>{now+=2100;f();}};
  const fetcher=async(url,options)=>{calls.push({url,options});const query=JSON.parse(options.body).address,r=structuredClone(raw);r.result.input.address.address=query;if(hold){hold=false;await new Promise(res=>release=res);}if(broken)throw Error('offline');return {ok:true,json:async()=>({...geocodeResult(r,query),checked_at:'2026-10-29T06:00:00Z'})};};
  // Layout uses the same controller as production; inject transport/clock only.
  const mounted=mount?mountWorkspaceExplorer({document,window,fetcher,clock:()=>now}):null;
  return {document,get,window,mounted,originalMap,calls,previews,runs,clears,layers,center:()=>center,exported:()=>exported,hold:()=>hold=true,release:()=>release(),break:()=>broken=true};
}
test('entry forms move above the persistent map; result categories stay closed and retain controls',()=>{
  const s=setup();for(const id of ['address-input','journey-from-query','journey-to-query','river-place-query','event-search-form'])assert.ok(s.get('map-entry').contains(s.get(id)),id);
  assert.equal(s.get('map'),s.originalMap);assert.equal(s.document.querySelectorAll('#map').length,1);
  assert.equal(s.get('place-content').contains(s.get('address-input')),false);
  assert.ok(s.get('place-content').querySelectorAll('details[data-result-group]').length>=5);
  assert.equal(s.document.querySelectorAll('details[data-result-group][open]').length,0);
  assert.ok(s.get('place-content').contains(s.get('notify-enable')));
  assert.equal(s.get('journey-submit').closest('details'),null);
  for(const form of s.document.querySelectorAll('form'))assert.equal(form.parentElement.closest('form'),null,form.id);
  const ids=[...s.document.querySelectorAll('[id]')].map(n=>n.id);assert.equal(ids.length,new Set(ids).size);
  for(const match of html.matchAll(/id="([^"]+)"/g))assert.ok(s.get(match[1]),'preserve '+match[1]);
  const group=s.get('place-content').querySelector('details');s.window.WeatherExplorer.placeChanged({id:'a'});group.open=true;s.window.WeatherExplorer.placeChanged({id:'a'});assert.equal(group.open,true);s.window.WeatherExplorer.placeChanged({id:'b'});assert.equal(group.open,false);
});
test('coordinate selection previews immediately without an address lookup; clearing removes the selection',async()=>{
  const s=setup();s.window.WeatherLocations.setWorkspace('personal');s.get('address-input').value='38.90, -77.04';await s.mounted.inputs.resolve('personal');
  assert.equal(s.calls.length,0);assert.equal(s.previews.length,1);assert.equal(s.get('place-lat').value,'38.9');assert.equal(s.layers.size,1);
  s.get('address-clear').onclick();assert.equal(s.layers.size,0);assert.equal(s.get('address-input').value,'');assert.ok(s.clears.includes('personal'));
});
test('address submission previews a matched point with attribution; typing performs no lookup',async()=>{
  const s=setup();s.get('address-input').value=raw.result.input.address.address;s.get('address-input').oninput();assert.equal(s.calls.length,0);
  await s.mounted.inputs.resolve('personal');assert.equal(s.calls.length,1);assert.equal(s.calls[0].options.method,'POST');assert.equal(s.previews.length,1);assert.match(s.get('address-status').textContent,/approximate Census/);
  s.get('address-export').onclick();assert.equal(JSON.parse(await s.exported().text()).raw.result.addressMatches.length,1);
});
test('map clicks fill coordinates and a late address result cannot replace the point',async()=>{
  const s=setup();s.get('address-input').value=raw.result.input.address.address;s.hold();const request=s.mounted.inputs.resolve('personal');await tick();
  s.window.WeatherLocations.mapPoint('personal',40,-100);s.release();await request;
  assert.equal(s.get('address-input').value,'40.0000, -100.0000');assert.equal(s.previews.length,1);assert.equal(s.previews[0][1],40);
});
test('two journey map clicks fill endpoints and run automatically; switching tabs removes point markers',()=>{
  const s=setup();s.window.WeatherLocations.setWorkspace('journey');s.window.WeatherLocations.mapPoint('journey',38,-77);assert.equal(s.runs.length,0);
  s.window.WeatherLocations.mapPoint('journey',39,-76);assert.deepEqual(s.runs,[['38','39']]);assert.equal(s.layers.size,2);
  s.window.WeatherLocations.setWorkspace('rivers');assert.equal(s.layers.size,0);
  s.get('journey-clear-points').onclick();assert.equal(s.get('journey-from-query').value,'');assert.equal(s.get('journey-to-lat').value,'');
});
test('two submitted addresses resolve before journey calculation; typing clears old results',async()=>{
  const s=setup();s.get('journey-from-query').value='4600 Silver Hill Rd, Suitland MD';s.get('journey-to-query').value='1600 Pennsylvania Ave, Washington DC';
  await s.mounted.inputs.compare();assert.equal(s.calls.length,2);assert.equal(s.runs.length,1);assert.equal(s.get('journey-submit').disabled,false);
  s.get('journey-to-query').oninput();assert.equal(s.get('journey-to-lat').value,'');assert.ok(s.clears.includes('journey'));
});
test('editing a route while geocoding prevents calculation with mixed endpoints',async()=>{
  const s=setup();s.get('journey-from-query').value='4600 Silver Hill Rd, Suitland MD';s.get('journey-to-query').value='39, -76';s.hold();const pending=s.mounted.inputs.compare();await tick();
  s.get('journey-to-query').value='40, -75';s.get('journey-to-query').oninput();s.release();await pending;assert.equal(s.runs.length,0);
});
test('failed lookup and static address search are explicit, but coordinates remain available',async()=>{
  const s=setup('direct');s.get('address-input').value='123 Main St, Washington DC';await s.mounted.inputs.resolve('personal');assert.equal(s.calls.length,0);assert.match(s.get('address-status').textContent,/static edition/);
  s.get('address-input').value='40,-100';await s.mounted.inputs.resolve('personal');assert.equal(s.previews.length,1);
  const hosted=setup();hosted.break();hosted.get('address-input').value='123 Main St, Washington DC';await hosted.mounted.inputs.resolve('personal');assert.match(hosted.get('address-status').textContent,/offline/);assert.equal(hosted.previews.length,0);
});
test('coordinate parsing validates ranges and does not send numeric errors as addresses',async()=>{
  assert.deepEqual(coordinateQuery(' +38.90, -77.04 '),{lat:38.9,lon:-77.04,address:'38.9000, -77.0400',kind:'coordinates'});
  for(const value of ['91,0','0,-181','12,,34'])assert.throws(()=>coordinateQuery(value));
  assert.equal(coordinateQuery('4600 Silver Hill Rd, Suitland MD'),null);
  assert.equal((await locationMatches('0,0',{mode:'direct',fetcher:()=>assert.fail('must not fetch')}))[0].lat,0);
});

test('browser module startup mounts the layout without injected test-only variables',async()=>{
  const s=setup('hosted',false);globalThis.window=s.window;globalThis.document=s.document;
  try{await import('../public/workspace-explorer.mjs?startup');assert.ok(s.get('map-entry').contains(s.get('address-input')));assert.ok(s.window.WeatherLocations);}finally{delete globalThis.window;delete globalThis.document;}
});
