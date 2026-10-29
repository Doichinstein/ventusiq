import {smokePoint,loadSmokeCatalog,loadSmokePoint,smokeForecast,SMOKE_SOURCE} from './smoke-core.mjs';
export function mountSmoke({document,window,fetcher=fetch,clock=Date.now}){
  const get=id=>document.getElementById(id),el=(tag,text)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;return n;};
  const time=t=>t?new Date(t).toLocaleString(undefined,{month:'short',day:'numeric',hour:'numeric',minute:'2-digit',timeZoneName:'short'}):'unavailable';
  const number=n=>n===null?'Unknown':n.toLocaleString(undefined,{maximumFractionDigits:1});
  let key=null,point=null,product=null,report=null,generation=0,pending=false,next=0;
  function clear(){report=null;get('smoke-summary').replaceChildren();get('smoke-chart').replaceChildren();get('smoke-table').replaceChildren();get('smoke-export').disabled=true;window.WeatherPlanner?.refresh();}
  function render(){
    if(!product)return;report=smokeForecast(product,clock());const r=report;
    get('smoke-status').textContent=`${r.fresh?'':'Updates delayed · '}RAP run ${time(r.issued_at)} · checked ${time(r.checked_at)}${r.error?' · '+r.error:''}`;
    const nodes=[el('p',`${r.coverage.usable} of the next 48 hourly forecast times have usable values. Unavailable hours stay unknown.`),el('p',`Sampled near ${r.point.lat.toFixed(2)}, ${r.point.lon.toFixed(2)}; location rounded to 0.01° for the shared cache. Grid values may differ from conditions at your address.`)];
    if(r.range)nodes.unshift(el('p',`Modeled smoke ranges from ${number(r.range.min)} to ${number(r.range.max)} µg/m³ at the available future times.`));
    if(!r.fresh)nodes.unshift(el('p','This is the last available forecast; it should not be treated as current planning guidance.'));
    get('smoke-summary').replaceChildren(...nodes);
    get('smoke-table').replaceChildren(...r.rows.map(p=>{const tr=el('tr');for(const text of [time(p.at),number(p.smoke_ug_m3),p.reason||'Modeled instantaneous concentration'])tr.append(el('td',text));return tr;}));
    const target=get('smoke-chart');target.replaceChildren();
    if(r.range){
      const ns='http://www.w3.org/2000/svg',svg=document.createElementNS(ns,'svg');svg.setAttribute('viewBox','0 0 640 200');svg.setAttribute('role','img');svg.setAttribute('aria-label','Modeled near-surface smoke at the next 48 hourly times. Each dot is an instantaneous forecast. Missing hours have no dot. Exact values follow in the table.');
      const node=(tag,attrs,text)=>{const n=document.createElementNS(ns,tag);for(const [k,v] of Object.entries(attrs))n.setAttribute(k,String(v));if(text!==undefined)n.textContent=text;svg.append(n);};
      const max=Math.max(5,Math.ceil(r.range.max*1.1)),y=v=>155-v/max*130;
      for(const v of [0,max/2,max]){node('line',{x1:55,x2:620,y1:y(v),y2:y(v),class:'chart-grid'});node('text',{x:5,y:y(v)+4},number(v));}
      r.rows.forEach((p,i)=>{if(p.smoke_ug_m3!==null)node('circle',{cx:55+i/47*565,cy:y(p.smoke_ug_m3),r:3,fill:'#e8bd7c'});});
      node('text',{x:55,y:187},'Next hour · µg/m³');node('text',{x:540,y:187},'+48 hours');target.append(svg);
    }
    get('smoke-export').disabled=false;window.WeatherPlanner?.refresh();
  }
  async function load(force=false){
    if(!point||pending||(!force&&clock()<next))return;const token=++generation,selected={...point};pending=true;next=clock()+3600000;get('smoke-refresh').disabled=true;
    if(!product)get('smoke-status').textContent='Loading NOAA smoke forecasts…';
    try{
      let data;
      if(window.WEATHER_CONFIG?.mode==='hosted'){
        const response=await fetcher(`/api/smoke/forecast?lat=${selected.lat}&lon=${selected.lon}`,{signal:AbortSignal.timeout(60000)});if(!response.ok){let message='Smoke forecast returned HTTP '+response.status;try{message=(await response.json()).error||message;}catch{}throw Error(message);}data=await response.json();
      }else{
        const signal=AbortSignal.timeout(45000),catalog=await loadSmokeCatalog(fetcher,signal);data=await loadSmokePoint(selected,catalog,fetcher,signal,clock());data={...data,checked_at:new Date(clock()).toISOString(),stale:false};
      }
      if(token!==generation)return;
      if(data.point?.lat!==selected.lat||data.point?.lon!==selected.lon)throw Error('Smoke response does not match the selected place');
      smokeForecast(data,clock());product=data;
      if(Number.isFinite(Date.parse(data.checked_at)))next=Math.max(clock()+60000,Math.min(next,Date.parse(data.checked_at)+3600000));
      if(data.stale||data.error)next=clock()+120000;render();
    }catch(error){if(token!==generation)return;next=clock()+120000;if(product){product={...product,stale:true,error:error.message};render();}else{clear();get('smoke-status').textContent='Smoke forecast unavailable: '+error.message;}}
    finally{if(token===generation){pending=false;get('smoke-refresh').disabled=false;}}
  }
  function refresh(){
    const place=window.WeatherPersonal?.current?.();let selected=null,error=null;
    if(place)try{selected=smokePoint(place.lat,place.lon);}catch(e){error=e.message;}
    const newKey=selected?`${selected.lat},${selected.lon}`:null;
    if(key!==newKey){key=newKey;point=selected;generation++;pending=false;product=null;next=0;clear();}
    if(!selected){get('smoke-refresh').disabled=true;get('smoke-status').textContent=error||'Select a saved place.';return;}
    load();if(product)render();
  }
  get('smoke-source').href=SMOKE_SOURCE;
  get('smoke-refresh').onclick=()=>load(true);
  get('smoke-export').onclick=()=>{render();if(!report)return;const url=window.URL.createObjectURL(new Blob([JSON.stringify(report,null,2)],{type:'application/json'})),a=el('a');a.href=url;a.download='ventusiq-smoke-forecast.json';a.click();window.setTimeout(()=>window.URL.revokeObjectURL(url),1000);};
  window.WeatherSmoke={refresh,snapshot:()=>product};refresh();window.setInterval(()=>{if(!get('personal-workspace').hidden)refresh();},60000);return {refresh,load};
}
if(typeof window!=='undefined'){const start=()=>mountSmoke({document,window});if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();}
