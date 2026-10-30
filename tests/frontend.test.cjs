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
  append(...items){for(const item of items){if(item.tagName==='FRAGMENT')this.append(...item.children);else this.insertBefore(item,null);}}
  replaceChildren(...items){this.text='';for(const child of [...this.children])this.removeChild(child);this.append(...items);}
  contains(node){return this===node||this.children.some(child=>child.contains(node));}
  removeChild(child){if(child.contains(this.ownerDocument?.activeElement))this.ownerDocument.activeElement=this.ownerDocument.body;this.children.splice(this.children.indexOf(child),1);child.parentNode=null;return child;}
  insertBefore(child,reference){if(child.parentNode)child.parentNode.removeChild(child);const index=reference===null?this.children.length:this.children.indexOf(reference);this.children.splice(index,0,child);child.parentNode=this;return child;}
  setAttribute(k,v){this.attrs[k]=v;}
  addEventListener(k,v){this.listeners[k]=v;}
  querySelectorAll(tag){return this.children.filter(c=>c.tagName===tag.toUpperCase());}
  querySelector(tag){return this.querySelectorAll(tag)[0];}
  closest(){return this;}
  focus(){this.focusCount=(this.focusCount||0)+1;if(this.ownerDocument)this.ownerDocument.activeElement=this;}
  showModal(){this.open=true;}
  close(){this.open=false;}
}
const fixture=(id,event='Flood Warning',severity='Severe',area='Test County')=>({type:'Feature',id:'https://api.weather.gov/alerts/'+id,geometry:{type:'Polygon',coordinates:[[[-100,40],[-99,40],[-99,41],[-100,40]]]},properties:{id,status:'Actual',event,severity,areaDesc:area,sent:new Date().toISOString(),expires:'2099-01-01T00:00:00Z',description:'Official <script>text</script>',instruction:'Seek higher ground',affectedZones:[]}});
const payload=(features)=>({type:'FeatureCollection',features,updated:new Date().toISOString(),collected_at:new Date().toISOString()});
async function setup(mode='direct',options={}) {
  const ids=[...fs.readFileSync(path.join(__dirname,'../public/index.html'),'utf8').matchAll(/id="([^"]+)"/g)].map(x=>x[1]);
  const els=Object.fromEntries(ids.map(id=>[id,new Element()]));
  els.severity.value='all';els.region.value='conus';
  for(const c of ['all','Warning','Watch','Advisory']) {const b=new Element('button');b.dataset.category=c;els.categories.append(b);}
  const map={listeners:{},on(type,fn){this.listeners[type]=fn;return this;},fitBounds(){return this;},invalidateSize(){}};
  const L={map:()=>map,tileLayer:()=>({addTo(){return this;},on(){return this;}}),control:{zoom:()=>({addTo(){}})},geoJSON(data,options){
    const own=Array.isArray(data)?data:data?.type==='Feature'?[data]:[],children=new Set();
    for(const f of own)options?.onEachFeature?.(f,{bindTooltip(){},on(){}});
    return {get data(){return [...own,...[...children].flatMap(c=>c.data)];},addTo(parent){parent.addLayer?.(this);return this;},addLayer(layer){children.add(layer);return this;},removeLayer(layer){children.delete(layer);},setStyle(){},bringToFront(){},getBounds(){return {isValid:()=>true};}};
  }};
  let current=payload([fixture('one'),fixture('two','Wind Advisory','Moderate','Other County')]);
  let error=false;
  const stored=[],requests=[],intervals=[];
  let releaseAuxiliary;
  const auxiliaryGate=new Promise(resolve=>releaseAuxiliary=resolve);
  let releaseAlerts;
  const alertsGate=new Promise(resolve=>releaseAlerts=resolve);
  const fetch=async(url)=>{
    requests.push(url);
    if(options.holdAlerts&&url==='/api/alerts?view=map')await alertsGate;
    if(options.holdAuxiliary&&['/api/health','/api/history','/api/changes'].includes(url))await auxiliaryGate;
    if(error)throw new Error('Simulated outage');
    if(url.includes('/zones/'))return {ok:true,json:async()=>({geometry:fixture('zone').geometry})};
    let result=current;
    if(url==='/api/health')result={last_success:Date.now()/1000,last_error:null};
    if(url==='/api/history')result={snapshots:stored.map(s=>({at:s.collected_at}))};
    if(url==='/api/changes')result={changes:[]};
    if(url.startsWith('/api/alerts?at='))result=stored.find(s=>s.collected_at===decodeURIComponent(url.split('=')[1]));
    return {ok:true,json:async()=>result};
  };
  const documentListeners={};
  const doc={getElementById:id=>els[id],createElement:t=>new Element(t),createTextNode:t=>{const e=new Element('text');e.textContent=t;return e;},createDocumentFragment:()=>new Element('fragment'),addEventListener(type,fn){documentListeners[type]=fn;},activeElement:new Element('body')};
  doc.body=doc.activeElement;
  for(const element of [...Object.values(els),doc.body])element.ownerDocument=doc;
  doc.createElement=t=>Object.assign(new Element(t),{ownerDocument:doc});
  els.detail.append(els['detail-close'],els['detail-body']);
  const ctx=vm.createContext({document:doc,window:{WEATHER_CONFIG:{mode},innerWidth:1400,addEventListener(){}},L,fetch,URL,AbortSignal,Date,performance:{now:()=>0},console,setInterval(fn,ms){intervals.push({fn,ms});},setTimeout(){return 1;}});
  const run=code=>vm.runInContext(code,ctx);
  if(options.cache)ctx.window.WeatherMapCache={read:async key=>key==='alerts'?options.cache:null,write(){}};
  run(fs.readFileSync(path.join(__dirname,'../public/zone-loader.js'),'utf8'));
  run(fs.readFileSync(path.join(__dirname,'../public/map-geometry.js'),'utf8'));
  run(fs.readFileSync(path.join(__dirname,'../public/alert-renderer.js'),'utf8'));
  run(fs.readFileSync(path.join(__dirname,'../public/app.js'),'utf8'));
  const settle=async()=>{for(let i=0;i<10;i++)await new Promise(r=>setImmediate(r));};
  await settle();
  return {els,run,settle,stored,doc,requests,intervals,releaseAuxiliary,releaseAlerts,visibility:()=>documentListeners.visibilitychange(),key:event=>documentListeners.keydown(event),setData(data){current=data;},fail(){error=true;}};
}

