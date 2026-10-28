// Interaction doubles verify state transitions, not rendered browser layout.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {mountObservations} from '../public/observations.js';
class Element{constructor(tag='div'){this.tag=tag;this.children=[];this.text='';this.attrs={};this.hidden=false;}set textContent(v){this.text=String(v);this.children=[];}get textContent(){return this.text+this.children.map(c=>c.textContent).join('');}append(...n){this.children.push(...n);}replaceChildren(...n){this.text='';this.children=n;}setAttribute(k,v){this.attrs[k]=v;}click(){this.onclick?.();}}
const now=Date.parse('2026-10-28T20:00:00Z'),stamp=h=>new Date(now+h*3600000).toISOString();
const station=id=>({id,name:'<script>'+id+'</script>',lat:38.9,lon:-77,distance_km:2,time_zone:'America/New_York'});
const observation=(h,id)=>({id:id+h,properties:{timestamp:stamp(h),temperature:{value:20,unitCode:'wmoUnit:degC',qualityControl:'V'},windSpeed:{value:0,unitCode:'wmoUnit:km_h-1',qualityControl:'V'},windGust:{value:null}}});
function setup(mode='hosted'){
  const nodes=Object.fromEntries([...readFileSync(new URL('../public/index.html',import.meta.url),'utf8').matchAll(/id="([^"]+)"/g)].map(m=>[m[1],new Element()]));let broken=false,exported,time=now;const waits=new Map(),holds=new Set(),timers=[];
  const window={WEATHER_CONFIG:{mode},WeatherPersonal:{current:()=>null},setInterval:fn=>timers.push(fn),setTimeout:fn=>fn(),URL:{createObjectURL(blob){exported=blob;return 'blob:result';},revokeObjectURL(){}}};
  const fetcher=async path=>{if(holds.has(path))await new Promise(r=>waits.set(path,r));if(broken)throw Error('Outage');const url=new URL('https://example.test'+path),id=url.searchParams.get('id');return {ok:true,json:async()=>url.pathname.endsWith('/near')?{stations:[station('KAAA'),station('KBBB')],coverage:'Stations within 50 km'}:url.pathname==='/api/verification'?{station:station(url.searchParams.get('station')),sample_count:0,eligible_hours:168,days:0,skipped:{no_archive:168,forecast_unavailable:0,observation_unavailable:0,quality_excluded:0},method:'no calibrated confidence probability',generated_at:stamp(0),observation_checked_at:stamp(0),pairs:[]}:{checked_at:stamp(0),features:[observation(-3,id),observation(0,id)],truncated:true}};};
  const mounted=mountObservations({document:{getElementById:id=>nodes[id],createElement:tag=>new Element(tag),createElementNS:(_,tag)=>new Element(tag)},window,fetcher,clock:()=>time});
  return {nodes,mounted,window,timers,advance:ms=>time+=ms,break:(value=true)=>{broken=value;},hold:path=>holds.add(path),release:path=>{holds.delete(path);waits.get(path)();},exported:()=>exported};
}
test('station readings display source text safely, partial coverage, missing gusts, and chart gaps',async()=>{
  const s=setup();await s.mounted.updatePlace({lat:38.9,lon:-77});assert.match(s.nodes['observation-status'].textContent,/<script>KAAA/);assert.equal(s.nodes['observation-status'].children.length,0);assert.match(s.nodes['observation-current'].textContent,/68.0°F/);assert.match(s.nodes['observation-current'].textContent,/gust Unavailable/);assert.match(s.nodes['observation-current'].textContent,/history is partial/);const svg=s.nodes['observation-chart'].children[0];assert.equal(svg.attrs.role,'img');const line=svg.children.find(n=>n.tag==='path');assert.equal((line.attrs.d.match(/M/g)||[]).length,2);assert.equal(s.nodes['observation-table'].children.length,2);
});
test('late previous station response cannot overwrite selected station',async()=>{
  const s=setup();s.hold('/api/observations/station?id=KAAA');const first=s.mounted.updatePlace({lat:38.9,lon:-77});await new Promise(r=>setTimeout(r,0));await s.mounted.select('KBBB');s.release('/api/observations/station?id=KAAA');await first;assert.match(s.nodes['observation-status'].textContent,/KBBB/);assert.doesNotMatch(s.nodes['observation-status'].textContent,/KAAA/);
});
test('comparison explicitly explains a warming archive and exports the report currently displayed',async()=>{
  const s=setup();await s.mounted.updatePlace({lat:38.9,lon:-77});await s.mounted.verify();assert.match(s.nodes['verification-results'].textContent,/No eligible/);assert.match(s.nodes['verification-results'].textContent,/6–24 hours/);assert.equal(s.nodes['verification-export'].disabled,false);s.nodes['verification-export'].onclick();assert.equal(JSON.parse(await s.exported().text()).eligible_hours,168);await s.mounted.select('KBBB');assert.equal(s.nodes['verification-export'].disabled,true);
});
test('late comparison for a previous station cannot replace the new selection',async()=>{
  const s=setup();await s.mounted.updatePlace({lat:38.9,lon:-77});const path='/api/verification?lat=38.9&lon=-77&station=KAAA';s.hold(path);const first=s.mounted.verify();await s.mounted.select('KBBB');s.release(path);await first;assert.equal(s.nodes['verification-export'].disabled,true);assert.doesNotMatch(s.nodes['verification-results'].textContent,/No eligible/);
});
test('refresh outage retains last readings and labels delayed collection and old observations separately',async()=>{
  const s=setup();await s.mounted.updatePlace({lat:38.9,lon:-77});s.break();s.advance(3*3600000);await s.nodes['observation-refresh'].onclick();assert.match(s.nodes['observation-status'].textContent,/Updates delayed/);assert.match(s.nodes['observation-current'].textContent,/Latest available reading — delayed/);assert.match(s.nodes['observation-current'].textContent,/68.0°F/);
});
test('unsupported editions hide the hosted-only observation card',()=>{assert.equal(setup('direct').nodes['observation-card'].hidden,true);assert.equal(setup('daemon').nodes['observation-card'].hidden,true);});

test('failed station discovery offers an in-place retry and recovers without switching places',async()=>{
  const s=setup();s.break();await s.mounted.updatePlace({lat:38.9,lon:-77});assert.match(s.nodes['observation-status'].textContent,/discovery unavailable/);assert.equal(s.nodes['observation-controls'].hidden,false);s.break(false);await s.nodes['observation-refresh'].onclick();assert.match(s.nodes['observation-current'].textContent,/68.0\u00b0F/);assert.equal(s.nodes['verification-run'].disabled,false);
});
