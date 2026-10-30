import {gustIntervals} from './planning-core.mjs';
import {journeyGust} from './journey-gust.mjs';

export const STOP_WEATHER_METHOD='2026-10-30.1';
const HOUR=3600000,iso=t=>new Date(t).toISOString();
const finite=n=>typeof n==='number'&&Number.isFinite(n);
const stamp=s=>typeof s==='string'&&/(Z|[+-]\d{2}:\d{2})$/.test(s)?Date.parse(s):NaN;
function temperature(p){
  const t=p.temperature,v=finite(t)?t:t?.value,u=finite(t)?p.temperatureUnit:t?.unitCode;
  return !finite(v)?null:['F','wmoUnit:degF'].includes(u)?v:['C','wmoUnit:degC'].includes(u)?v*1.8+32:null;
}
function wind(raw){
  if(typeof raw==='string'){
    if(/^calm$/i.test(raw.trim()))return 0;
    const m=raw.trim().match(/^(\d+(?:\.\d+)?)(?:\s+to\s+(\d+(?:\.\d+)?))?\s+(mph|km\/h)$/i);
    if(!m||m[2]!==undefined&&Number(m[2])<Number(m[1]))return null;
    return Number(m[2]??m[1])/(m[3].toLowerCase()==='mph'?1:1.609344);
  }
  const scale={'wmoUnit:km_h-1':1/1.609344,'wmoUnit:m_s-1':2.236936,'wmoUnit:mi_h-1':1,'wmoUnit:kn':1.150779}[raw?.unitCode];
  return finite(raw?.value)&&raw.value>=0&&scale?raw.value*scale:null;
}

// Summarize source intervals, not inferred continuous conditions. Split at every
// boundary so a short missing/ambiguous period cannot hide between route samples.
export function stopWeather(forecast,grid,stop,departure,now=Date.now()){
  const start=departure+stop.arrival_elapsed*1000,end=departure+stop.departure_elapsed*1000;
  const base={method:STOP_WEATHER_METHOD,stop_index:stop.index,start:finite(start)?iso(start):null,end:finite(end)?iso(end):null,
    snapped_coordinate:stop.coordinate,duration_minutes:finite(end-start)?(end-start)/60000:null,
    time_zone:forecast?.metadata?.properties?.timeZone||null,complete:false,metrics:{},segments:[],
    source:{point:forecast?.point||null,revision:forecast?.revision||null,checked_at:forecast?.checked_at||null,
      issued_at:forecast?.issued_at||null,url:forecast?.source_url||null,gust_revision:grid?.revision||null},reason:null};
  if(!finite(start)||!finite(end)||start<now||end>now+76*HOUR||end<=start||end-start>2*HOUR)return {...base,reason:'Stop is outside the supported forecast horizon or duration'};
  const coordinate=stop.coordinate,point=Array.isArray(coordinate)&&coordinate.length===2&&coordinate.every(finite)?`${coordinate[1].toFixed(4)},${coordinate[0].toFixed(4)}`:null;
  const expected=forecast?.metadata?.properties?.forecastHourly,checked=stamp(forecast?.checked_at),issued=stamp(forecast?.issued_at);
  let hourlyReason=null;
  if(!forecast||forecast.error||forecast.stale)hourlyReason=forecast?.error||'Hourly forecast unavailable or delayed';
  else if(!finite(checked)||checked>now+60000||now-checked>900000||!finite(issued)||issued>now+60000||now-issued>24*HOUR)hourlyReason='Hourly issue or collection time is missing, delayed or future-dated';
  else if(!point||forecast.point!==point||!/^https:\/\/api\.weather\.gov\/gridpoints\/[A-Z]{3}\/-?\d+,-?\d+\/forecast\/hourly$/.test(expected||'')||forecast.source_url!==expected)hourlyReason='Hourly source does not match the snapped stop point';
  const raw=forecast?.forecast?.properties?.periods;
  if(!Array.isArray(raw)||raw.length>200)hourlyReason='Hourly periods unavailable or oversized';
  const hours=Array.isArray(raw)&&raw.length<=200?raw.map((p,index)=>({start:stamp(p?.startTime),end:stamp(p?.endTime),raw:p,index})):[];
  if(hours.some(p=>!finite(p.start)||!finite(p.end)||p.end<=p.start))hourlyReason='Malformed hourly interval; coverage cannot be established';
  const gusts=gustIntervals(grid),cuts=new Set([start,end]);
  for(const p of [...hours,...gusts])for(const t of [p.start,p.end])if(finite(t)&&start<t&&t<end)cuts.add(t);
  const times=[...cuts].sort((a,b)=>a-b);
  for(let i=1;i<times.length;i++){
    const a=times[i-1],b=times[i],at=a+(b-a)/2,matches=hours.filter(p=>p.start<=at&&p.end>at),hour=matches.length===1?matches[0]:null;
    const reason=hourlyReason||(!hour?(matches.length?'Overlapping hourly periods are ambiguous':'No hourly period covers this interval'):null),p=reason?null:hour.raw;
    const temp=p?temperature(p):null,w=p?wind(p.windSpeed):null,r=p?.probabilityOfPrecipitation?.value;
    const gust=point&&forecast?.point===point?journeyGust(grid,forecast,at,now):{value:null,reason:'Gust location cannot be tied to the snapped stop point'};
    base.segments.push({start:iso(a),end:iso(b),minutes:(b-a)/60000,temperature:temp,wind:w,rain:finite(r)&&r>=0&&r<=100?r:null,gust:gust.value,
      hourly_period_indices:matches.map(p=>p.index),hourly_reason:reason,gust_evidence:gust});
  }
  for(const key of ['temperature','wind','rain','gust']){
    const rows=base.segments.filter(s=>finite(s[key])),covered=rows.reduce((sum,s)=>sum+s.minutes,0),unknown=Math.max(0,base.duration_minutes-covered),complete=unknown<1e-7;
    base.metrics[key]={covered_minutes:covered,unknown_minutes:unknown,complete,
      minimum:complete?Math.min(...rows.map(s=>s[key])):null,maximum:complete?Math.max(...rows.map(s=>s[key])):null};
  }
  base.complete=Object.values(base.metrics).every(m=>m.complete);
  if(!base.complete)base.reason=hourlyReason||'Some intervals or fields are unknown; whole-stop ranges are withheld for those fields';
  return base;
}

