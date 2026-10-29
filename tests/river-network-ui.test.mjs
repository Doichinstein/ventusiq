// DOM doubles verify behavior, not rendered layout.
import {test} from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {mountRiverNetwork} from '../public/river-network.js';import {RIVER_NETWORK_METHOD} from '../public/river-network-core.mjs';
class Element{
  constructor(tag){this.tag=tag;this.children=[];this.text='';this.disabled=false;}
  set textContent(v){this.text=String(v);this.children=[];}get textContent(){return this.text+this.children.map(c=>c.textContent).join('');}
  append(...nodes){this.children.push(...nodes);}replaceChildren(...nodes){this.children=nodes;this.text='';}click(){this.onclick?.();}
}
function setup(){
  const nodes=Object.fromEntries([...readFileSync(new URL('../public/index.html',import.meta.url),'utf8').matchAll(/id="(river-network-[^"]+)"/g)].map(m=>[m[1],new Element('div')])),timers=[],calls=[],opened=[],blobs=[],pending=new Map();let now=Date.parse('2026-10-29T03:00:00Z'),broken=false,held=false,wrong=false;
  const product=id=>({id,method:RIVER_NETWORK_METHOD,checked_at:new Date(now).toISOString(),raw:{startingPoint:{LID:id,Name:id},upstream:[{LID:'PORM2',Name:'<script>River</script>'}],downstream:[]}});
  const window={WEATHER_CONFIG:{mode:'hosted'},WeatherRivers:{openGauge:id=>opened.push(id)},setInterval:fn=>timers.push(fn),setTimeout:()=>{},URL:{createObjectURL:b=>{blobs.push(b);return 'blob:test';},revokeObjectURL(){}}};
  const api=mountRiverNetwork({document:{getElementById:id=>nodes[id],createElement:tag=>new Element(tag)},window,clock:()=>now,fetcher:async url=>{calls.push(url);const id=new URL(url,'https://example.test').searchParams.get('id');if(held)await new Promise(r=>pending.set(id,r));if(broken)throw Error('Network outage');return {ok:true,json:async()=>product(wrong?'OTHER1':id)};}});
  return {nodes,api,timers,calls,opened,blobs,pending,hold:()=>held=true,break:()=>broken=true,wrong:()=>wrong=true,advance:ms=>now+=ms};
}
const buttons=node=>[...(node.tag==='button'?[node]:[]),...node.children.flatMap(buttons)];
test('connections load only on request, render direction and empty-coverage text, and open the selected related gauge',async()=>{
  const s=setup();s.api.updateGauge({metadata:{lid:'BRKM2'}});assert.equal(s.calls.length,0);await s.api.run();assert.match(s.nodes['river-network-results'].textContent,/Upstream gauges \(1\)/);assert.match(s.nodes['river-network-results'].textContent,/Coverage may be incomplete/);assert.match(s.nodes['river-network-results'].textContent,/<script>River<\/script>/);buttons(s.nodes['river-network-results'])[0].click();assert.deepEqual(s.opened,['PORM2']);assert.match(s.nodes['river-network-status'].textContent,/Source issue time is not supplied/);
});
test('switching gauges invalidates an in-flight connection response and clears export evidence',async()=>{
  const s=setup();s.hold();s.api.updateGauge({metadata:{lid:'BRKM2'}});const old=s.api.run();s.api.updateGauge({metadata:{lid:'EDFM2'}});s.pending.get('BRKM2')();await old;assert.equal(s.nodes['river-network-results'].textContent,'');assert.equal(s.nodes['river-network-export'].disabled,true);assert.match(s.nodes['river-network-status'].textContent,/EDFM2/);assert.equal(s.nodes['river-network-run'].disabled,false);
});
test('failed refresh preserves delayed evidence and export evaluates freshness at export time',async()=>{
  const s=setup();s.api.updateGauge({metadata:{lid:'BRKM2'}});await s.api.run();s.advance(1350001);s.timers[0]();assert.match(s.nodes['river-network-status'].textContent,/Updates delayed/);s.break();await s.api.run();assert.match(s.nodes['river-network-status'].textContent,/Network outage/);assert.match(s.nodes['river-network-results'].textContent,/PORM2/);s.nodes['river-network-export'].click();const exported=JSON.parse(await s.blobs[0].text());assert.equal(exported.view.delayed,true);assert.equal(exported.raw.upstream[0].LID,'PORM2');assert.match(exported.limitations,/No travel times/);
});
test('a wrong-gauge response never appears under the selected gauge',async()=>{
  const s=setup();s.wrong();s.api.updateGauge({metadata:{lid:'BRKM2'}});await s.api.run();assert.match(s.nodes['river-network-status'].textContent,/does not match/);assert.equal(s.nodes['river-network-results'].textContent,'');assert.equal(s.nodes['river-network-export'].disabled,true);
});
