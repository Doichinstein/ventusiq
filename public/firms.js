import {loadFirms,selectFirms} from './firms-core.mjs';
export function mountFirms({document,window,L,fetcher=fetch,clock=Date.now}){
  const get=id=>document.getElementById(id),map=window.WeatherMap.instance;
  const el=(tag,text)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;return n;};
  const time=value=>new Date(value).toLocaleString(undefined,{timeZoneName:'short'}),quantity=(n,unit)=>n==null?'unknown':n+' '+unit;
  let data=null,error=null,pending=null,generation=0,next=0,layer=null,rows=[],selection=null,place=window.WeatherPersonal?.current()||null,replay=window.WeatherMap.isReplay();
  const filters=()=>({hours:Number(get('firms-hours').value),confidence:get('firms-confidence').value,near:get('firms-near').checked,place:place?{...place}:null,now:clock()});
  const delayed=()=>!!(error||data?.stale||!data?.checked_at||clock()-Date.parse(data.checked_at)>1350000);
  function popup(f){const p=f.properties,box=el('div');box.append(el('strong','NOAA-20 thermal detection'),el('p',`Acquired ${time(p.observed_at)} · ${p.daynight==='D'?'day':'night'} overpass`),el('p',`Detection confidence: ${p.confidence}. Fire radiative power: ${quantity(p.frp_mw,'MW')}.`),el('p',`Pixel scan × track: ${quantity(p.scan_km,'km')} × ${quantity(p.track_km,'km')}. I4 / I5 brightness: ${quantity(p.brightness_i4_k,'K')} / ${quantity(p.brightness_i5_k,'K')}.`),el('p',`Checked ${time(data.checked_at)}${delayed()?' · collection delayed':''}. Version ${p.version}.`),el('p','Pixel center, not a fire boundary. Thermal anomalies can include industrial sources or volcanoes. Confidence is detection quality, not a probability of wildfire or local danger.'));return box;}
  function status(){const target=get('firms-status');if(!data){target.textContent=pending?'Loading NASA heat detections…':error?'Heat detections unavailable. '+error:'Enable to load NOAA-20 detections.';return;}
    const newest=data.features.reduce((latest,f)=>Math.max(latest,Date.parse(f.properties.observed_at)),0);
    target.textContent=`${delayed()?'Collection delayed · ':''}${rows.length} matching detections of ${data.features.length} usable source rows. Checked ${time(data.checked_at)}. ${newest?'Newest acquisition '+time(newest)+'.':'No detections in this source file.'} ${data.audit.invalid+data.audit.future+data.audit.conflicting} rejected rows. ${error||''}`;
  }
  function render(){if(layer){map.removeLayer(layer);layer=null;}selection=filters();rows=data?selectFirms(data,selection):[];
    get('firms-export').disabled=!data;get('firms-near').disabled=!place;
    get('firms-place').textContent=place?`Selected place: ${place.name||place.label||'map location'} (${place.lat.toFixed(3)}, ${place.lon.toFixed(3)}).`:'Select a place in My weather to filter within 100 km.';
    get('firms-replay').hidden=!replay;get('firms-results').hidden=replay||!get('layer-firms').checked;
    if(data&&!replay&&get('layer-firms').checked){layer=L.geoJSON({type:'FeatureCollection',features:rows},{pointToLayer:(f,latlng)=>L.circleMarker(latlng,{radius:4,color:'#19191e',weight:1,fillColor:f.properties.confidence==='low'?'#b2a2a0':'#ff704f',fillOpacity:0.85}),onEachFeature:(f,marker)=>marker.bindPopup(()=>popup(f))});layer.addTo(map);}
    get('firms-list').replaceChildren(...rows.slice(0,50).map(f=>{const p=f.properties,b=el('button',`${time(p.observed_at)} · ${p.confidence} · ${quantity(p.frp_mw,'MW')}${f.distance_km==null?'':' · '+f.distance_km.toFixed(1)+' km from place'}`);b.className='fire-choice';b.onclick=()=>{if(replay||!get('layer-firms').checked)return;const [lon,lat]=f.geometry.coordinates;window.WeatherMap.focus(lat,lon);L.popup().setLatLng([lat,lon]).setContent(popup(f)).openOn(map);};return b;}));
    get('firms-count').textContent=rows.length?`Showing ${Math.min(50,rows.length)} ${get('firms-near').checked?'nearest':'most recent'} matching detections; all matches are mapped and exported.`:'No detections match this file and filter. This does not rule out fire; overpass, clouds, file region and delivery gaps limit coverage.';
    status();
  }
  async function load(){if(pending)return pending;if(clock()<next)return;const token=generation,region=get('firms-region').value;next=clock()+900000;
    pending=(async()=>{try{let result;if(window.WEATHER_CONFIG?.mode==='hosted'){const response=await fetcher('/api/hazards/firms?region='+encodeURIComponent(region),{signal:AbortSignal.timeout(50000)});result=await response.json();if(!response.ok)throw Error(result.error||'Source unavailable');}else{result=await loadFirms(region,fetcher,AbortSignal.timeout(45000),clock);result={...result,checked_at:result.retrieved_at,collected_at:result.retrieved_at};}
      if(result.region!==region||result.type!=='FeatureCollection'||!Array.isArray(result.features)||!result.audit||!Number.isFinite(Date.parse(result.checked_at)))throw Error('Incomplete heat-detection response');
      if(token!==generation)return;data=result;error=result.error||null;
    }catch(e){if(token===generation){error=e.message;next=clock()+120000;}}
    finally{if(token===generation){pending=null;render();}}})();status();return pending;
  }
  get('layer-firms').onchange=()=>{render();if(get('layer-firms').checked&&!replay)load();};
  get('firms-region').onchange=()=>{generation++;pending=null;data=null;error=null;next=0;map.closePopup();render();if(get('layer-firms').checked&&!replay)load();};
  for(const id of ['firms-hours','firms-confidence','firms-near'])get(id).onchange=()=>{map.closePopup();render();};
  get('firms-refresh').onclick=()=>{if(!pending){next=0;load();}};
  get('firms-export').onclick=()=>{if(!data)return;render();const report={exported_at:new Date(selection.now).toISOString(),source:data,filters:selection,matching_ids:rows.map(f=>f.id),interpretation:'NOAA-20 thermal detection pixels; not unique fires, confirmed wildfires, burned area, evacuation zones or predicted spread. Raw regional CSV included. A missing detection does not establish absence of fire.'},url=window.URL.createObjectURL(new Blob([JSON.stringify(report,null,2)],{type:'application/json'})),a=el('a');a.href=url;a.download='ventusiq-firms-'+data.region+'.json';a.click();window.setTimeout(()=>window.URL.revokeObjectURL(url),1000);};
  window.WeatherFirms={updatePlace(value){place=value;if(!place)get('firms-near').checked=false;render();},setReplay(value){replay=value;map.closePopup();render();if(!replay&&get('layer-firms').checked)load();}};
  window.setInterval(()=>{if(get('layer-firms').checked&&!replay&&!get('map-workspace').hidden)load();render();},60000);
  render();return {load,render,snapshot:()=>data};
}
if(typeof window!=='undefined'){const start=()=>mountFirms({document,window,L:window.L});if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();}