test('map background picks the active workspace point while overlay and one-shot clicks remain separate',async()=>{
  const s=await setup();s.run("window.picks=[];window.WeatherLocations={mapPoint:(...args)=>window.picks.push(args)};workspaceMode='personal';map.listeners.click({sourceTarget:map,latlng:{lat:40,lng:260}})");
  assert.equal(s.run('JSON.stringify(window.picks)'),JSON.stringify([['personal',40,-100]]));
  s.run("map.listeners.click({sourceTarget:{},latlng:{lat:41,lng:-101}});pendingMapPick=()=>{};map.listeners.click({sourceTarget:map,latlng:{lat:42,lng:-102}})");
  assert.equal(s.run('window.picks.length'),1);
});

test('first network check labels fresh cached alerts as checking, then confirms the live collection',async()=>{
  const cache=payload([fixture('cached')]);
  const s=await setup('hosted',{holdAlerts:true,cache});
  assert.equal(s.els.total.textContent,'1');
  assert.equal(s.els['status-label'].textContent,'Checking for updates…');
  assert.match(s.els['status-dot'].className,/loading/);
  assert.match(s.els['map-notice'].textContent,/previous visit/);
  assert.equal(s.run('lastSuccess'),cache.collected_at);
  s.releaseAlerts();await s.settle();
  assert.equal(s.els['status-label'].textContent,'Connected to NWS');
  assert.equal(s.els.total.textContent,'2');
});

