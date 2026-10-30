import {eventId,validEventId,timelineEntries} from './events-core.mjs';

export function mountEvents({document,window,fetcher=fetch}){

  const get=id=>document.getElementById(id),el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};

  if(window.WEATHER_CONFIG?.mode!=='hosted'){get('nav-events').hidden=true;return null;}

  const time=stamp=>stamp?new Date(stamp).toLocaleString():'Not supplied';

  let archiveLayer=null,mapLabel="";

  const map=window.WeatherMap?.instance,L=window.L;

  function clearMap(){window.WeatherMap?.setOverlayFit?.('events',null);if(archiveLayer)map.removeLayer(archiveLayer);archiveLayer=null;}

  function drawMap(feature,fit=false){

    clearMap();if(!map||!L)return;

    if(!feature?.geometry){if(visible)window.WeatherMap.overlayStatus?.('No geometry was stored for this event at this cutoff. Its affected-area text is shown in the timeline; no current boundary is substituted.');return;}

    archiveLayer=L.geoJSON(feature,{style:{color:'#e7c579',weight:2,fillOpacity:.22}});

    window.WeatherMap.setOverlayFit?.('events',()=>{const b=archiveLayer?.getBounds();if(b?.isValid())map.fitBounds(b,{padding:[35,35],maxZoom:9});});
    if(visible){archiveLayer.addTo(map);window.WeatherMap.overlayStatus?.(`${feature.properties.event||'Archived event'} · recorded geometry · cutoff ${time(story.as_of)}.`);const bounds=archiveLayer.getBounds();if(fit&&bounds.isValid())map.fitBounds(bounds,{padding:[35,35],maxZoom:9});}

  }

  let visible=false,id=null,asof=null,story=null,generation=0,listGeneration=0,cursor=null,query='',messages=[];

  async function request(url){const response=await fetcher(url,{signal:AbortSignal.timeout(55000)}),data=await response.json();if(!response.ok)throw new Error(data.error||`Archive returned HTTP ${response.status}`);return data;}

  function hide(){visible=false;generation++;if(archiveLayer)map.removeLayer(archiveLayer);get('event-workspace').hidden=true;get('nav-events').classList.toggle('nav-active',false);get('nav-events').setAttribute('aria-pressed','false');const params=new URLSearchParams(window.location.hash.slice(1));if(params.has('event'))window.history.replaceState(null,'',window.location.pathname+window.location.search);}

  function show(){window.WeatherPersonal.show(false);window.WeatherSmokeMap?.setVisible(false);visible=true;window.WeatherMap?.setWorkspace?.('events');if(archiveLayer){archiveLayer.addTo(map);window.WeatherMap?.overlayStatus?.(mapLabel);}get('event-workspace').hidden=false;for(const key of ['map-workspace','map-timeline','hazard-workspace','river-workspace'])get(key).hidden=true;for(const [key,on] of [['nav-events',true],['nav-map',false],['nav-personal',false],['nav-rivers',false]]){get(key).classList.toggle('nav-active',on);get(key).setAttribute('aria-pressed',String(on));}}

  async function loadList(append=false){

    const gen=++listGeneration;if(!append){query=get('event-search').value.trim();cursor=null;messages=[];get('event-list').replaceChildren();}get('event-list-status').textContent='Reading the persistent archive…';get('event-more').disabled=true;

    try{const data=await request('/api/events?q='+encodeURIComponent(query)+(append&&cursor?'&cursor='+encodeURIComponent(cursor):''));if(gen!==listGeneration)return;messages=[...messages,...data.messages];cursor=data.next_cursor;

      get('event-list-status').textContent=`${messages.length} collected messages shown. ${data.last_collection?'Latest active-feed collection '+time(data.last_collection)+'.':'Archive begins with the next successful collection.'} Updates in one chain can appear separately below.`;

      get('event-list').replaceChildren(...messages.map(m=>{const b=el('button',undefined,'river-choice');b.setAttribute('aria-pressed',String(m.id===id));b.append(el('strong',m.name),el('span',m.area),el('span',`${m.message_type} · first collected ${time(m.first_seen)}`),el('span',m.present===1?'Present in last active-feed collection':m.present===0?'Left active feed':'Retrieved separately'));b.onclick=()=>openStory(m.id,null,{focus:true});return b;}));get('event-more').hidden=!cursor;

    }catch(error){if(gen===listGeneration)get('event-list-status').textContent=error.message;}finally{if(gen===listGeneration)get('event-more').disabled=false;}

  }

  async function openStory(nextId,nextAt=null,{resolve=false,focus=false}={}){

    show();clearMap();const gen=++generation;story=null;window.WeatherEventBundle?.refresh();window.WeatherEventReports?.updateStory(null);window.WeatherEventObservations?.updateStory(null);window.WeatherEventGauges?.updateStory(null);get('event-detail').hidden=true;try{validEventId(nextId);}catch(error){get('event-status').textContent=error.message;return;}

    id=nextId;asof=nextAt;story=null;get('event-detail').hidden=true;get('event-status').textContent=resolve?'Retrieving up to five referenced messages from NWS…':'Reading the collected timeline…';

    // Focus loading only for an explicit selection. A later response must not

    // steal focus if the reader has moved on or switched workspaces.

    const status=get('event-status');

    if(focus){status.setAttribute('tabindex','-1');status.focus();}

    const params=new URLSearchParams({event:id});if(asof)params.set('at',asof);window.history.replaceState(null,'',window.location.pathname+window.location.search+'#'+params);

    try{const data=await request('/api/events/'+id+(asof?'?at='+encodeURIComponent(asof):resolve?'?resolve=1':''));if(gen!==generation)return;story=data;render();loadMap(gen);window.WeatherEventBundle?.refresh();if(focus&&visible&&document.activeElement===status){const title=get('event-title');title.setAttribute('tabindex','-1');title.focus();}}

    catch(error){if(gen===generation){get('event-status').textContent=error.message+' Earlier views cannot use messages or links collected later.';get('event-detail').hidden=true;}}

  }

  async function loadMap(gen){

    if(!map||!L||!story)return;

    const entries=timelineEntries(story),latest=[...entries].reverse().find(t=>t.present!==0)||entries.at(-1);

    if(latest?.feature.geometry)return;

    try{const data=await request('/api/event-map?id='+encodeURIComponent(story.id)+'&at='+encodeURIComponent(story.as_of));

      if(gen!==generation||!visible||!Array.isArray(data.features)||!data.features.length)return;

      clearMap();archiveLayer=L.geoJSON(data,{style:{color:'#e7c579',weight:2,fillOpacity:.22}}).addTo(map);

      window.WeatherMap.setOverlayFit?.('events',()=>{const b=archiveLayer?.getBounds();if(b?.isValid())map.fitBounds(b,{padding:[35,35],maxZoom:9});});
      window.WeatherMap.overlayStatus?.(mapLabel=`${data.kind} retained before ${time(data.as_of)} · ${data.complete?'all selected boundaries available':'partial coverage; some boundaries unavailable'}.`);

      const bounds=archiveLayer.getBounds();if(bounds.isValid())map.fitBounds(bounds,{padding:[35,35],maxZoom:9});

    }catch{if(gen===generation&&visible)window.WeatherMap.overlayStatus?.('Archived boundaries unavailable. Current boundaries are not substituted; see the recorded affected-area text.');}

  }

  function render(){

    if(!story)return;window.WeatherEventReports?.updateStory(story,asof);window.WeatherEventObservations?.updateStory(story,asof);window.WeatherEventGauges?.updateStory(story,asof);const entries=timelineEntries(story),latest=[...entries].reverse().find(t=>t.present!==0)||entries.at(-1),p=latest.feature.properties;drawMap(latest.feature,true);

    get('event-detail').hidden=false;get('event-title').textContent=p.event||'Alert timeline';get('event-area').textContent=p.areaDesc||'';

    get('event-status').textContent=`${asof?'Historical archive view':'Latest collected archive'} · ${entries.length} recorded transitions across ${new Set(entries.map(e=>e.id)).size} collected messages.`;

    get('event-view-time').textContent=`View cutoff ${time(story.as_of)}. ${story.last_collection?'Last complete active-feed collection at or before this view: '+time(story.last_collection)+'.':'No complete active-feed collection is recorded before this view.'}`;

    const local=new Date(story.as_of);get('event-asof').value=new Date(local.getTime()-local.getTimezoneOffset()*60000).toISOString().slice(0,23);

    const missing=story.missing_references.length;get('event-coverage').textContent=missing?`${missing} explicitly referenced message${missing===1?' has':'s have'} not been collected in this view. NWS may no longer provide older messages.`:'All explicit references currently connected to this view have collected bodies. This does not establish that every real-world update or outcome was captured.';

    get('event-resolve').disabled=!!asof||!missing;get('event-resolve').hidden=!missing;

    get('event-resolution').textContent=story.resolution?`Retrieved/cached ${story.resolution.retrieved} referenced messages; ${story.resolution.failures.length} unavailable; ${story.resolution.remaining} references still missing. New retrievals appear only from their actual collection time.`:asof?'Return to the latest view to retrieve missing references.':'';

    get('event-timeline').replaceChildren(...entries.map(t=>{

      const f=t.feature,p=f.properties,box=el('article',undefined,'weather-card event-entry');box.append(el('span',time(t.at),'eyebrow'),el('h3',t.label),el('p',`${p.event||'Weather alert'} · ${p.severity||'Unknown severity'}`),el('p',p.areaDesc||''));

      box.append(el('p',`Issued ${time(p.sent)} · onset ${time(p.onset)} · expires ${time(p.expires)}`,'event-meta'));

      if(t.present===0)box.append(el('p','Absent from a complete active-feed collection. The reason is not established by disappearance alone.','warning-note'));

      else if(p.messageType!=='Cancel'&&Date.parse(p.expires)<=Date.parse(story.as_of))box.append(el('p','The stated expiry is before this view time; this does not establish an all-clear.','small'));

      if(t.changes.length)box.append(el('p','Changed fields: '+t.changes.join(', '),'small'));

      if(t.origin==='reference')box.append(el('p','Retrieved separately; active-feed presence at retrieval is not established.','small'));

      const details=el('details'),summary=el('summary','Official message and instructions');details.append(summary);if(p.headline)details.append(el('h3',p.headline));if(p.instruction)details.append(el('p',p.instruction,'instruction'));details.append(el('p',p.description||'No description supplied.','event-description'));box.append(details);

      const link=el('a','Official NWS message ↗');link.href=f.id.startsWith('https://api.weather.gov/alerts/')?f.id:'https://www.weather.gov/';link.target='_blank';link.rel='noopener';box.append(link);

      const replay=el('button','View what was known at this collection','text-button');replay.onclick=()=>openStory(t.id,t.at,{focus:true});box.append(replay);return box;

    }));

  }

  get('nav-events').onclick=()=>{show();if(story&&!archiveLayer){const entries=timelineEntries(story),latest=[...entries].reverse().find(t=>t.present!==0)||entries.at(-1);drawMap(latest?.feature,false);loadMap(generation);}loadList();};get('event-search-form').onsubmit=e=>{e.preventDefault();loadList();};get('event-more').onclick=()=>loadList(true);

  get('event-refresh').onclick=async()=>{get('event-refresh').disabled=true;try{await request('/api/alerts');await loadList();if(id)await openStory(id,asof);}catch(error){get('event-status').textContent=error.message;}finally{get('event-refresh').disabled=false;}};

  get('event-asof-form').onsubmit=e=>{e.preventDefault();const at=new Date(get('event-asof').value);if(!Number.isFinite(at.getTime())){get('event-status').textContent='Choose a valid local date and time.';return;}openStory(id,at.toISOString(),{focus:true});};get('event-current').onclick=()=>openStory(id,null,{focus:true});get('event-resolve').onclick=()=>openStory(id,null,{resolve:true,focus:true});

  get('event-share').onclick=async()=>{try{await window.navigator.clipboard.writeText(window.location.href);get('event-status').textContent='Timeline link copied, including the archive cutoff when selected.';}catch{get('event-status').textContent='Copy the timeline URL from the address bar.';}};

  get('event-export').onclick=()=>{if(!story)return;const blob=new Blob([JSON.stringify(story,null,2)],{type:'application/json'}),url=window.URL.createObjectURL(blob),a=el('a');a.href=url;a.download='ventusiq-event-'+id.slice(0,12)+'.json';a.click();window.setTimeout(()=>window.URL.revokeObjectURL(url),1000);};

  window.WeatherEvents={hide,openStory,context:()=>({story,asof}),async openAlert(value){await openStory(await eventId(value),null,{focus:true});if(!messages.length)loadList();}};

  const shared=new URLSearchParams(window.location.hash.slice(1));if(shared.has('event')){openStory(shared.get('event'),shared.get('at'));loadList();}

  // Keep an open story stable while somebody reads or expands official text.

  window.setInterval(()=>{if(visible&&!asof&&!id)loadList();},60000);

  return {openStory,loadList,getStory:()=>story};

}

if(typeof window!=='undefined'){const start=()=>mountEvents({document,window});if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();}

