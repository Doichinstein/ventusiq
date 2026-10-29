/* Fire and air observations. Source text is only inserted through textContent. */
import {loadFires,loadAir,loadAqiContours,loadSatellite,loadPerimeters,nearest,observationFresh,aqiCategory,fireSymbolSize,fireDisplay,AQI_BANDS,SATELLITE_LAYER} from './hazards-core.mjs';

export function mountHazards({document,window,L,fetcher=fetch,clock=Date.now}){
  const get=id=>document.getElementById(id),map=window.WeatherMap.instance;
  const el=(tag,text,cls)=>{const node=document.createElement(tag);if(text!==undefined)node.textContent=text;if(cls)node.className=cls;return node;};
  const time=value=>value&&Number.isFinite(Date.parse(value))?new Date(value).toLocaleString():'time unavailable';
  const quantity=(value,unit)=>value===null||value===undefined?'Not reported':Number(value).toLocaleString()+unit;
  const sources={fires:loadFires,air:loadAir,aqi:loadAqiContours,satellite:loadSatellite};
  const aqiPane=map.getPane?.('aqiContours')||map.createPane?.('aqiContours');if(aqiPane)aqiPane.style.zIndex='330';
  const state=Object.fromEntries(Object.keys(sources).map(key=>[key,{data:null,pending:null,error:null,next:0}]));
  const layers={},perimeter=L.layerGroup(),perimeterCache=new Map();
  let place=null,replay=window.WeatherMap.isReplay(),perimeterRequest=0,satelliteErrors=0,satelliteDate=null;
  const isDelayed=kind=>{const s=state[kind];return !!(s.error||s.data?.stale||!s.data?.checked_at||clock()-Date.parse(s.data.checked_at)>(kind==='satellite'?5400000:1350000));};
  async function request(kind,id){
    if(window.WEATHER_CONFIG?.mode==='hosted'){
      const response=await fetcher('/api/hazards/'+kind+(id?'?id='+encodeURIComponent(id):''),{signal:AbortSignal.timeout(50000)});
      const data=await response.json();if(!response.ok)throw new Error(data.error||`Source returned HTTP ${response.status}`);
      if(kind==='satellite'?!/^\d{4}-\d{2}-\d{2}$/.test(data.date||''):data.type!=='FeatureCollection'||!Array.isArray(data.features))throw new Error('Incomplete source response');
      return data;
    }
    const data=kind==='perimeters'?await loadPerimeters(id,fetcher):await sources[kind](fetcher);
    const now=new Date(clock()).toISOString();return {...data,collected_at:now,checked_at:now,stale:false};
  }
  function status(kind){
    const s=state[kind],target=get(kind+'-status');
    const key=kind==='fires'?get('fire-map-time'):kind==='aqi'?get('aqi-map-time'):null;
    target.className=isDelayed(kind)&&s.data?'warning-note':'small';
    if(!s.data){target.textContent=s.pending?'Loading source…':s.error?'Source unavailable. '+s.error:'Enable to load this source.';if(key)key.textContent=target.textContent;return;}
    const base=kind==='satellite'?`Available day: ${s.data.date} UTC. ${satelliteErrors?'Some imagery tiles could not load; coverage is incomplete.':'Daily overpass detections; not continuous coverage.'}`:kind==='aqi'?`${s.data.features.length.toLocaleString()} PM2.5 AQI zones · EPA interpolated estimates. ${s.data.features.some(f=>!observationFresh(f,clock()))?'Some source times are missing or over 3 hours old; gray zones are not current.':''}`:`${s.data.features.length.toLocaleString()} ${kind==='fires'?'incident locations':'reporting monitors'}.`;
    target.textContent=`${isDelayed(kind)?'Updates delayed · ':''}${base} Checked ${time(s.data.checked_at)}.${s.error?' '+s.error:''}`;
    if(key){key.textContent=target.textContent;if(kind==='aqi'){const times=[...new Set(s.data.features.map(f=>f.properties.observed_at).filter(Boolean))].sort();key.textContent+=times.length?` Source valid ${time(times[0])}${times.length>1?' through '+time(times.at(-1)):''}.`:' Source valid time unavailable.';}}
  }
  async function load(kind){
    const s=state[kind];if(s.pending)return s.pending;if(clock()<s.next)return s.data;
    s.next=clock()+(kind==='satellite'?3600000:900000);
    s.pending=(async()=>{try{s.data=await request(kind);s.error=s.data.error||null;draw(kind);}
      catch(error){s.error=error.message;s.next=clock()+120000;}
      finally{s.pending=null;status(kind);renderPlace();window.WeatherCompound?.refresh();window.WeatherPlanner?.refresh();window.WeatherAirTrends?.refresh();}})();
    status(kind);await s.pending;return s.data;
  }
  function fireSummary(f){const p=f.properties;return `${p.kind} · ${[p.county,p.state].filter(Boolean).join(', ')} · ${quantity(p.acres,' acres')} · ${quantity(p.contained,'% contained')}`;}
  function firePopup(f){
    perimeterRequest++;perimeter.clearLayers();
    const p=f.properties,box=el('div',undefined,'hazard-popup');
    box.append(el('h3',p.name),el('p',fireSummary(f)),el('p',fireDisplay(p,clock()).label,'fire-record-label'),el('p',`Record updated ${time(p.updated_at)}. Discovered ${time(p.discovered_at)}.`,'small'),el('p','Incident point only. Reported containment does not mean extinguished or establish local safety.'));
    if(isDelayed('fires'))box.append(el('p','Collection is delayed. This is the last available record.'));
    if(p.description)box.append(el('p',p.description));
    if(p.perimeter_id){const button=el('button','Show reported perimeter','action secondary'),message=el('p','');button.onclick=async()=>{
      const requestId=++perimeterRequest;button.disabled=true;message.textContent='Loading reported perimeter…';perimeter.clearLayers();
      try{
        let data=perimeterCache.get(p.perimeter_id);if(!data||clock()-Date.parse(data.checked_at)>1800000){data=await request('perimeters',p.perimeter_id);perimeterCache.set(p.perimeter_id,data);if(perimeterCache.size>30)perimeterCache.delete(perimeterCache.keys().next().value);}
        if(requestId!==perimeterRequest)return;
        message.textContent=data.features.length?`${data.stale?'Updates delayed. ':''}Reported boundary; not an evacuation zone. Checked ${time(data.checked_at)}.`:'No reported perimeter is available for this incident.';
        const geometry=L.geoJSON(data,{style:{color:'#ff9c58',weight:2.5,dashArray:'7 4',fillColor:'#ff713d',fillOpacity:0.16},onEachFeature:(feature,layer)=>{const content=el('div',undefined,'hazard-popup');content.append(el('h3',feature.properties.name),el('p','Reported boundary as of '+time(feature.properties.updated_at)),el('p',quantity(feature.properties.acres,' mapped acres')),el('p','Not an evacuation zone or a prediction of spread.'));layer.bindPopup(content);}});
        perimeter.addLayer(geometry);if(!replay&&get('layer-fires').checked){perimeter.addTo(map);const bounds=geometry.getBounds();if(bounds.isValid())map.fitBounds(bounds,{padding:[45,70],maxZoom:11});}
      }catch(error){if(requestId===perimeterRequest)message.textContent='Perimeter unavailable. '+error.message;}
      finally{button.disabled=false;}
    };box.append(button,message);}
    return box;
  }
  function airPopup(f){
    const p=f.properties,box=el('div',undefined,'hazard-popup'),category=aqiCategory(p.aqi);
    box.append(el('h3',p.name),el('p',`PM2.5 AQI: ${quantity(p.aqi,'')} · ${category.label}`),el('p',`PM2.5: ${quantity(p.pm25,' µg/m³')}`),el('p',`Observed ${time(p.observed_at)}`));
    if(!observationFresh(f,clock()))box.append(el('p','Observation is missing, over 3 hours old, or has an invalid future timestamp.'));
    if(isDelayed('air'))box.append(el('p','Collection is delayed.'));
    box.append(el('p',`${p.agency} · ${p.monitor_type} · ${p.status}`,'small'),el('p','An observation at this monitor, not a forecast or an estimate at your address.'));
    return box;
  }
  function fireIcon(f){
    const size=fireSymbolSize(f.properties.acres,{zoom:map.getZoom?.()??9}),unknown=f.properties.acres==null;
    const display=fireDisplay(f.properties,clock());
    return L.divIcon({className:'fire-symbol'+display.className+(unknown?' fire-size-unknown':''),iconSize:[size,size],iconAnchor:[size/2,size],popupAnchor:[0,-size],html:'<svg viewBox="0 0 32 36" aria-hidden="true"><path d="M17 2C19 11 27 12 28 22C29 30 23 34 16 34C8 34 3 29 4 22C4 17 8 13 11 10C10 17 13 18 14 17C18 14 16 8 17 2Z"/><path class="fire-core" d="M16 19C18 23 22 24 21 28C20 32 12 32 11 28C10 24 14 22 16 19Z"/>'+(f.properties.contained===100?'<path class="fire-contained-mark" d="m10 23 4 4 9-10"/>':'')+'</svg>'});
  }
  const fireTitle=f=>`${f.properties.name} · ${quantity(f.properties.acres,' acres')} · ${fireDisplay(f.properties,clock()).label}`;
  function updateFireIcons(){layers.fires?.eachLayer?.(layer=>{if(layer.feature){layer.options.title=fireTitle(layer.feature);layer.setIcon(fireIcon(layer.feature));}});}
  map.on?.('zoomend',updateFireIcons);
  function draw(kind){
    if(!state[kind].data)return;
    if(kind==='satellite'){
      const date=state.satellite.data.date;
      if(satelliteDate!==date){if(layers.satellite)map.removeLayer(layers.satellite);satelliteDate=date;satelliteErrors=0;
        // NASA documents EPSG:4326 WMS with EPSG:3857 requests for vector products.
        layers.satellite=L.tileLayer.wms('https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi',{layers:SATELLITE_LAYER,format:'image/png',transparent:true,version:'1.1.1',time:date,tileSize:256,opacity:0.9,attribution:'NASA FIRMS / GIBS · '+date+' UTC'});
        layers.satellite.on('loading',()=>{satelliteErrors=0;}).on('tileerror',()=>{satelliteErrors++;status('satellite');}).on('load',()=>status('satellite'));
      }
    }else if(kind==='aqi'){
      if(layers.aqi)map.removeLayer(layers.aqi);
      layers.aqi=L.geoJSON(state.aqi.data,{pane:'aqiContours',style:f=>({color:observationFresh(f,clock())?f.properties.color:'#8b8b93',weight:0.6,opacity:0.5,fillOpacity:isDelayed('aqi')?0.14:0.28,dashArray:observationFresh(f,clock())?null:'3 4'}),onEachFeature:(f,layer)=>{
        const p=f.properties,box=el('div',undefined,'hazard-popup');box.append(el('h3',`PM2.5 AQI · ${p.label}`),el('p',`AQI band ${p.range}. Valid ${time(p.observed_at)}.`),el('p','EPA interpolated regional estimate, not a measurement at every address. Boundaries are generalized for the map; unshaded areas have no contour coverage.'));
        if(!observationFresh(f,clock())||isDelayed('aqi'))box.append(el('p','Source or collection is delayed; inspect the timestamps.'));
        layer.bindPopup(box);
      }});
    }else{
      if(layers[kind])map.removeLayer(layers[kind]);
      layers[kind]=L.geoJSON(state[kind].data,{pointToLayer:(f,latlng)=>{
        if(kind==='fires'){
          return L.marker(latlng,{icon:fireIcon(f),title:fireTitle(f),alt:'Reported wildfire'});
        }
        return L.circleMarker(latlng,{radius:5,weight:1.5,color:'#18242d',fillColor:observationFresh(f,clock())?aqiCategory(f.properties.aqi).color:'#8b8b93',fillOpacity:0.95});
      },onEachFeature:(f,layer)=>layer.bindPopup(()=>kind==='fires'?firePopup(f):airPopup(f))});
      if(kind==='fires')renderFires();
    }
    sync();
  }
  function sync(){for(const kind of Object.keys(sources)){const enabled=get('layer-'+kind).checked&&!replay;if(layers[kind]){if(enabled)layers[kind].addTo(map);else map.removeLayer(layers[kind]);}}
    if(replay||!get('layer-fires').checked)map.removeLayer(perimeter);else if(perimeter.getLayers().length)perimeter.addTo(map);
    get('hazard-replay').hidden=!replay;get('fire-browser').hidden=!get('layer-fires').checked||replay;
    get('aqi-map-key').hidden=!get('layer-aqi').checked||replay;
    get('fire-map-key').hidden=!get('layer-fires').checked||replay;
  }
  function focusFire(f){if(replay)return;const [lon,lat]=f.geometry.coordinates;window.WeatherMap.focus(lat,lon);L.popup().setLatLng([lat,lon]).setContent(firePopup(f)).openOn(map);}
  function renderFires(){
    const data=state.fires.data;if(!data)return;const query=get('fire-search').value.trim().toLowerCase();
    const matches=data.features.filter(f=>[f.properties.name,f.properties.state,f.properties.county].join(' ').toLowerCase().includes(query)).sort((a,b)=>(Date.parse(b.properties.updated_at)||0)-(Date.parse(a.properties.updated_at)||0));
    get('fire-count').textContent=`${matches.length} matching incidents · showing ${Math.min(matches.length,50)} most recently updated records`;
    get('fire-list').replaceChildren(...matches.slice(0,50).map(f=>{const button=el('button',undefined,'fire-choice');button.append(el('strong',f.properties.name),el('span',fireSummary(f)),el('span','Updated '+time(f.properties.updated_at)));button.onclick=()=>focusFire(f);return button;}));
  }
  function renderPlace(){
    if(!place)return;const nodes=[];
    for(const kind of ['fires','air']){
      const s=state[kind],box=el('div',undefined,'hazard-nearby');box.append(el('h3',kind==='fires'?'Reported fires within 100 km':'Closest recent PM2.5 monitor within 50 km'));
      if(!s.data)box.append(el('p',s.error?'Data unavailable. '+s.error:'Loading observations…'));
      else{
        if(isDelayed(kind))box.append(el('p','Collection is delayed; these are the last available records.','warning-note'));
        const matches=nearest(kind==='air'?s.data.features.filter(f=>observationFresh(f,clock())&&f.properties.aqi!==null):s.data.features,place,{limit:kind==='fires'?3:1,maxKm:kind==='fires'?100:50});
        if(!matches.length)box.append(el('p',kind==='fires'?'No incident points found within 100 km in the available feed. This does not rule out fires.':'No recent monitor measurement available within 50 km. Air quality here is unknown.'));
        for(const f of matches){const p=f.properties;box.append(el('p',`${p.name} · ${f.distance_km.toFixed(1)} km away`));
          if(kind==='fires')box.append(el('p',`${quantity(p.acres,' acres')} · ${quantity(p.contained,'% contained')} · record updated ${time(p.updated_at)}`,'small'));
          else{const category=aqiCategory(p.aqi),reading=el('p',`AQI ${p.aqi} · ${category.label}`,'aqi-value');reading.style.color=category.color;box.append(reading,el('p',`PM2.5 ${quantity(p.pm25,' µg/m³')} · observed ${time(p.observed_at)}`,'small'));}
        }
        box.append(el('p',`${s.data.source} · checked ${time(s.data.checked_at)}`,'small'));
      }nodes.push(box);
    }get('place-hazards').replaceChildren(...nodes);
  }
  for(const kind of Object.keys(sources))get('layer-'+kind).onchange=()=>{sync();if(get('layer-'+kind).checked)load(kind);};
  get('fire-search').oninput=renderFires;
  window.WeatherHazards={
    snapshot(kind){const s=state[kind];return s?.data?{...s.data,stale:isDelayed(kind),error:s.error||s.data.error||null}:null;},
    updatePlace(value){place=value;window.WeatherFirms?.updatePlace(value);renderPlace();window.WeatherAirTrends?.refresh();if(place){load('fires');load('air');}},
    setReplay(value){window.WeatherSmokeMap?.setReplay(value);window.WeatherFirms?.setReplay(value);replay=value;perimeterRequest++;map.closePopup();sync();},
    showMap(value){window.WeatherSmokeMap?.setVisible(value);get('hazard-workspace').hidden=!value;},
  };
  window.setInterval(()=>{if(document.hidden||replay)return;for(const kind of Object.keys(sources)){if(get('layer-'+kind).checked||(place&&['fires','air'].includes(kind)))load(kind);status(kind);}if(state.air.data)draw('air');if(state.aqi.data)draw('aqi');updateFireIcons();renderPlace();},60000);
  for(const band of AQI_BANDS){const item=el('span',`${band.range} ${band.label}`),swatch=el('i');swatch.style.background=band.color;item.append(swatch);get('aqi-map-bands').append(item);}
  sync();window.WeatherHazards.showMap(!get('map-workspace').hidden);window.WeatherHazards.updatePlace(window.WeatherPersonal?.current());
  return {load,state};
}
if(typeof window!=='undefined'){
  const start=()=>mountHazards({document,window,L:window.L});
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
}
