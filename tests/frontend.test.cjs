// Offline behavioral tests, not a browser or visual rendering substitute.
const {test} = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');

class Element {
  constructor(tag='div') {
    this.tagName=tag.toUpperCase();this.children=[];this.value='';this.text='';this.dataset={};this.attrs={};this.listeners={};this.hidden=false;
    const classes=new Set();
    this.classList={add:x=>classes.add(x),remove:x=>classes.delete(x),contains:x=>classes.has(x),toggle:(x,yes)=>{yes= yes ?? !classes.has(x);yes?classes.add(x):classes.delete(x);}};
  }
  set textContent(x) {this.text=String(x ?? '');this.children=[];}
  get textContent(){return this.text+this.children.map(c=>c.textContent||'').join('');}
  append(...items){for(const item of items){if(item.tagName==='FRAGMENT')this.children.push(...item.children);else this.children.push(item);}}
  replaceChildren(...items){this.text='';this.children=[];this.append(...items);}
  setAttribute(k,v){this.attrs[k]=v;}
  addEventListener(k,v){this.listeners[k]=v;}
  querySelectorAll(tag){return this.children.filter(c=>c.tagName===tag.toUpperCase());}
  querySelector(tag){return this.querySelectorAll(tag)[0];}
  closest(){return this;}
  focus(){}
  showModal(){this.open=true;}
  close(){this.open=false;}
}
const fixture=(id,event='Flood Warning',severity='Severe',area='Test County')=>({type:'Feature',id:'https://api.weather.gov/alerts/'+id,geometry:{type:'Polygon',coordinates:[[[-100,40],[-99,40],[-99,41],[-100,40]]]},properties:{id,status:'Actual',event,severity,areaDesc:area,sent:new Date().toISOString(),expires:'2099-01-01T00:00:00Z',description:'Official <script>text</script>',instruction:'Seek higher ground',affectedZones:[]}});
const payload=(features)=>({type:'FeatureCollection',features,updated:new Date().toISOString(),collected_at:new Date().toISOString()});
async function setup(mode='direct') {
  const ids=[...fs.readFileSync(path.join(__dirname,'../public/index.html'),'utf8').matchAll(/id="([^"]+)"/g)].map(x=>x[1]);
  const els=Object.fromEntries(ids.map(id=>[id,new Element()]));
  els.severity.value='all';els.region.value='conus';
  for(const c of ['all','Warning','Watch','Advisory']) {const b=new Element('button');b.dataset.category=c;els.categories.append(b);}
  const map={fitBounds(){return this;},invalidateSize(){}};
  const L={map:()=>map,tileLayer:()=>({addTo(){return this;},on(){return this;}}),control:{zoom:()=>({addTo(){}})},geoJSON(data,options){return {data:data||[],addTo(){return this;},clearLayers(){this.data=[];return this;},addData(d){this.data=d; for(const f of d)options?.onEachFeature?.(f,{bindTooltip(){},on(){}});return this;},eachLayer(fn){for(const f of this.data)fn({feature:f,bringToFront(){}});},getBounds(){return {isValid:()=>true};}};}};
  let current=payload([fixture('one'),fixture('two','Wind Advisory','Moderate','Other County')]);
  let error=false;
  const stored=[];
  const fetch=async(url)=>{
    if(error)throw new Error('Simulated outage');
    if(url.includes('/zones/'))return {ok:true,json:async()=>({geometry:fixture('zone').geometry})};
    let result=current;
    if(url==='/api/health')result={last_success:Date.now()/1000,last_error:null};
    if(url==='/api/history')result={snapshots:stored.map(s=>({at:s.collected_at}))};
    if(url==='/api/changes')result={changes:[]};
    if(url.startsWith('/api/alerts?'))result=stored.find(s=>s.collected_at===decodeURIComponent(url.split('=')[1]));
    return {ok:true,json:async()=>result};
  };
  const doc={getElementById:id=>els[id],createElement:t=>new Element(t),createTextNode:t=>{const e=new Element('text');e.textContent=t;return e;},createDocumentFragment:()=>new Element('fragment'),addEventListener(){},activeElement:new Element('body')};
  const ctx=vm.createContext({document:doc,window:{WEATHER_CONFIG:{mode},innerWidth:1400,addEventListener(){}},L,fetch,URL,AbortSignal,Date,console,setInterval(){},setTimeout(){return 1;}});
  const run=code=>vm.runInContext(code,ctx);
  run(fs.readFileSync(path.join(__dirname,'../public/app.js'),'utf8'));
  const settle=async()=>{for(let i=0;i<10;i++)await new Promise(r=>setImmediate(r));};
  await settle();
  return {els,run,settle,stored,setData(data){current=data;},fail(){error=true;}};
}

