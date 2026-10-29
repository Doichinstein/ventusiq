import {smokePoint} from './smoke-core.mjs';
import {hrrrTemperatureView} from './hrrr-temperature-core.mjs';
export function mountHrrrTemperature({document,window,fetcher=fetch,clock=Date.now}){
  const get=id=>document.getElementById(id),el=(tag,text)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;return n;};
  const hosted=window.WEATHER_CONFIG?.mode==='hosted',fmt=t=>new Date(t).toLocaleString(undefined,{timeZoneName:'short'});
  let point=null,identity=null,generation=0,busy=false,product=null,report=null;
  function clear(){product=null;report=null;get('hrrr-temp-results').replaceChildren();get('hrrr-temp-export').disabled=true;}
  function updatePlace(place,scope=0){
    const key=JSON.stringify([place?.id,place?.lat,place?.lon,scope]);if(key===identity)return;identity=key;generation++;busy=false;clear();point=null;
    let error=null;if(place)try{point=smokePoint(place.lat,place.lon);}catch{error='HRRR temperature currently covers the contiguous United States.';}
    get('hrrr-temp-load').disabled=!hosted||!point;get('hrrr-temp-status').textContent=error||(point?'Load an identified model run for this place.':'Select a saved place.');
  }
  function render(){
    if(!product)return;report=hrrrTemperatureView(product,point,clock());const r=report;
    get('hrrr-temp-status').textContent=`${r.collection_recent?'Available collection':'Retained forecast; updates delayed'} · run ${fmt(r.issued_at)} (${r.run_age_hours.toFixed(1)} hours old), checked ${fmt(r.checked_at)}.${product.error?' '+product.error:''}`;
    const nodes=[el('p',`${r.available_hours}/48 upcoming hourly samples. Nearest native 3 km grid cell: ${r.cell.lat.toFixed(4)}, ${r.cell.lon.toFixed(4)}; ${Math.round(r.cell.projection_distance_m)} m projected distance from the rounded point. Lead hours start at the model initialization, not collection.`)];
    const values=r.rows.filter(x=>x.temperature_f!==null).map(x=>x.temperature_f);
    if(values.length){
      const ns='http://www.w3.org/2000/svg',svg=document.createElementNS(ns,'svg');svg.setAttribute('viewBox','0 0 640 200');svg.setAttribute('role','img');svg.setAttribute('aria-label','HRRR 2 metre temperature forecast in Fahrenheit. Missing hours are empty. Exact values, run lead hours and gaps are in the table.');
      const lo=Math.floor(Math.min(...values))-2,hi=Math.ceil(Math.max(...values))+2,y=v=>155-(v-lo)/(hi-lo)*125;
      const add=(tag,attrs,text)=>{const n=document.createElementNS(ns,tag);for(const [k,v] of Object.entries(attrs))n.setAttribute(k,String(v));if(text!==undefined)n.textContent=text;svg.append(n);};
      for(const v of [lo,(lo+hi)/2,hi]){add('line',{x1:55,x2:620,y1:y(v),y2:y(v),class:'chart-grid'});add('text',{x:4,y:y(v)+4},v.toFixed(0)+'°F');}
      r.rows.forEach((row,i)=>{if(row.temperature_f!==null)add('circle',{cx:55+i/47*565,cy:y(row.temperature_f),r:3,fill:'#88baff'});});
      add('text',{x:55,y:186},'HRRR · hourly temperature');add('text',{x:620,y:186,'text-anchor':'end'},'Next 48 hours');const chart=el('div');chart.className='river-chart';chart.append(svg);nodes.push(chart);
    }
    const details=el('details'),table=el('table'),head=el('thead'),tr=el('tr');table.className='hourly-table';
    for(const title of ['Valid time · browser local','Run lead · hours','Temperature · °F','Coverage'])tr.append(el('th',title));head.append(tr);table.append(head);const body=el('tbody');
    for(const row of r.rows){const line=el('tr');for(const text of [fmt(row.at),row.lead_hours,row.temperature_f===null?'Unknown':row.temperature_f.toFixed(1),row.reason||'Available model sample'])line.append(el('td',String(text)));body.append(line);}table.append(body);const wrap=el('div');wrap.className='hourly-scroll';wrap.append(table);details.append(el('summary','HRRR temperature hours and source coverage'),wrap);nodes.push(details,el('p',r.interpretation));get('hrrr-temp-results').replaceChildren(...nodes);get('hrrr-temp-export').disabled=false;
  }
  async function load(){
    if(!hosted||!point||busy)return;const token=++generation,p={...point};busy=true;get('hrrr-temp-load').disabled=true;get('hrrr-temp-status').textContent='Reading the HRRR temperature archive…';
    try{const response=await fetcher('/api/forecast/hrrr-temperature?'+new URLSearchParams({lat:p.lat,lon:p.lon}),{signal:AbortSignal.timeout(60000)}),data=await response.json();if(token!==generation)return;if(!response.ok)throw Error(data.error||'HRRR unavailable');hrrrTemperatureView(data,p,clock());product=data;render();}
    catch(error){if(token!==generation)return;if(product){product={...product,stale:true,error:error.message};render();}else{clear();get('hrrr-temp-status').textContent='HRRR temperature unavailable: '+error.message;}}
    finally{if(token===generation){busy=false;get('hrrr-temp-load').disabled=false;}}
  }
  get('hrrr-temp-controls').hidden=!hosted;get('hrrr-temp-load').onclick=load;get('hrrr-temp-export').onclick=()=>{render();if(!report)return;const url=window.URL.createObjectURL(new Blob([JSON.stringify(report,null,2)],{type:'application/json'})),a=el('a');a.href=url;a.download='ventusiq-hrrr-temperature.json';a.click();window.setTimeout(()=>window.URL.revokeObjectURL(url),1000);};
  window.WeatherHrrrTemperature={updatePlace};const context=window.WeatherPersonal?.context();updatePlace(context?.place||null,context?.scope_generation||0);window.setInterval(()=>{if(product&&!busy)render();},60000);return {load,updatePlace};
}
if(typeof window!=='undefined'){const start=()=>mountHrrrTemperature({document,window});if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();}
