import {coordinateQuery,locationMatches} from './location-entry-core.mjs';

export function mountGeocode({document,window,fetcher=fetch,clock=Date.now}){
  const get=id=>document.getElementById(id),map=window.WeatherMap.instance,L=window.L;
  const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
  const controls={
    personal:{input:'address-input',status:'address-status',results:'address-results',lat:'place-lat',lon:'place-lon'},
    from:{input:'journey-from-query',status:'journey-from-status',results:'journey-from-matches',lat:'journey-from-lat',lon:'journey-from-lon'},
    to:{input:'journey-to-query',status:'journey-to-status',results:'journey-to-matches',lat:'journey-to-lat',lon:'journey-to-lon'},
    river:{input:'river-place-query',status:'river-place-status',results:'river-place-matches',lat:'river-lat',lon:'river-lon'},
  };
  for(const c of Object.values(controls))Object.assign(c,{generation:0,controller:null,selected:null});
  let mode=get('workspace').dataset.view||'live',pickSide='from',editGeneration=0,tripBusy=false,lastLookup=0,queue=Promise.resolve(),report=null,placeId=null;
  const markers=new Map();
  function removeMarker(key){const old=markers.get(key);if(old)map.removeLayer(old);markers.delete(key);}
  function renderMarkers(){
    for(const key of ['personal','from','to']){
      removeMarker(key);const c=controls[key];if(!c.selected||(key==='personal'?mode!=='personal':mode!=='journey'))continue;
      const label=key==='personal'?'Selected place':key==='from'?'1':'2';
      const marker=L.circleMarker([c.selected.lat,c.selected.lon],{radius:key==='personal'?8:10,color:'#101018',weight:2,fillColor:key==='to'?'#e7c579':'#88baff',fillOpacity:1});
      marker.bindTooltip(el('span',label),{permanent:key!=='personal',direction:key==='personal'?'top':'center',className:'location-point-label'}).addTo(map);markers.set(key,marker);
    }
    if(mode==='personal'){
      const p=controls.personal.selected;
      window.WeatherMap.overlayStatus?.(p?`${p.name||'Selected place'} · ${pointText(p)}`:'Choose a place on the map or enter its coordinates.');
    }
  }
  function fitPoints(keys){const points=keys.map(k=>controls[k].selected).filter(Boolean);if(!points.length)return;if(points.length===1)map.setView([points[0].lat,points[0].lon],11);else map.fitBounds(L.latLngBounds(points.map(p=>[p.lat,p.lon])),{padding:[45,45],maxZoom:11});}
  function clearJourney(){window.WeatherJourney?.clear?.();if(tripBusy)get('journey-submit').disabled=true;}
  function invalidate(key,userEdit=true){const c=controls[key];c.generation++;c.controller?.abort();c.controller=null;c.selected=null;get(c.results).replaceChildren();get(c.lat).value='';get(c.lon).value='';removeMarker(key);if(key==='from'||key==='to'){if(userEdit)editGeneration++;clearJourney();}}
  function pointText(p){return `${p.lat.toFixed(4)}, ${p.lon.toFixed(4)}`;}
  function accept(key,p,{focus=true,query=get(controls[key].input).value}={}){
    const c=controls[key];c.selected={...p,query};get(c.input).value=query;get(c.lat).value=String(p.lat);get(c.lon).value=String(p.lon);get(c.results).replaceChildren();
    get(c.status).textContent=`${pointText(p)}${p.kind==='address'?' · approximate Census street-range point':''}`;
    if(key==='personal'){
      report=p.evidence||null;get('address-export').disabled=!report;
      window.WeatherPersonal.preview(p.kind==='address'?p.address:'Selected place',p.lat,p.lon,{query});
    }else if(key==='from'||key==='to'){
      clearJourney();pickSide=controls.from.selected?(controls.to.selected?null:'to'):'from';
      get('journey-pick-status').textContent=pickSide?`Click point ${pickSide==='from'?'1':'2'} on the map, or enter its address.`:'Both points selected. Compare the journey or choose a point to change.';
      window.WeatherMap.setOverlayFit?.('journey',()=>fitPoints(['from','to']));
    }else window.WeatherRivers.search({lat:p.lat,lon:p.lon});
    renderMarkers();if(focus)fitPoints(key==='from'||key==='to'?['from','to']:[key]);return p;
  }
  async function matches(query,signal){
    const coordinate=coordinateQuery(query);if(coordinate)return [coordinate];
    // Serialize submitted Journey addresses to respect the shared Census limit.
    const work=queue.catch(()=>{}).then(async()=>{const wait=Math.max(0,2100-(clock()-lastLookup));if(wait)await new Promise(r=>window.setTimeout(r,wait));signal.throwIfAborted();lastLookup=clock();return locationMatches(query,{fetcher,signal,mode:window.WEATHER_CONFIG?.mode});});queue=work;return work;
  }
  async function resolve(key,{focus=true}={}){
    const c=controls[key],query=get(c.input).value.trim();if(c.selected?.query===query)return c.selected;
    invalidate(key,false);const token=c.generation;c.controller=new AbortController();get(c.status).textContent='Finding this location…';
    try{
      const results=await matches(query,AbortSignal.any([c.controller.signal,AbortSignal.timeout(55000)]));if(token!==c.generation)return null;
      if(results.length===1)return accept(key,results[0],{query,focus});
      get(c.status).textContent=results.length?'Choose the matching address below.':'No address match. Include street number, city and state or ZIP, or click the map.';
      get(c.results).replaceChildren(...results.map(p=>{const button=el('button',`${p.address} · ${pointText(p)}`,'address-choice');button.type='button';button.onclick=()=>{if(token===c.generation)accept(key,p,{query,focus:true});};return button;}));return null;
    }catch(error){if(token===c.generation)get(c.status).textContent=error.message;return null;}
    finally{if(token===c.generation)c.controller=null;}
  }
  async function compare(event){
    event?.preventDefault();if(tripBusy)return;tripBusy=true;const token=editGeneration;get('journey-submit').disabled=true;
    try{const first=await resolve('from',{focus:false});if(!first||token!==editGeneration)return;const second=await resolve('to',{focus:false});if(!second||token!==editGeneration)return;fitPoints(['from','to']);await window.WeatherJourney.run();}
    finally{tripBusy=false;get('journey-submit').disabled=false;}
  }
  for(const [key,c] of Object.entries(controls))get(c.input).oninput=()=>{invalidate(key);if(key==='personal'){window.WeatherPersonal.clearPreview();report=null;get('address-export').disabled=true;}get(c.status).textContent='Submit to use this location. No lookup runs while you type.';};
  get('address-form').onsubmit=e=>{e.preventDefault();return resolve('personal');};
  get('address-clear').onclick=()=>{invalidate('personal');get('address-input').value='';report=null;get('address-export').disabled=true;window.WeatherPersonal.clearPreview();get('address-status').textContent='Click the map or enter a location.';};
  get('pick-on-map').textContent='Pick on map';get('pick-on-map').onclick=()=>{get('address-status').textContent='Click anywhere on the map to see its weather.';get('map-canvas').scrollIntoView({behavior:'smooth',block:'nearest'});};
  get('use-location').onclick=()=>{
    if(!window.navigator.geolocation){get('address-status').textContent='Location is unavailable. Use the map or enter coordinates.';return;}
    get('address-status').textContent='Requesting your location…';window.navigator.geolocation.getCurrentPosition(p=>{invalidate('personal');const point={lat:p.coords.latitude,lon:p.coords.longitude,kind:'coordinates'};accept('personal',point,{query:pointText(point)});},()=>{get('address-status').textContent='Location could not be read. Use the map or enter coordinates.';},{timeout:12000});
  };
  for(const key of ['from','to']){
    get(`journey-${key}-search`).onclick=()=>resolve(key);
    get(`journey-${key}-map`).onclick=()=>{pickSide=key;get('journey-pick-status').textContent=`Click point ${key==='from'?'1':'2'} on the map.`;get('map-canvas').scrollIntoView({behavior:'smooth',block:'nearest'});};
  }
  get('journey-form').onsubmit=compare;
  get('journey-clear-points').onclick=()=>{for(const key of ['from','to']){invalidate(key);get(controls[key].input).value='';get(controls[key].status).textContent='';}pickSide='from';get('journey-pick-status').textContent='Click point 1, then point 2 on the map.';};
  get('river-region-form').onsubmit=e=>{e.preventDefault();return resolve('river');};
  get('address-static-note').hidden=['hosted','daemon'].includes(window.WEATHER_CONFIG?.mode);
  get('address-export').onclick=()=>{if(!report)return;const url=window.URL.createObjectURL(new Blob([JSON.stringify(report,null,2)],{type:'application/json'})),a=el('a');a.href=url;a.download='ventusiq-address-match.json';a.click();window.setTimeout(()=>window.URL.revokeObjectURL(url),1000);};
  window.WeatherLocations={
    setWorkspace(value){mode=value;renderMarkers();},
    syncPlace(p){
      get('place-form').querySelector('button[type="submit"]').disabled=!p;
      if((p?.id||null)===placeId)return;placeId=p?.id||null;const c=controls.personal;
      const changedPoint=p&&(c.selected?.lat!==p.lat||c.selected?.lon!==p.lon);
      c.selected=p?{...p,query:p.input_query||pointText(p)}:null;
      if(p){get('address-input').value=c.selected.query;get('place-lat').value=p.lat;get('place-lon').value=p.lon;get('place-name').value=p.name;window.WeatherMap.setOverlayFit?.('personal',()=>fitPoints(['personal']));}
      else window.WeatherMap.setOverlayFit?.('personal',null);renderMarkers();
      // Shared links and saved-place choices arrive through syncPlace, without
      // accept(). Map clicks already set the point and should preserve the view.
      if(changedPoint&&mode==='personal')fitPoints(['personal']);
    },
    journeyFilled(){const points=['from','to'].map(key=>({key,lat:Number(get(controls[key].lat).value),lon:Number(get(controls[key].lon).value),valid:get(controls[key].lat).value!==''&&get(controls[key].lon).value!==''}));for(const {key,lat,lon,valid} of points)if(valid){invalidate(key);accept(key,{lat,lon,kind:'coordinates'},{query:pointText({lat,lon}),focus:false});}},
    mapPoint(view,lat,lon){const point={lat,lon,kind:'coordinates'};
      if(view==='personal'){invalidate('personal');accept('personal',point,{query:pointText(point),focus:false});}
      if(view==='journey'&&pickSide){const key=pickSide;invalidate(key);accept(key,point,{query:pointText(point),focus:false});if(controls.from.selected&&controls.to.selected)window.WeatherJourney.run();}
      if(view==='rivers'){invalidate('river');accept('river',point,{query:pointText(point),focus:false});}
    },
  };
  return {resolve,compare,controls};
}