test('startup checking never conceals old cache, retained provider failures, or a failed first request',async()=>{
  for(const cache of [
    {...payload([fixture('old')]),collected_at:new Date(Date.now()-180000).toISOString()},
    {...payload([fixture('stale')]),stale:true},
    {...payload([fixture('failed')]),error:'Provider unavailable'},
  ]){
    const s=await setup('hosted',{holdAlerts:true,cache});
    assert.equal(s.els['status-label'].textContent,'Updates delayed');
    assert.match(s.els['map-notice'].textContent,/last successful collection/);
    s.releaseAlerts();await s.settle();
    assert.equal(s.els['status-label'].textContent,'Connected to NWS');
  }
  const s=await setup('hosted',{holdAlerts:true,cache:payload([fixture('cached')])});
  s.fail();s.releaseAlerts();await s.settle();
  assert.equal(s.els.total.textContent,'1');
  assert.equal(s.els['status-label'].textContent,'Updates delayed');
  assert.match(s.els['map-notice'].textContent,/last successful collection/);
});

test('first visit without a cache shows checking until a real result arrives',async()=>{
  const s=await setup('hosted',{holdAlerts:true});
  assert.equal(s.els['status-label'].textContent,'Checking for updates…');
  assert.equal(s.els['status-time'].textContent,'First collection in progress');
  s.fail();s.releaseAlerts();await s.settle();
  assert.equal(s.els['status-label'].textContent,'Waiting for NWS');
  assert.equal(s.els['status-time'].textContent,'Retrying automatically');
});

test('hosted map paints alerts before slow history and status, without redrawing unchanged geometry',async()=>{
  const s=await setup('hosted',{holdAuxiliary:true});
  assert.equal(s.els.total.textContent,'2');assert.equal(s.els['mapped-count'].textContent,'2');
  assert.equal(s.requests[0],'/api/alerts?view=map');assert.equal(s.run('refreshing'),false);
  const version=s.run('geometryRevision');await s.run('nextFetch=0; refresh()');
  assert.equal(s.run('geometryRevision'),version);assert.equal(s.els.total.textContent,'2');
  s.releaseAuxiliary();await s.settle();
});

test('changed collections retain surviving alert cards and dispatch their latest source body',async()=>{
  const s=await setup('hosted'),first=s.els.feed.children[0],second=s.els.feed.children[1];
  const revised=fixture('one');revised.properties.description='Revised official instructions';
  s.setData(payload([fixture('new','Tornado Warning','Extreme'),revised,fixture('two','Wind Advisory','Moderate','Other County')]));
  await s.run('nextFetch=0; refresh()');
  assert.equal(s.els.feed.children[1],first);
  assert.equal(s.els.feed.children[2],second);
  first.onclick();assert.match(s.els['detail-body'].textContent,/Revised official instructions/);
});

test('live insertion and severity reordering preserve focused alert; expiry focuses results and filters leave search alone',async()=>{
  const s=await setup('hosted'),card=s.els.feed.children[1];card.focus();
  const promoted=fixture('two','Tornado Warning','Extreme','Other County');
  s.setData(payload([fixture('one'),promoted]));await s.run('nextFetch=0; refresh()');
  assert.equal(s.els.feed.children[0],card);assert.equal(s.doc.activeElement,card);
  assert.match(card.textContent,/Tornado Warning/);assert.equal(card.attrs['aria-label'],'Tornado Warning: Other County');
  s.setData(payload([fixture('one')]));await s.run('nextFetch=0; refresh()');
  assert.equal(s.doc.activeElement,s.els.feed);assert.equal(s.run('alertCards.size'),1);
  s.els.search.focus();s.els.search.value='absent';s.els.search.listeners.input();
  assert.equal(s.doc.activeElement,s.els.search);assert.equal(s.run('alertCards.size'),0);
  s.els.search.value='';s.els.search.listeners.input();s.els.feed.children[0].focus();
  s.setData(payload([]));await s.run('nextFetch=0; refresh()');
  assert.equal(s.doc.activeElement,s.els.feed);assert.match(s.els.feed.textContent,/No active alerts/);
});

