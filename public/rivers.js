import {riverRegion,loadRiverRegion,loadGauge,gaugeId,riverSummary,riverCategory,waterValue,waterTime} from './rivers-core.mjs';

import {nearest} from './hazards-core.mjs';



export function mountRivers({document,window,L,fetcher=fetch,clock=Date.now}){

  const get=id=>document.getElementById(id),map=window.WeatherMap.instance,cache=new Map(),pending=new Map();

  const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};

  const time=value=>value&&Number.isFinite(Date.parse(value))?new Date(value).toLocaleString():'time unavailable';

  const value=(n,unit)=>n===null||n===undefined?'Unknown':n.toLocaleString(undefined,{maximumFractionDigits:2})+' '+unit;

  const old=data=>!data||data.stale||!data.checked_at||clock()-Date.parse(data.checked_at)>1350000;

  let place=null,region=null,regionOrigin=null,selected=null,visible=false,regionGeneration=0,gaugeGeneration=0,markers=null,markerData=null,replay=window.WeatherMap.isReplay();

  function keyNear(point){return 'near/'+riverRegion(point.lat,point.lon).key;}

  async function source(key){

    if(window.WEATHER_CONFIG?.mode==='hosted'){

      const [kind,id]=key.split('/'),url=kind==='near'?'/api/rivers/near?lat='+id.split(',')[0]+'&lon='+id.split(',')[1]:'/api/rivers/gauge?id='+encodeURIComponent(id);

      const r=await fetcher(url,{signal:AbortSignal.timeout(50000)}),data=await r.json();if(!r.ok)throw new Error(data.error||`Source returned HTTP ${r.status}`);return data;

    }

    const data=key.startsWith('near/')?await loadRiverRegion(riverRegion(...key.slice(5).split(',')),fetcher):await loadGauge(key.slice(6),fetcher);

    return {...data,checked_at:new Date(clock()).toISOString(),stale:false};

  }

  async function load(key){

    if(pending.has(key))return pending.get(key);

    const previous=cache.get(key);if(previous&&clock()<previous.retry)return previous;

    const work=(async()=>{try{const data=await source(key);if(key.startsWith('near/')?!Array.isArray(data.features):!data.metadata||!data.series)throw new Error('Incomplete river response');const entry={data,retry:clock()+900000,error:data.error||null};cache.set(key,entry);return entry;}

      catch(error){const entry={data:previous?.data?{...previous.data,stale:true}:null,retry:clock()+120000,error:error.message};cache.set(key,entry);return entry;}

      finally{pending.delete(key);if(cache.size>48){for(const candidate of cache.keys()){if(candidate!=='gauge/'+selected&&candidate!==region&&candidate!==(place?keyNear(place):null)){cache.delete(candidate);break;}}}}})();pending.set(key,work);return work;

  }

  function show(){window.WeatherPersonal.show(false);window.WeatherSmokeMap?.setVisible(false);visible=true;window.WeatherMap.setWorkspace?.('rivers');window.WeatherMap.goLive();syncMarkers();get('river-workspace').hidden=false;for(const id of ['map-workspace','map-timeline','hazard-workspace'])get(id).hidden=true;for(const [id,on] of [['nav-rivers',true],['nav-map',false],['nav-personal',false]]){get(id).classList.toggle('nav-active',on);get(id).setAttribute('aria-pressed',String(on));}}

  function hide(){visible=false;if(markers)map.removeLayer(markers);get('river-workspace').hidden=true;get('nav-rivers').classList.toggle('nav-active',false);get('nav-rivers').setAttribute('aria-pressed','false');}

  async function search(point,{showOnMap=true}={}){

    let key;try{key=keyNear(point);}catch(error){get('river-list-status').textContent=error.message;return;}

    const generation=++regionGeneration;region=key;regionOrigin=point;get('river-lat').value=point.lat;get('river-lon').value=point.lon;get('river-list-status').textContent='Loading regional gauges…';get('river-list').replaceChildren();

    const entry=await load(key);if(generation!==regionGeneration)return;renderList(entry);if(showOnMap&&entry.data)drawMarkers(entry.data,key);

  }

  function reading(g){const p=g.properties.observed,stale=!p.at||clock()-Date.parse(p.at)>21600000||Date.parse(p.at)>clock()+600000;const category=p.value===null?{label:'Reading unavailable',color:'#8b8b93'}:stale?{label:'Observation delayed',color:'#8b8b93'}:riverCategory(p.category);return {...category,text:`${value(p.value,p.unit)} · ${category.label} · ${time(p.at)}`};}

  function renderList(entry=cache.get(region)){

    if(!entry?.data){get('river-list-status').textContent=entry?.error?'Gauge list unavailable. '+entry.error:'Search a region to find gauges.';return;}

    const term=get('river-search').value.trim().toLowerCase(),features=entry.data.features.filter(f=>(f.id+' '+f.properties.name+' '+f.properties.state).toLowerCase().includes(term));

    const sorted=nearest(features,regionOrigin,{limit:features.length,maxKm:Infinity});

    get('river-list-status').textContent=`${old(entry.data)?'Updates delayed. ':''}${features.length} gauges in this search region; showing ${Math.min(100,features.length)} closest matches. Checked ${time(entry.data.checked_at)}.`;

    get('river-list').replaceChildren(...sorted.slice(0,100).map(f=>{const b=el('button',undefined,'river-choice');b.setAttribute('aria-pressed',String(f.id===selected));b.append(el('strong',f.properties.name),el('span',`${f.id} · ${f.properties.state} · ${f.distance_km.toFixed(1)} km from search point`),el('span',reading(f).text));b.onclick=()=>openGauge(f.id);return b;}));

  }

  async function openGauge(id){

    try{id=gaugeId(id);}catch(error){get('river-status').textContent=error.message;return;}

    show();window.WeatherExplorer?.collapse(get("river-detail"));const generation=++gaugeGeneration;selected=id;window.WeatherWatches?.refreshGauge(null);window.WeatherRiverChanges?.updateGauge(null);window.WeatherRiverNetwork?.updateGauge(null);get('river-id').value=id;get('river-status').textContent='Loading '+id+' observations and forecast…';get('river-detail').hidden=true;renderList();

    const entry=await load('gauge/'+id);if(generation!==gaugeGeneration)return;renderGauge(entry);if(entry.data){drawMarkers(pointCollection(entry.data),'gauge/'+id);const m=entry.data.metadata;if(visible&&Number.isFinite(m.latitude)&&Number.isFinite(m.longitude))window.WeatherMap.focus(m.latitude,m.longitude);}

  }

  function renderGauge(entry){

    if(!entry?.data){get('river-detail').hidden=true;get('river-status').textContent=entry?.error||'Gauge data unavailable.';return;}

    window.WeatherWatches?.refreshGauge(entry.data);window.WeatherRiverChanges?.updateGauge(entry.data);window.WeatherRiverNetwork?.updateGauge(entry.data);const data=entry.data,m=data.metadata,s=riverSummary({...data,stale:old(data)},clock());get('river-detail').hidden=false;

    get('river-status').className=old(data)?'warning-note':'small';get('river-status').textContent=`${old(data)?'Updates delayed. ':''}NOAA / NWPS · checked ${time(data.checked_at)}${entry.error?' · '+entry.error:''}`;

    get('river-title').textContent=m.name;get('river-code').textContent=m.lid;get('river-location').textContent=[m.county,m.state?.name].filter(Boolean).join(', ');get('river-official').href=data.official_url;

    const obs=el('section',undefined,'weather-card'),forecast=el('section',undefined,'weather-card');obs.append(el('span','LATEST OBSERVATION','eyebrow'),el('p',s.latest?value(s.latest.value,s.observed.unit):'Unavailable','outlook-number'),el('p',s.latest?time(s.latest.at):'No valid observation.'));

    if(s.observationStale)obs.append(el('p','Reading is missing or more than six hours old.','warning-note'));

    forecast.append(el('span','HIGHEST UPCOMING FORECAST SAMPLE','eyebrow'));

    if(s.peak){forecast.append(el('p',value(s.peak.value,s.forecast.unit),'outlook-number'),el('p','First at '+time(s.peak.at)),el('p',s.peak.atEnd?'The forecast ends at its maximum; a later crest is unknown.':s.peak.repeated?'This value repeats in the forecast; it is not a unique crest time.':'Highest sample in the available forecast, not a guaranteed crest.','small'));}

    else forecast.append(el('p',s.forecastStale?'No current forecast available.':!s.compatible?'Observed and forecast units or quantities cannot be compared.':'No future forecast samples available.','warning-note'));

    forecast.append(el('p','Issued '+time(s.forecast.issued_at),'small'));get('river-summary').replaceChildren(obs,forecast);

    renderChart(s);renderCrossings(s);renderImpacts(s);

    const datums=m.datums?.vertical?.value||[];get('river-datum').textContent=`${s.observed.name} in ${s.observed.unit||'unspecified units'}. ${datums.length?'Gauge datum: '+datums.map(d=>[d.label,d.abbrev,d.value].filter(v=>v!==undefined&&v!=='').join(' ')).join('; '):'Vertical datum details are not supplied.'} Stage is a gauge-relative reading, not water depth at your address. Do not compare elevations across gauges.`;

  }

  function renderCrossings(s){

    const nodes=[];

    if(s.thresholdsInvalid)nodes.push(el('p','Provider thresholds are inconsistent and cannot be compared.','warning-note'));

    else if(!s.thresholds.length)nodes.push(el('p','No compatible flood thresholds are available for this measurement.'));

    for(const t of s.thresholds){const row=el('div',undefined,'river-impact'),cross=s.crossings.find(c=>c.name===t.name);row.append(el('strong',`${t.name==='action'?'Action':t.name[0].toUpperCase()+t.name.slice(1)+' flood'} · ${value(t.value,s.observed.unit)}`));row.append(el('p',!s.usableForecast?'Timing unavailable without a current, compatible forecast.':!cross?.at?'No forecast sample reaches this level during the available period.':cross.after?`Rises to this level between ${time(cross.after)} and ${time(cross.at)}.`:`At or above this level at ${time(cross.at)}; crossing time is not established.`));nodes.push(row);}

    get('river-crossings').replaceChildren(...nodes);

  }

  function renderImpacts(s){

    const nodes=s.impacts.map(p=>{const row=el('article',undefined,'river-impact');const flags=[];if(s.latest&&!s.observationStale&&s.latest.value>=p.value)flags.push('Latest observation at/above level');if(s.peak&&s.peak.value>=p.value)flags.push('Forecast high at/above level');row.append(el('strong',value(p.value,s.observed.unit)),el('p',p.text));if(flags.length)row.append(el('p',flags.join(' · '),'small'));return row;});

    get('river-impacts').replaceChildren(...(nodes.length?nodes:[el('p','No compatible stage-based impact statements are supplied for this gauge.')]));

  }

  function renderChart(s){

    const now=clock(),observed=s.observed.points.filter(p=>Date.parse(p.at)>=now-48*3600000&&Date.parse(p.at)<=now+600000),forecast=s.usableForecast?s.future:[];

    const rows=[...observed.map(p=>({...p,kind:'Observed',unit:s.observed.unit})),...forecast.map(p=>({...p,kind:'Forecast',unit:s.forecast.unit}))];

    get('river-table').replaceChildren(...rows.map(p=>{const row=el('tr');for(const text of [time(p.at),p.kind,value(p.value,p.unit)])row.append(el('td',text));return row;}));

    const valid=rows.filter(p=>p.value!==null);if(!valid.length){get('river-chart').replaceChildren(el('p','No valid samples in the displayed period.'));return;}

    const ns='http://www.w3.org/2000/svg',svg=document.createElementNS(ns,'svg');svg.setAttribute('viewBox','0 0 760 300');svg.setAttribute('role','img');svg.setAttribute('aria-label',`Observed and forecast ${s.observed.name}; values also available in the data table.`);

    const add=(tag,attrs,text)=>{const n=document.createElementNS(ns,tag);for(const [k,v] of Object.entries(attrs))n.setAttribute(k,String(v));if(text!==undefined)n.textContent=text;svg.append(n);return n;};

    const times=rows.map(p=>Date.parse(p.at)),xmin=Math.min(...times),xmax=Math.max(...times,xmin+3600000),numbers=valid.map(p=>p.value),min=Math.min(...numbers),max=Math.max(...numbers),pad=Math.max((max-min)*.15,s.observed.kind==='stage'?1:Math.max(1,max*.1)),ymin=min-pad,ymax=max+pad;

    const x=t=>65+(Date.parse(t)-xmin)/(xmax-xmin)*670,y=v=>250-(v-ymin)/(ymax-ymin)*220;

    for(let i=0;i<5;i++){const v=ymin+(ymax-ymin)*i/4;add('line',{x1:65,y1:y(v),x2:735,y2:y(v),class:'chart-grid'});add('text',{x:57,y:y(v)+4,'text-anchor':'end'},v.toLocaleString(undefined,{maximumFractionDigits:1}));}

    for(let i=0;i<3;i++){const at=xmin+(xmax-xmin)*i/2;add('text',{x:65+670*i/2,y:277,'text-anchor':i===0?'start':i===2?'end':'middle'},new Date(at).toLocaleString(undefined,{month:'short',day:'numeric',hour:'numeric'}));}

    add('text',{x:65,y:17},s.observed.unit);

    for(const t of s.thresholds)if(t.value>=ymin&&t.value<=ymax){add('line',{x1:65,x2:735,y1:y(t.value),y2:y(t.value),class:'chart-threshold'});add('text',{x:730,y:y(t.value)-5,'text-anchor':'end',class:'chart-label'},t.name+' '+value(t.value,s.observed.unit));}

    for(const [points,cls] of [[observed,'chart-observed'],[forecast,'chart-forecast']]){let segment=[],last=null;const flush=()=>{if(segment.length===1)add('circle',{cx:segment[0][0],cy:segment[0][1],r:3,class:cls});else if(segment.length)add('polyline',{points:segment.map(p=>p.join(',')).join(' '),class:cls});segment=[];};for(const p of points){if(p.value===null||last&&Date.parse(p.at)-Date.parse(last)>12*3600000)flush();if(p.value!==null)segment.push([x(p.at),y(p.value)]);last=p.at;}flush();}

    get('river-chart').replaceChildren(svg);

  }

  function drawMarkers(data,key){

    if(visible)window.WeatherMap.overlayStatus?.(`${data.features.length} gauges · observation status · checked ${time(data.checked_at)}. Points are not flood inundation areas.`);

    if(markers)map.removeLayer(markers);markerData={data,key};

    markers=L.geoJSON(data,{pointToLayer:(f,latlng)=>L.circleMarker(latlng,{radius:6,color:'#12121a',weight:1,fillColor:old(data)?'#8b8b93':reading(f).color,fillOpacity:.95}),onEachFeature:(f,layer)=>{const box=el('div',undefined,'hazard-popup');box.append(el('h3',f.properties.name),el('p',reading(f).text),el('p','Point measurement, not a flood inundation area.'));const button=el('button','View forecast and impacts','action secondary');button.onclick=()=>openGauge(f.id);box.append(button);layer.bindPopup(box);}});window.WeatherMap.setOverlayFit?.('rivers',()=>{const bounds=markers?.getBounds();if(bounds?.isValid())map.fitBounds(bounds,{padding:[35,35],maxZoom:11});});syncMarkers();

  }

  function pointCollection(data){const m=data.metadata;return {type:'FeatureCollection',features:[{type:'Feature',id:m.lid,geometry:{type:'Point',coordinates:[m.longitude,m.latitude]},properties:{name:m.name,observed:{value:waterValue(m.status?.observed?.primary),unit:m.status?.observed?.primaryUnit,category:m.status?.observed?.floodCategory,at:waterTime(m.status?.observed?.validTime)}}}],checked_at:data.checked_at,stale:data.stale};}

  function syncMarkers(){if(visible&&markerData)window.WeatherMap.overlayStatus?.(`${markerData.data.features.length} gauges · observed status. Points are not flood inundation areas.`);if(markers){if(replay||!visible)map.removeLayer(markers);else markers.addTo(map);}get('river-map-tools').hidden=!markerData;get('river-map-status').textContent=markerData?(replay?'Current river markers are hidden during alert replay.':`${markerData.data.features.length} river gauges · observed status · ${old(markerData.data)?'updates delayed · ':''}checked ${time(markerData.data.checked_at)}`):'';}

  async function renderPlace(){

    if(!place)return;const point=place,key=keyNear(point);let entry=cache.get(key);get('place-rivers').replaceChildren(el('p','Loading nearby gauges…'));entry=await load(key);

    if(!place||keyNear(place)!==key)return;

    if(!entry.data){get('place-rivers').replaceChildren(el('p','Gauge coverage unavailable. '+entry.error));return;}

    const matches=nearest(entry.data.features,place,{limit:3,maxKm:50}),nodes=[];

    if(old(entry.data))nodes.push(el('p','Gauge collection is delayed.','warning-note'));

    for(const f of matches){const b=el('button',undefined,'river-nearby');b.append(el('strong',f.properties.name),el('span',`${f.distance_km.toFixed(1)} km away · ${reading(f).text}`));b.onclick=()=>openGauge(f.id);nodes.push(b);}

    if(!matches.length)nodes.push(el('p','No gauges found within 50 km in this collection. Local flood conditions are unknown.'));

    get('place-rivers').replaceChildren(...nodes);

  }

  get('nav-rivers').onclick=show;

  get('river-map-center').onclick=()=>{const center=map.getCenter();search({lat:center.lat,lon:((center.lng+180)%360+360)%360-180});};

  get('river-region-form').onsubmit=e=>{e.preventDefault();search({lat:Number(get('river-lat').value),lon:Number(get('river-lon').value)});};

  get('river-id-form').onsubmit=e=>{e.preventDefault();openGauge(get('river-id').value);};get('river-search').oninput=()=>renderList();

  get('river-region-map').onclick=()=>{const data=cache.get(region)?.data;if(!data){get('river-list-status').textContent='Load a region first.';return;}window.WeatherMap.goLive();show();drawMarkers(data,region);const bounds=markers.getBounds();if(bounds.isValid())map.fitBounds(bounds,{padding:[40,60],maxZoom:9});};

  get('river-on-map').onclick=()=>{const data=cache.get('gauge/'+selected)?.data,m=data?.metadata;if(!m||!Number.isFinite(m.latitude)||!Number.isFinite(m.longitude)){get('river-status').textContent='Gauge coordinates are unavailable.';return;}window.WeatherMap.goLive();show();drawMarkers(pointCollection(data),'gauge/'+selected);window.WeatherMap.focus(m.latitude,m.longitude);};

  get('river-map-clear').onclick=()=>{if(markers)map.removeLayer(markers);markers=null;markerData=null;window.WeatherMap.setOverlayFit?.('rivers',null);syncMarkers();};

  window.WeatherRivers={hide,openGauge,search,currentProduct:()=>cache.get('gauge/'+selected)?.data||null,acceptProduct(data){if(data?.metadata?.lid!==selected)return;const entry={data,retry:clock()+900000,error:data.error||null};cache.set('gauge/'+selected,entry);renderGauge(entry);},setReplay(value){replay=value;syncMarkers();},updatePlace(value){place=value;renderPlace();}};

  window.setInterval(()=>{if(visible){if(region&&regionOrigin)search(regionOrigin,{showOnMap:markerData?.key===region});if(selected){const id=selected;load('gauge/'+id).then(entry=>{if(selected===id)renderGauge(entry);});}}if(place)renderPlace();if(markerData){const key=markerData.key;load(key).then(entry=>{if(markerData?.key!==key)return;drawMarkers(entry.data?(key.startsWith('gauge/')?pointCollection(entry.data):entry.data):{...markerData.data,stale:true},key);});}},60000);

  window.WeatherRivers.updatePlace(window.WeatherPersonal?.current());

  return {load,search,openGauge,cache};

}

if(typeof window!=='undefined'){const start=()=>mountRivers({document,window,L:window.L});if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();}