test('live data, filters, safe official text, and detail selection',async()=>{
  const {els,run}=await setup();
  assert.equal(els.total.textContent,'2');
  assert.equal(els['mapped-count'].textContent,'2');
  assert.equal(els['status-label'].textContent,'Connected to NWS');
  els.search.value='Other';els.search.listeners.input();
  assert.equal(els.feed.children.length,1);
  assert.match(els.feed.textContent,/Wind Advisory/);
  els.feed.children[0].onclick();
  assert.equal(els.detail.hidden,false);
  assert.match(els['detail-body'].textContent,/Official <script>text<\/script>/);
  assert.equal(els['detail-body'].children.some(c=>c.tagName==='SCRIPT'),false);
  els.search.value='no-such-place';els.search.listeners.input();
  assert.match(els.feed.textContent,/No alerts match/);
  els.search.value='';els.severity.value='Severe';els.severity.listeners.change();
  assert.equal(els.feed.children.length,1);
  assert.match(els.feed.textContent,/Flood Warning/);
  assert.equal(run('filtered.length'),1);
});

test('outage retains alerts and marks data delayed',async()=>{
  const {els,run,fail}=await setup();
  fail();await run('nextFetch=0; refresh()');
  assert.equal(els.total.textContent,'2');
  assert.equal(els['status-label'].textContent,'Updates delayed');
  assert.match(els['map-notice'].textContent,/last successful/);
});

test('upkeep status distinguishes processing, errors, overdue and stale health without claiming delivery',async()=>{
  const {els,run}=await setup('hosted');
  assert.equal(els['upkeep-status'].hidden,true);
  run("upkeepStatus={state:'running',completed_at:null};upkeepStatusCheckedAt=Date.now();updateHealth()");
  assert.equal(els['upkeep-status'].hidden,false);assert.match(els['upkeep-status'].textContent,/processing/);
  run("upkeepStatus={state:'partial',completed_at:Date.now()/1000};updateHealth()");
  assert.match(els['upkeep-status'].textContent,/processing error/);
  run("upkeepStatus={state:'finished',completed_at:Date.now()/1000-4501};updateHealth()");
  assert.match(els['upkeep-status'].textContent,/75 minutes/);
  run('upkeepStatusCheckedAt=Date.now()-91000;updateHealth()');
  assert.match(els['upkeep-status'].textContent,/status unavailable; last known/);
  assert.doesNotMatch(els['upkeep-status'].textContent,/delivered|all.clear/);
});

test('session replay returns to cached live state without extra upstream fetch',async()=>{
  const {els,run,setData}=await setup();
  const newData=payload([fixture('three','Tornado Warning','Extreme')]);
  newData.collected_at=new Date(Date.now()+1000).toISOString();
  setData(newData);await run('nextFetch=0; refresh()');
  assert.equal(run('snapshots.length'),2);
  await run('replay(0)');
  assert.equal(els.total.textContent,'2');
  assert.equal(els['map-mode'].textContent,'COLLECTED HISTORY');
  run('returnLive()');
  assert.equal(els.total.textContent,'1');
  assert.equal(els['map-mode'].textContent,'LIVE CONDITIONS');
  assert.match(els.feed.textContent,/Tornado Warning/);
});

test('empty feed is a successful collection, not an error',async()=>{
  const {els,run,setData}=await setup();
  setData(payload([]));await run('nextFetch=0; refresh()');
  assert.equal(els.total.textContent,'0');
  assert.equal(els['status-label'].textContent,'Connected to NWS');
  assert.match(els.feed.textContent,/No active alerts/);
});

test('expired and test alerts are excluded',async()=>{
  const {els,run,setData}=await setup();
  const expired=fixture('old');expired.properties.expires='2000-01-01T00:00:00Z';
  const exercise=fixture('test');exercise.properties.status='Test';
  setData(payload([expired,exercise]));await run('nextFetch=0; refresh()');
  assert.equal(els.total.textContent,'0');
});

test('daemon API mode renders shared data and labels persistent history',async()=>{
  const {els}=await setup('daemon');
  assert.equal(els.total.textContent,'2');
  assert.equal(els['history-mode'].textContent,'24h retained history');
  assert.match(els['mode-explainer'].textContent,/shared background daemon/);
});

test('late replay response cannot overwrite a return to live',async()=>{
  const {els,run,stored}=await setup('daemon');
  stored.push(payload([fixture('historic','Winter Storm Watch')]));
  await run('nextFetch=0; refresh()');
  const pending=run('replay(0)');
  run('returnLive()');
  await pending;
  assert.equal(els['map-mode'].textContent,'LIVE CONDITIONS');
  assert.match(els.feed.textContent,/Flood Warning/);
  assert.doesNotMatch(els.feed.textContent,/Winter Storm Watch/);
});