export function journeyStopWeather(route,samples,forecasts,grids,departure,now){
  return (route.stops||[]).filter(stop=>stop.duration>0).map(stop=>{
    const i=samples.findIndex(s=>s.stop_index===stop.index);
    return stopWeather(i<0?null:forecasts[i],i<0?null:grids[i],stop,departure,now);
  });
}

export function renderStopWeather(document,journey,format){
  const target=document.getElementById('journey-stop-weather'),rows=journey.weather_stops||[];
  target.hidden=!rows.length;target.replaceChildren();if(!rows.length)return;
  const el=(tag,text)=>{const n=document.createElement(tag);n.textContent=text;return n;},round=n=>Math.round(n*10)/10;
  target.append(el('h3','Weather throughout planned stops'),el('p','Forecast periods at each snapped road point, clipped to the full stop. Ranges describe forecast values, not continuous extremes or measured exposure. Rain chance is not rain duration. Unknown fields keep their whole-stop range withheld.'));
  for(const row of rows){
    const card=el('article','');card.className='plan-window';
    card.append(el('strong',`Via ${row.stop_index} · ${row.duration_minutes} minutes`),el('p',`${format(row.start,row.time_zone)} – ${format(row.end,row.time_zone)}`));
    for(const [key,label,unit] of [['temperature','Temperature','°F'],['wind','Sustained wind',' mph'],['gust','Gust',' mph'],['rain','Rain chance','%']]){
      const m=row.metrics[key],value=m?.complete?(key==='temperature'?`${round(m.minimum)}–${round(m.maximum)}${unit}`:`up to ${round(m.maximum)}${unit}`):'Unknown';
      card.append(el('p',`${label}: ${value} · ${round(m?.covered_minutes||0)}/${row.duration_minutes} minutes covered by forecast periods`));
    }
    if(row.reason)card.append(el('p',row.reason));
    card.append(el('p',`Hourly checked ${row.source.checked_at?format(row.source.checked_at):'unavailable'} · issued ${row.source.issued_at?format(row.source.issued_at):'unavailable'}. Source intervals and gust provenance are included in the evidence download.`));
    target.append(card);
  }
}