test('closing alert details returns keyboard focus to its retained card, but external controls keep focus',async()=>{
  const s=await setup('hosted'),card=s.els.feed.children[0];
  card.onclick();assert.equal(s.doc.activeElement,s.els['detail-close']);
  s.els['detail-close'].onclick();assert.ok(s.doc.activeElement===card);
  card.onclick();s.els.region.focus();s.els.region.onchange();
  assert.equal(s.doc.activeElement,s.els.region);
});

test('map and selected alert use the same date-line frame while stored source stays geographic',async()=>{
  const s=await setup('hosted');
  const alaska=fixture('dateline');
  alaska.geometry.coordinates=[[[179,51],[-179,51],[-179,52],[179,51]]];
  s.setData(payload([alaska]));await s.run('nextFetch=0; refresh()');
  assert.equal(s.run('alertLayer.data[0].geometry.coordinates[0][0][0]'),-181);
  assert.equal(s.run('features[0].geometry.coordinates[0][0][0]'),179);
  s.els.feed.children[0].onclick();
  assert.equal(s.run('featureGeometry(features[0]).coordinates[0][0][0]'),-181);
  assert.equal(s.run('regions.guam.bounds[0][1]'),-216);
});

test('unchanged zone membership reuses combined geometry; new and removed boundaries replace it',async()=>{
  const s=await setup('hosted');
  s.run("features[0].geometry=null;features[0].properties.affectedZones=['a','b'];zoneCache.set('a',{type:'Polygon',coordinates:[]});combineZones(features[0]);globalThis.firstGeometry=geometry.get(features[0].id)");
  s.run('combineZones(features[0])');assert.equal(s.run('geometry.get(features[0].id)===firstGeometry'),true);
  s.run("zoneCache.set('b',{type:'Polygon',coordinates:[]});combineZones(features[0])");
  assert.equal(s.run('geometry.get(features[0].id).geometries.length'),2);
  assert.equal(s.run('geometry.get(features[0].id)===firstGeometry'),false);
  s.run("zoneCache.clear();combineZones(features[0])");assert.equal(s.run('geometry.has(features[0].id)'),false);
});

test('automatic checks pause in hidden tabs and during replay, resume on visibility, and can be switched off',async()=>{
  const s=await setup('hosted');const poll=s.intervals.find(i=>i.ms===1000).fn;
  s.run('nextFetch=0');s.doc.hidden=true;const count=s.requests.length;poll();await s.settle();assert.equal(s.requests.length,count);
  s.doc.hidden=false;s.visibility();await s.settle();assert.ok(s.requests.length>count);
  s.els['auto-refresh'].checked=false;s.els['auto-refresh'].onchange();s.run('nextFetch=0');const stopped=s.requests.length;poll();await s.settle();assert.equal(s.requests.length,stopped);
  s.run("autoRefresh=true;replayAt='2026-10-28T00:00:00Z'");poll();await s.settle();assert.equal(s.requests.length,stopped);
});

test('slash search shortcut only acts in the visible map and preserves editing, dialogs and browser shortcuts',async()=>{
  const s=await setup();let prevented=0;
  const key=extra=>s.key({key:'/',preventDefault(){prevented++;},...extra});
  key();assert.equal(s.els.search.focusCount,1);assert.equal(prevented,1);
  s.els['map-workspace'].hidden=true;key();s.els['map-workspace'].hidden=false;
  s.els.about.open=true;key();s.els.about.open=false;
  for(const tag of ['input','textarea','select']){s.doc.activeElement=new Element(tag);key();}
  s.doc.activeElement=new Element('div');s.doc.activeElement.isContentEditable=true;key();s.doc.activeElement=new Element('body');
  for(const option of ['ctrlKey','altKey','metaKey','isComposing','defaultPrevented'])key({[option]:true});
  assert.equal(s.els.search.focusCount,1);assert.equal(prevented,1);
});

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
