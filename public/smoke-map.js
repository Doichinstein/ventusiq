import {loadSmokeCatalog} from './smoke-core.mjs';
import {smokeMapTimeline,loadSmokeFrame,SMOKE_MAP_BOUNDS,SMOKE_BANDS,SMOKE_MAP_METHOD} from './smoke-map-core.mjs';

export function mountSmokeMap({document,window,L,fetcher=fetch,clock=Date.now,frameLoader=loadSmokeFrame}){
  const get=id=>document.getElementById(id),map=window.WeatherMap.instance;
  const el=(tag,text)=>{const n=document.createElement(tag);n.textContent=text;return n;};
  let catalog=null,timeline=null,index=0,overlay=null,playing=false,timer=null,frameToken=0,catalogToken=0,frameAbort=null,catalogAbort=null,pending=false,framePending=false;
  let replay=window.WeatherMap.isReplay(),visible=!get('map-workspace').hidden,shown=null;
  const cache=new Map(),active=()=>get('layer-smoke').checked&&!replay&&visible&&!document.hidden;
  const utc=t=>new Date(t).toISOString().slice(0,16).replace('T',' ')+' UTC';
  const pane=map.getPane('smokeForecast')||map.createPane('smokeForecast');pane.style.zIndex='350';pane.style.pointerEvents='none';
  function controls(){
    const enabled=get('layer-smoke').checked;get('smoke-map-controls').hidden=!enabled;
    get('smoke-map-hour').disabled=!active()||!timeline||pending;get('smoke-map-hour').value=String(index);
    get('smoke-map-play').disabled=!active()||!timeline||pending;get('smoke-map-play').textContent=playing?'Pause':'Play hourly forecast';
    get('smoke-map-refresh').disabled=pending;get('smoke-map-export').disabled=!timeline||!shown||framePending;
    const frame=timeline?.frames[index];get('smoke-map-time').textContent=frame?`${utc(frame.at)} · ${new Date(frame.at).toLocaleString()} local${frame.raster?'':' · no raster available'}`:'No forecast selected';
  }
  function status(message){get('smoke-map-status').textContent=message;get('smoke-map-badge').hidden=!active();get('smoke-map-badge').textContent=message;}
  function stop(){playing=false;if(timer!==null)window.clearTimeout(timer);timer=null;controls();}
  function clearOverlay(){frameToken++;frameAbort?.abort();frameAbort=null;if(overlay)map.removeLayer(overlay);overlay=null;shown=null;framePending=false;}
  function clearCache(){for(const item of cache.values())window.URL.revokeObjectURL(item.url);cache.clear();}
  function suspend(){stop();clearOverlay();catalogToken++;catalogAbort?.abort();catalogAbort=null;pending=false;get('smoke-map-badge').hidden=true;controls();}
  function schedule(){if(!playing||!active())return;if(index>=47){stop();return;}timer=window.setTimeout(()=>{timer=null;index++;draw();},1500);}
  function frameStatus(){
    const fresh=smokeMapTimeline(catalog,clock()).fresh,frame=timeline.frames[index];
    return `${fresh?'':'Updates delayed · '}RAP smoke forecast for ${utc(frame.at)}. Run ${utc(timeline.issued_at)}. ${timeline.frames.filter(f=>f.raster).length}/48 hours available. Official alert layers retain their own valid times.`;
  }
  async function draw(){
    clearOverlay();controls();if(!active()||!timeline)return;
    const frame=timeline.frames[index],token=frameToken;
    if(!frame?.raster){status(`Smoke forecast unavailable for ${utc(frame.at)}. No image is shown; this does not mean no smoke.`);schedule();return;}
    framePending=true;status(`Loading smoke forecast for ${utc(frame.at)}…`);controls();frameAbort=new AbortController();
    try{
      const key=timeline.issued_at+'/'+frame.at+'/'+frame.raster.objectid;
      let item=cache.get(key);
      if(!item){const image=await frameLoader(frame,timeline.issued_at,fetcher,AbortSignal.any([frameAbort.signal,AbortSignal.timeout(25000)]));if(token!==frameToken||!active())return;
        item={...image,url:window.URL.createObjectURL(image.blob),source_url:image.url,loaded_at:new Date(clock()).toISOString()};cache.set(key,item);
        while(cache.size>6){const oldest=cache.keys().next().value;window.URL.revokeObjectURL(cache.get(oldest).url);cache.delete(oldest);}
      }
      if(token!==frameToken||!active())return;
      overlay=L.imageOverlay(item.url,item.bounds,{pane:'smokeForecast',opacity:0,interactive:false,attribution:'NOAA / NWS · RAP smoke forecast',alt:'Modeled near-surface smoke at '+utc(frame.at)});
      const selected=overlay;
      overlay.on('load',()=>{if(token!==frameToken||!active())return;framePending=false;shown={...item,blob:undefined,url:undefined};selected.setOpacity(Number(get('smoke-map-opacity').value)/100);status(frameStatus());controls();schedule();});
      overlay.on('error',()=>{if(token!==frameToken)return;clearOverlay();stop();status('Smoke image could not be displayed. Coverage is unknown; refresh to retry.');controls();});
      overlay.addTo(map);
    }catch(error){if(token!==frameToken)return;framePending=false;stop();status('Smoke forecast unavailable. '+error.message);controls();}
  }
  async function refresh(){
    if(!active()||pending)return;stop();clearOverlay();clearCache();pending=true;controls();status('Checking the latest NOAA smoke run…');const token=++catalogToken;catalogAbort=new AbortController();
    try{
      let result;
      const signal=AbortSignal.any([catalogAbort.signal,AbortSignal.timeout(50000)]);
      if(window.WEATHER_CONFIG?.mode==='hosted'){const r=await fetcher('/api/smoke/catalog',{signal});result=await r.json();if(!r.ok)throw Error(result.error||'Smoke catalog unavailable');}
      else result={...await loadSmokeCatalog(fetcher,signal),checked_at:new Date(clock()).toISOString()};
      if(token!==catalogToken)return;catalog=result;timeline=smokeMapTimeline(result,clock());index=0;
    }catch(error){if(token!==catalogToken)return;timeline=null;status('Smoke forecast unavailable. '+error.message);}
    finally{if(token===catalogToken){pending=false;controls();if(timeline&&active())draw();}}
  }
  function sync(){
    stop();
    if(!active()){suspend();status(replay?'Smoke forecasts are hidden during historical alert replay. Return to Live to restore them.':'Enable to view NOAA RAP forecast smoke.');return;}
    if(!timeline||!catalog?.checked_at||clock()-Date.parse(catalog.checked_at)>3600000)refresh();else draw();
  }
  get('layer-smoke').onchange=()=>{sync();if(!get('layer-smoke').checked)clearCache();};
  get('smoke-map-hour').oninput=()=>{const selected=Number(get('smoke-map-hour').value)||0;stop();index=Math.max(0,Math.min(47,selected));draw();};
  get('smoke-map-play').onclick=()=>{if(playing){stop();return;}if(!active()||!timeline||pending)return;playing=true;if(index>=47)index=0;controls();draw();};
  get('smoke-map-refresh').onclick=refresh;
  get('smoke-map-opacity').oninput=()=>{const value=Math.max(10,Math.min(90,Number(get('smoke-map-opacity').value)||55));get('smoke-map-opacity-value').textContent=value+'%';overlay?.setOpacity(value/100);};
  get('smoke-map-fit').onclick=()=>map.fitBounds(SMOKE_MAP_BOUNDS,{padding:[30,70]});
  get('smoke-map-export').onclick=()=>{if(!shown||!timeline)return;const body={method:SMOKE_MAP_METHOD,exported_at:new Date(clock()).toISOString(),issued_at:timeline.issued_at,valid_at:timeline.frames[index].at,fresh:smokeMapTimeline(catalog,clock()).fresh,checked_at:catalog.checked_at,frame:shown,bands:SMOKE_BANDS,raw_unit:'kg/m³',conversion_factor:1e9,unit:'µg/m³',temporal_semantics:'instantaneous',height_m:8,pixels_archived:false,catalog};
    const url=window.URL.createObjectURL(new Blob([JSON.stringify(body,null,2)],{type:'application/json'})),a=el('a','');a.href=url;a.download='ventusiq-smoke-map.json';a.click();window.setTimeout(()=>window.URL.revokeObjectURL(url),1000);};
  get('smoke-map-legend').replaceChildren(...SMOKE_BANDS.map((b,i)=>{const item=el('span',i===SMOKE_BANDS.length-1?'100+':`${b.min}–<${b.max}`),swatch=el('i','');swatch.style.backgroundColor=`rgb(${b.color.join(',')})`;item.append(swatch);return item;}));
  document.addEventListener('visibilitychange',sync);
  window.setInterval(()=>{if(active()&&!pending&&(!catalog||clock()-Date.parse(catalog.checked_at)>3600000))refresh();},60000);
  window.WeatherSmokeMap={setReplay(value){replay=value;sync();},setVisible(value){visible=value;sync();}};
  sync();return {refresh,draw,sync,snapshot:()=>({timeline,index,shown,playing,pending,cache_size:cache.size})};
}
if(typeof window!=='undefined'){const start=()=>mountSmokeMap({document,window,L:window.L});if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();}
