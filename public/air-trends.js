import {airTrend,loadAirHistory,monitorId,HOUR} from './air-trends-core.mjs';
import {nearest,aqiCategory} from './hazards-core.mjs';
export function mountAirTrends({document,window,fetcher=fetch,clock=Date.now}){
  const get=id=>document.getElementById(id),el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
  const cache=new Map();let key=null,options=[],monitor=null,product=null,report=null,generation=0,pending=false,next=0;
  const number=(n,unit='')=>n===null||n===undefined?'Unknown':n.toLocaleString(undefined,{maximumFractionDigits:1})+unit;
  const time=t=>t?new Date(t).toLocaleString(undefined,{month:'short',day:'numeric',hour:'numeric',minute:'2-digit',timeZoneName:'short'}):'unavailable';
  function clear(){report=null;get('air-trend-export').disabled=true;get('air-trend-summary').replaceChildren();get('air-trend-chart').replaceChildren();get('air-trend-table').replaceChildren();get('air-trend-coverage').textContent='';}
  function chart(r){
    const target=get('air-trend-chart');target.replaceChildren();const usable=r.rows.filter(p=>p.pm25!==null);if(!usable.length)return;
    const ns='http://www.w3.org/2000/svg',svg=document.createElementNS(ns,'svg');svg.setAttribute('viewBox','0 0 640 200');svg.setAttribute('role','img');svg.setAttribute('aria-label','Measured PM2.5 concentration during the last 24 hours. Missing readings and gaps over 90 minutes break the line. Exact readings follow in the table.');
    const node=(tag,attrs,text)=>{const n=document.createElementNS(ns,tag);for(const [k,v] of Object.entries(attrs))n.setAttribute(k,String(v));if(text!==undefined)n.textContent=text;svg.append(n);};
    const max=Math.max(5,Math.ceil(r.range.max*1.1)),start=Date.parse(r.window_start),x=t=>55+(Date.parse(t)-start)/(24*HOUR)*565,y=v=>155-v/max*130;
    for(const v of [0,max/2,max]){node('line',{x1:55,x2:620,y1:y(v),y2:y(v),class:'chart-grid'});node('text',{x:5,y:y(v)+4},number(v));}
    let path='',previous=null;for(const p of r.rows){if(p.pm25===null){previous=null;continue;}path+=(previous&&Date.parse(p.at)-Date.parse(previous.at)<=1.5*HOUR?' L':' M')+x(p.at).toFixed(1)+' '+y(p.pm25).toFixed(1);previous=p;}
    node('path',{d:path,class:'chart-observed'});for(const p of usable)node('circle',{cx:x(p.at),cy:y(p.pm25),r:2,fill:'#88baff'});
    node('text',{x:55,y:187},'24 hours ago · µg/m³');node('text',{x:580,y:187},'Now');target.append(svg);
  }
  function render(){
    if(!product||!monitor)return;report=airTrend(product,monitor,clock());const r=report,latest=r.latest,nodes=[];
    get('air-trend-status').textContent=`${r.fresh?'':'Updates or measurements delayed · '}${monitor.properties.name} · ${monitor.distance_km.toFixed(1)} km away · checked ${time(r.checked_at)}${r.error?' · '+r.error:''}`;
    if(latest){nodes.push(el('p',number(latest.pm25,' µg/m³'),'outlook-number'),el('p',`Measured ${time(latest.at)} · reported PM2.5 NowCast AQI ${number(latest.aqi)} · ${aqiCategory(latest.aqi).label}`));}
    else nodes.push(el('p','No monitor readings in the last 24 hours.'));
    const c=r.change_6h;if(c)nodes.push(el('p',`Six-hour endpoint change: ${c.delta>0?'+':''}${number(c.delta,' µg/m³')} (${number(c.previous)} → ${number(c.current)}). ${time(c.from)} to ${time(c.to)}. This does not imply a steady change between readings.`));
    else nodes.push(el('p','Six-hour change unknown: both matching endpoint measurements are required.','small'));
    const mean=r.mean_6_readings;if(mean)nodes.push(el('p',`Mean of six consecutive hourly readings: ${number(mean.mean,' µg/m³')} from ${time(mean.start)} to ${time(mean.end)}. This is not a daily AQI or a personal exposure estimate.`,'small'));
    if(r.range)nodes.push(el('p',`Available readings in this 24-hour window range from ${number(r.range.min)} to ${number(r.range.max,' µg/m³')}. Missing hours may contain higher or lower values.`,'small'));
    const source=el('a','EPA source readings ↗');source.href=r.source_url;source.target='_blank';source.rel='noopener';nodes.push(source);get('air-trend-summary').replaceChildren(...nodes);
    get('air-trend-coverage').textContent=`${r.coverage.usable} usable concentration readings across ${r.coverage.utc_hours_with_measurements} UTC hour bins. Missing, conflicting, non-measured or incompatible records stay unfilled. Times below use your browser timezone. Source layer updated ${time(r.source_updated_at)}.`;
    get('air-trend-table').replaceChildren(...r.rows.slice().reverse().map(p=>{const tr=el('tr');for(const text of [time(p.at),number(p.pm25),number(p.aqi),p.flags.join('; ')||'Preliminary measured reading',p.status])tr.append(el('td',text));return tr;}));
    chart(r);get('air-trend-export').disabled=false;
  }
  async function load(force=false){
    if(!monitor||pending||(!force&&clock()<next))return;const token=++generation,id=monitor.id;pending=true;next=clock()+900000;get('air-trend-refresh').disabled=true;
    if(!product)get('air-trend-status').textContent='Loading hourly air-monitor history…';
    try{const old=cache.get(id);let data,reused=false;if(!force&&old&&clock()-old.at<900000&&!old.data.stale&&!old.data.error&&clock()-Date.parse(old.data.checked_at)<900000){data=old.data;reused=true;next=Math.min(old.at+900000,Date.parse(data.checked_at)+900000);}
      else if(window.WEATHER_CONFIG?.mode==='hosted'){const response=await fetcher('/api/air/history?id='+encodeURIComponent(id),{signal:AbortSignal.timeout(60000)});if(!response.ok)throw Error('History returned HTTP '+response.status);data=await response.json();}
      else{data=await loadAirHistory(id,fetcher);data={...data,checked_at:new Date(clock()).toISOString(),collected_at:new Date(clock()).toISOString(),stale:false};}
      if(token!==generation)return;airTrend(data,monitor,clock());product=data;if(!reused)cache.set(id,{at:clock(),data});if(Number.isFinite(Date.parse(data.checked_at)))next=Math.max(clock()+60000,Math.min(next,Date.parse(data.checked_at)+900000));if(cache.size>12)cache.delete(cache.keys().next().value);if(data.stale||data.error)next=clock()+120000;render();
    }catch(error){if(token!==generation)return;next=clock()+120000;if(product){product={...product,stale:true,error:error.message};render();}else{clear();get('air-trend-status').textContent='Air history unavailable: '+error.message;}}
    finally{if(token===generation){pending=false;get('air-trend-refresh').disabled=false;}}
  }
  function select(id){const selected=options.find(f=>f.id===id);if(!selected)return;generation++;pending=false;monitor=selected;product=null;next=0;clear();get('air-trend-monitor').value=id;return load();}
  function refresh(){
    const place=window.WeatherPersonal?.current?.(),newKey=place?`${place.lat},${place.lon}`:null;
    if(key!==newKey){key=newKey;generation++;pending=false;monitor=null;product=null;options=[];next=0;clear();}
    const snapshot=window.WeatherHazards?.snapshot?.('air');
    options=place&&snapshot?nearest(snapshot.features.filter(f=>{try{return monitorId(f.id)===f.id;}catch{return false;}}),place,{limit:5,maxKm:50}):[];
    get('air-trend-monitor').replaceChildren(...options.map(f=>{const option=el('option',`${f.properties.name} · ${f.distance_km.toFixed(1)} km`);option.value=f.id;return option;}));get('air-trend-monitor').disabled=!options.length;
    if(!options.length){generation++;pending=false;monitor=null;product=null;clear();get('air-trend-refresh').disabled=!place;get('air-trend-status').textContent=!place?'Select a saved place.':!snapshot?'Waiting for the measured-monitor feed.':'No listed measured PM2.5 monitors within 50 km. Local trend coverage is unknown.';return;}
    if(!monitor||!options.some(f=>f.id===monitor.id)){select(options[0].id);return;}
    monitor=options.find(f=>f.id===monitor.id);get('air-trend-monitor').value=monitor.id;load();render();
  }
  get('air-trend-monitor').onchange=()=>select(get('air-trend-monitor').value);get('air-trend-refresh').onclick=()=>{if(monitor)return load(true);refresh();};
  get('air-trend-export').onclick=()=>{render();if(!report)return;const url=window.URL.createObjectURL(new Blob([JSON.stringify(report,null,2)],{type:'application/json'})),a=el('a');a.href=url;a.download='ventusiq-air-history-'+monitor.id+'.json';a.click();window.setTimeout(()=>window.URL.revokeObjectURL(url),1000);};
  window.WeatherAirTrends={refresh};refresh();window.setInterval(()=>{if(!get('personal-workspace').hidden)refresh();},60000);return {refresh,select,load};
}
if(typeof window!=='undefined'){const start=()=>mountAirTrends({document,window});if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();}
