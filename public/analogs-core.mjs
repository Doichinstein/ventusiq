import {analogDiagnostics} from './analog-diagnostics.mjs';
/* Historical weather analogs. Apache-2.0. No network or DOM effects. */
export const DAY=86400000;
export const ANALOG_METHOD='2026-10-29.2';
export const VARIABLES=['high_c','low_c','wind_ms','rain_mm'];
export const RULES=Object.freeze({season_days:30,separation_days:7,max_matches:20,min_matches:10,scales:{high_c:5,low_c:5,wind_ms:3},max_distance:1,max_component:1.5});
const finite=v=>typeof v==='number'&&Number.isFinite(v);
export const dateString=t=>new Date(t).toISOString().slice(0,10);
export function dayTime(date){if(typeof date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(date))return NaN;const t=Date.parse(date+'T00:00:00Z');return Number.isFinite(t)&&dateString(t)===date?t:NaN;}
export function historyWindow(now=Date.now()){
  const d=new Date(now),endYear=d.getUTCFullYear()-(d.getUTCMonth()<3?2:1);
  return {start:`${endYear-9}-01-01`,end:`${endYear}-12-31`,training_end:`${endYear-2}-12-31`,holdout_start:`${endYear-1}-01-01`};
}
export function gridPoint(lat,lon){
  if([lat,lon].some(v=>v===null||String(v).trim()===''||!Number.isFinite(Number(v)))||Math.abs(Number(lat))>90||Math.abs(Number(lon))>180)throw Error('Invalid coordinates');
  const y=Math.round(Number(lat)*2)/2,x=((Math.round(Number(lon)/0.625)*0.625+180)%360+360)%360-180;
  return {lat:y,lon:x,key:`${y.toFixed(3)},${x.toFixed(3)}`,resolution:'0.5° latitude × 0.625° longitude; a regional model grid, not a station at this address'};
}
export function normalizeHistory(raw,window,grid){
  if(raw?.type!=='Feature'||raw.header?.time_standard!=='UTC'||!Array.isArray(raw.header?.sources)||!raw.header.sources.includes('MERRA2'))throw Error('Invalid NASA history source or time standard');
  const xy=raw.geometry?.coordinates;if(!Array.isArray(xy)||!finite(xy[0])||!finite(xy[1])||Math.abs(xy[0]-grid.lon)>0.001||Math.abs(xy[1]-grid.lat)>0.001)throw Error('Invalid NASA history coordinates');
  const names={high_c:['T2M_MAX','C',-100,80],low_c:['T2M_MIN','C',-100,80],wind_ms:['WS10M','m/s',0,150],rain_mm:['PRECTOTCORR','mm/day',0,3000]},params=raw.properties?.parameter;
  for(const [p,unit] of Object.values(names))if(raw.parameters?.[p]?.units!==unit||!params?.[p]||typeof params[p]!=='object')throw Error('Invalid NASA history parameter units');
  const start=dayTime(window.start),end=dayTime(window.end);if(!Number.isFinite(start)||!Number.isFinite(end)||end<start||end-start>3660*DAY)throw Error('Invalid history range');
  const rows=[],missing=Object.fromEntries(VARIABLES.map(k=>[k,0]));
  for(let t=start;t<=end;t+=DAY){const date=dateString(t),key=date.replaceAll('-',''),row={date};for(const [name,[p,,min,max]] of Object.entries(names)){const v=params[p][key];row[name]=finite(v)&&v!==raw.header.fill_value&&v>=min&&v<=max?v:null;}
    if(row.high_c!==null&&row.low_c!==null&&row.low_c>row.high_c){row.high_c=null;row.low_c=null;}
    for(const name of VARIABLES)if(row[name]===null)missing[name]++;rows.push(row);
  }
  if(!rows.some(featureComplete))throw Error('NASA history contains no usable matching days');
  return {rows,missing,expected_days:rows.length,usable_days:rows.filter(featureComplete).length,source_header:raw.header,parameters:raw.parameters,grid,window};
}
function featureComplete(row){return row&&Object.keys(RULES.scales).every(k=>finite(row[k]))&&row.high_c>=row.low_c&&row.wind_ms>=0;}
function windMean(value){
  if(typeof value==='object'&&value){const n=value.value;if(!finite(n)||n<0)return null;return value.unitCode?.endsWith('m_s-1')?n:value.unitCode?.endsWith('km_h-1')?n/3.6:value.unitCode?.endsWith('mi_h-1')?n*0.44704:null;}
  if(typeof value!=='string')return null;if(/^calm$/i.test(value.trim()))return 0;
  const m=value.trim().match(/^(\d+(?:\.\d+)?)(?:\s+to\s+(\d+(?:\.\d+)?))?\s+(mph|km\/h)$/i);if(!m)return null;
  const a=Number(m[1]),b=m[2]===undefined?a:Number(m[2]);if(b<a)return null;return (a+b)/2*(m[3].toLowerCase()==='mph'?0.44704:1/3.6);
}
export function forecastDays(data,now=Date.now()){
  const checked=Date.parse(data?.checked_at),issued=Date.parse(data?.issued_at||data?.forecast?.properties?.updateTime);
  if(data?.stale||data?.error||!Number.isFinite(checked)||checked>now+60000||now-checked>15*60000||!Number.isFinite(issued)||issued>now+60000||now-issued>DAY)return [];
  const groups=new Map();for(const p of data?.forecast?.properties?.periods||[]){const t=Date.parse(p.startTime),end=Date.parse(p.endTime);if(!Number.isFinite(t))continue;const date=dateString(t);if(!groups.has(date))groups.set(date,[]);let temp=finite(p.temperature)?p.temperature:null;temp=temp===null?null:p.temperatureUnit==='C'?temp:p.temperatureUnit==='F'?(temp-32)*5/9:null;groups.get(date).push({t,end,temp,wind:windMean(p.windSpeed)});}
  const days=[];for(const [date,hours] of groups){const start=dayTime(date);if(start<now||start>now+3*DAY||hours.length!==24)continue;hours.sort((a,b)=>a.t-b.t);if(hours.some((h,i)=>h.t!==start+i*3600000||h.end!==h.t+3600000||h.temp===null||h.wind===null))continue;
    days.push({date,high_c:Math.max(...hours.map(h=>h.temp)),low_c:Math.min(...hours.map(h=>h.temp)),wind_ms:hours.reduce((a,h)=>a+h.wind,0)/24,kind:'forecast-derived daily pattern',forecast_revision:data.revision||null,checked_at:data.checked_at,issued_at:new Date(issued).toISOString(),source_url:data.source_url||null,periods:data.forecast.properties.periods.filter(p=>Number.isFinite(Date.parse(p.startTime))&&dateString(Date.parse(p.startTime))===date)});
  }return days.sort((a,b)=>a.date.localeCompare(b.date));
}
function season(date){const t=dayTime(date);if(!Number.isFinite(t))return NaN;const d=new Date(t);return (Date.UTC(2000,d.getUTCMonth(),d.getUTCDate())-Date.UTC(2000,0,1))/DAY;}
export function seasonDistance(a,b){const d=Math.abs(season(a)-season(b));return Math.min(d,366-d);}
export function quantile(values,p){const sorted=values.filter(finite).sort((a,b)=>a-b);if(!sorted.length)return null;const i=(sorted.length-1)*p,lo=Math.floor(i);return sorted[lo]+(sorted[Math.ceil(i)]-sorted[lo])*(i-lo);}
function distribution(rows){return Object.fromEntries(VARIABLES.map(k=>{const values=rows.map(r=>r?.[k]).filter(finite);return [k,{n:values.length,p10:quantile(values,0.1),median:quantile(values,0.5),p90:quantile(values,0.9)}];}));}
function prepare(rows){const byDate=new Map(rows.map(r=>[r.date,r]));return rows.map(row=>{const t=dayTime(row.date);return {row,t,phase:season(row.date),outcome:Number.isFinite(t)?byDate.get(dateString(t+DAY))||{date:dateString(t+DAY)}:{}};});}
function selectPrepared(index,target,cutoff){
  const targetAt=dayTime(target.date),cutoffAt=dayTime(cutoff);if(!featureComplete(target)||!Number.isFinite(targetAt)||!Number.isFinite(cutoffAt))throw Error('Invalid analog target');
  const phase=season(target.date),pool=[],candidates=[];
  for(const {row,t,phase:p,outcome} of index){const delta=Math.abs(p-phase);if(!Number.isFinite(t)||t+2*DAY>cutoffAt||targetAt-t<7*DAY||!featureComplete(row)||Math.min(delta,366-delta)>RULES.season_days)continue;
    pool.push(outcome);
    const components=Object.fromEntries(Object.entries(RULES.scales).map(([k,scale])=>[k,(row[k]-target[k])/scale]));const distance=Math.sqrt(Object.values(components).reduce((a,v)=>a+v*v,0)/3);
    if(distance<=RULES.max_distance&&Object.values(components).every(v=>Math.abs(v)<=RULES.max_component))candidates.push({date:row.date,distance,differences:Object.fromEntries(Object.keys(RULES.scales).map(k=>[k,row[k]-target[k]])),conditions:row,outcome});
  }
  candidates.sort((a,b)=>a.distance-b.distance||a.date.localeCompare(b.date));const matches=[];
  for(const c of candidates){if(matches.every(m=>Math.abs(dayTime(m.date)-dayTime(c.date))>=RULES.separation_days*DAY))matches.push(c);if(matches.length===RULES.max_matches)break;}
  return {target,cutoff,seasonal_candidates:pool.length,close_candidates:candidates.length,matches,sufficient:matches.length>=RULES.min_matches,outcomes:distribution(matches.map(m=>m.outcome)),seasonal:distribution(pool)};
}
export function selectAnalogs(rows,target,cutoff=target.date){return selectPrepared(prepare(rows),target,cutoff);}
export function holdoutEvaluation(history){
  // Freeze all retrieval at the start of the last two years. Never tune on test outcomes.
  const cutoff=history.window.holdout_start,first=Number(cutoff.slice(0,4)),last=Number(history.window.end.slice(0,4)),byDate=new Map(history.rows.map(r=>[r.date,r])),index=prepare(history.rows),cases=[],trials=[];let attempted=0,missing=0,insufficient=0;
  for(let year=first;year<=last;year++)for(let month=1;month<=12;month++)for(const day of [7,21]){attempted++;const date=`${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`,target=byDate.get(date),actual=byDate.get(dateString(dayTime(date)+DAY));if(!featureComplete(target)||!actual){missing++;trials.push({date,status:'missing'});continue;}const result=selectPrepared(index,target,cutoff);if(!result.sufficient){insufficient++;trials.push({date,status:'insufficient',match_count:result.matches.length});continue;}trials.push({date,status:'evaluated',match_count:result.matches.length});cases.push({date,actual,match_dates:result.matches.map(m=>m.date),prediction:result.outcomes,baseline:result.seasonal,persistence:target});}
  const diagnostics=analogDiagnostics(cases,trials,VARIABLES,RULES.min_matches),metrics=diagnostics.cohorts[0].metrics;
  return {cutoff,attempted,evaluated:cases.length,missing,insufficient,metrics,cases,trials,diagnostics,method:'Fixed 7th and 21st of every month in the last two years; retrieve only from the preceding eight years. Compare next-day medians with seasonal-median and persistence baselines on the same cases. Inputs and outcomes are reanalysis, not archived operational forecasts. This does not validate transfer to NWS forecasts or establish calibrated probabilities.'};
}
export function analogReport(history,target,now=Date.now()){
  const result=selectAnalogs(history.rows,target,dateString(dayTime(history.window.end)+DAY));
  return {method_version:ANALOG_METHOD,rules:RULES,evaluated_at:new Date(now).toISOString(),...result,history:{kind:'reanalysis',provider:'NASA POWER / MERRA-2',issued_at:null,revision:history.revision,checked_at:history.checked_at,collected_at:history.collected_at,source_url:history.source_url,grid:history.grid,window:history.window,source_header:history.source_header,parameters:history.parameters,missing:history.missing,expected_days:history.expected_days,usable_days:history.usable_days,stale:history.stale,error:history.error,records:history.rows},validation:holdoutEvaluation(history)};
}
