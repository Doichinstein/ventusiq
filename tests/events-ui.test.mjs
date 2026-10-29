// Interaction doubles verify behavior without claiming rendered browser QA.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {mountEvents} from '../public/events.js';
const id='a'.repeat(64),other='b'.repeat(64),at='2026-10-28T20:00:00Z';
class Element{constructor(tag='div'){this.tagName=tag;this.children=[];this.value='';this.hidden=false;this.disabled=false;this.text='';this.attrs={};this.classList={toggle(){}};}set textContent(v){this.text=String(v??'');this.children=[];}get textContent(){return this.text+this.children.map(c=>c.textContent).join('');}append(...children){this.children.push(...children);}replaceChildren(...children){this.text='';this.children=children;}setAttribute(k,v){this.attrs[k]=v;}click(){this.clicked=true;}}
function makeStory(key=id){return {id:key,as_of:at,last_collection:at,missing_references:[{id:other,cap_id:'old'}],transitions:[{id:key,at,revision:'r',present:1,origin:'active-feed',issued_at:at,first_collected:at,feature:{type:'Feature',id:'https://api.weather.gov/alerts/'+key,geometry:null,properties:{id:key,event:'<script>Flood</script>',areaDesc:'Test County',messageType:'Alert',severity:'Severe',sent:at,expires:'2026-10-29T00:00:00Z',description:'Official description',instruction:'Official guidance'}}}]};}
function setup({mode='hosted',hash=''}={}){
  const nodes=Object.fromEntries([...readFileSync(new URL('../public/index.html',import.meta.url),'utf8').matchAll(/id="([^"]+)"/g)].map(m=>[m[1],new Element()])),requests=[],held=new Map(),waiting=new Set(),timers=[];let copied='',exported=null,broken=false;
  const location=new URL('https://example.test/'+hash),window={WEATHER_CONFIG:{mode},location,history:{replaceState(_,__,url){location.href=new URL(url,location).href;}},WeatherPersonal:{show(){window.WeatherEvents?.hide();}},navigator:{clipboard:{writeText:async text=>{copied=text;}}},URL:{createObjectURL(blob){exported=blob;return 'blob:test';},revokeObjectURL(){}},setTimeout(){},setInterval:fn=>timers.push(fn)};
  const fetcher=async url=>{requests.push(url);const parsed=new URL(url,location),key=parsed.pathname.split('/').at(-1);if(waiting.has(key))await new Promise(r=>held.set(key,r));if(broken)return {ok:false,json:async()=>({error:'Archive unavailable'})};return {ok:true,json:async()=>parsed.pathname==='/api/events'?{messages:[{id,name:'Flood Warning',area:'Test County',message_type:'Alert',first_seen:at,last_seen:at,present:1}],next_cursor:null,last_collection:at}:{...makeStory(key),as_of:parsed.searchParams.get('at')||at}};};
  const document={activeElement:null,getElementById:key=>nodes[key],createElement:tag=>new Element(tag)};
  for(const node of Object.values(nodes))node.focus=()=>{document.activeElement=node;};
  const mounted=mountEvents({document,window,fetcher});
  return {document,nodes,window,mounted,requests,timers,copied:()=>copied,exported:()=>exported,hold:key=>waiting.add(key),release:key=>{waiting.delete(key);held.get(key)();},break:()=>{broken=true;}};
}
test('archive renders official text safely, shows collection gaps and preserves source links',async()=>{
  const s=setup();await s.mounted.loadList();await s.mounted.openStory(id);assert.equal(s.nodes['event-detail'].hidden,false);assert.equal(s.nodes['event-title'].textContent,'<script>Flood</script>');assert.equal(s.nodes['event-title'].children.length,0);assert.match(s.nodes['event-coverage'].textContent,/not been collected/);assert.match(s.nodes['event-timeline'].textContent,/Alert collected/);assert.match(s.window.location.hash,/event=/);
});
test('historical links include the cutoff and export only that response',async()=>{
  const s=setup(),cutoff='2026-10-28T19:00:00.000Z';await s.mounted.openStory(id,cutoff);assert.equal(s.nodes['event-resolve'].disabled,true);await s.nodes['event-share'].onclick();assert.match(s.copied(),/at=2026/);s.nodes['event-export'].onclick();const exported=JSON.parse(await s.exported().text());assert.equal(exported.as_of,cutoff);assert.equal(exported.id,id);
});
test('late responses cannot replace a newer selected event',async()=>{
  const s=setup();s.hold(id);const old=s.mounted.openStory(id);await s.mounted.openStory(other);s.release(id);await old;assert.equal(s.mounted.getStory().id,other);
});
test('an unavailable historical view clears the prior story rather than displaying newer data',async()=>{
  const s=setup();await s.mounted.openStory(id);s.break();await s.mounted.openStory(id,'2020-01-01T00:00:00Z');assert.equal(s.mounted.getStory(),null);assert.equal(s.nodes['event-detail'].hidden,true);assert.match(s.nodes['event-status'].textContent,/Earlier views cannot use messages/);
});
test('reading a story stays stable across refresh ticks and leaving the workspace clears its fragment',async()=>{
  const s=setup();await s.mounted.openStory(id);const count=s.requests.length;s.timers[0]();assert.equal(s.requests.length,count);s.window.WeatherEvents.hide();assert.equal(s.window.location.hash,'');assert.equal(s.nodes['event-workspace'].hidden,true);
});
test('editions without a persistent hosted archive do not expose a broken archive control',()=>{
  const s=setup({mode:'direct'});assert.equal(s.mounted,null);assert.equal(s.nodes['nav-events'].hidden,true);
});

test('entering this workspace suspends the main smoke animation',async()=>{const s=setup(),visibility=[];s.window.WeatherSmokeMap={setVisible:v=>visibility.push(v)};s.nodes['nav-events'].onclick();assert.deepEqual(visibility,[false]);});


test('keyboard selection reaches the timeline and replay preserves its cutoff',async()=>{
  const s=setup();await s.mounted.loadList();await s.nodes['event-list'].children[0].onclick();
  assert.equal(s.document.activeElement,s.nodes['event-title']);
  assert.equal(s.nodes['event-title'].attrs.tabindex,'-1');
  const replay=s.nodes['event-timeline'].children[0].children.at(-1);await replay.onclick();
  assert.equal(s.document.activeElement,s.nodes['event-title']);assert.equal(new URLSearchParams(s.window.location.hash.slice(1)).get('at'),at);
});

test('a delayed selection does not steal focus after the reader moves elsewhere',async()=>{
  const s=setup();s.hold(id);const pending=s.mounted.openStory(id,null,{focus:true});
  assert.equal(s.document.activeElement,s.nodes['event-status']);s.nodes['event-search'].focus();s.release(id);await pending;
  assert.equal(s.document.activeElement,s.nodes['event-search']);assert.equal(s.nodes['event-detail'].hidden,false);
});

test('leaving during a selection invalidates its response and focus handoff',async()=>{
  const s=setup();s.hold(id);const pending=s.mounted.openStory(id,null,{focus:true});s.window.WeatherEvents.hide();s.nodes['nav-map'].focus();s.release(id);await pending;
  assert.equal(s.mounted.getStory(),null);assert.equal(s.nodes['event-detail'].hidden,true);assert.equal(s.document.activeElement,s.nodes['nav-map']);assert.equal(s.window.location.hash,'');
});

test('failed selections retain the focused error; passive loads do not move focus',async()=>{
  const s=setup();s.nodes['event-search'].focus();await s.mounted.openStory(id);assert.equal(s.document.activeElement,s.nodes['event-search']);
  s.break();await s.mounted.openStory(other,null,{focus:true});assert.equal(s.document.activeElement,s.nodes['event-status']);assert.match(s.nodes['event-status'].textContent,/Archive unavailable/);
});
