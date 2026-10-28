/* Observed conditions and retrospective temperature comparisons. Apache-2.0. */
import {distanceKm,validPoint} from './hazards-core.mjs';
export const HOUR=3600000;
const finite=n=>typeof n==='number'&&Number.isFinite(n)?n:null;
export function stationId(value){const id=String(value||'').toUpperCase();if(!/^[A-Z0-9]{3,8}$/.test(id))throw Error('Invalid station identifier');return id;}
export function quantity(q,kind){
  const n=finite(q?.value),u=q?.unitCode?.split(':').at(-1);if(n===null)return null;
  if(kind==='temperature')return u==='degC'?n*9/5+32:u==='degF'?n:null;
  if(kind==='wind')return n<0?null:u==='km_h-1'?n/1.609344:u==='m_s-1'?n*2.2369362921:u==='mi_h-1'?n:u==='kn'?n*1.150779448:null;
  return null;
}
export function nearbyStations(collection,lat,lon){
  const found=new Map();
  for(const f of collection.features||[]){if(!validPoint(f.geometry))continue;const p=f.properties||{};let id;try{id=stationId(p.stationIdentifier);}catch{continue;}
    const [x,y]=f.geometry.coordinates,distance=distanceKm(lat,lon,y,x);if(distance>50)continue;
    found.set(id,{id,name:p.name||id,lat:y,lon:x,distance_km:distance,time_zone:p.timeZone||null,elevation_m:p.elevation?.unitCode==='wmoUnit:m'?finite(p.elevation.value):null,source_url:'https://api.weather.gov/stations/'+id});
  }
  return [...found.values()].sort((a,b)=>a.distance_km-b.distance_km||a.id.localeCompare(b.id)).slice(0,10);
}
export function observations(collection,now=Date.now()){
  const found=new Map();for(const f of collection.features||[]){const p=f.properties||{},at=Date.parse(p.timestamp);if(!Number.isFinite(at)||at>now)continue;
    const row={id:f.id,at,temperature:quantity(p.temperature,'temperature'),temperature_qc:p.temperature?.qualityControl||'Unknown',wind:quantity(p.windSpeed,'wind'),wind_qc:p.windSpeed?.qualityControl||'Unknown',gust:quantity(p.windGust,'wind'),gust_qc:p.windGust?.qualityControl||'Unknown',description:p.textDescription||''};
    // Never infer that missing gusts mean calm. Failed QC readings remain unavailable.
    for(const key of ['temperature','wind','gust'])if(['X','Q','B'].includes(row[key+'_qc']))row[key]=null;
    if(!found.has(at))found.set(at,row);
  }return [...found.values()].sort((a,b)=>a.at-b.at);
}
export function verificationHours(now){const hours=[];for(let at=Math.ceil((now-7*24*HOUR)/HOUR)*HOUR;at<=now-HOUR/2;at+=HOUR)hours.push(at);return hours;}
export function forecastChoices(checks,targets){
  const sorted=[...checks].sort((a,b)=>a.at-b.at),chosen=[];let index=-1;
  for(const at of targets){while(index+1<sorted.length&&sorted[index+1].at*1000<=at-6*HOUR)index++;const check=sorted[index];if(check&&check.at*1000>=at-24*HOUR)chosen.push({at,check});}
  return chosen;
}
export function compareTemperatures(targets,choices,forecasts,rows){
  const pairs=[],skipped={no_archive:targets.length-choices.length,forecast_unavailable:0,observation_unavailable:0,quality_excluded:0};
  const used=new Set();
  for(const {at,check} of choices){const archived=forecasts.get(check.revision),issue=Date.parse(archived?.forecast?.properties?.updateTime);
    const p=archived?.forecast?.properties?.periods?.find(p=>Date.parse(p.startTime)===at&&Date.parse(p.endTime)-at===HOUR);
    const temp=typeof p?.temperature==='object'?quantity(p.temperature,'temperature'):quantity({value:p?.temperature,unitCode:'wmoUnit:deg'+p?.temperatureUnit},'temperature');
    if(temp===null||!Number.isFinite(issue)||issue>check.at*1000||issue>at-6*HOUR||issue<at-24*HOUR){skipped.forecast_unavailable++;continue;}
    const nearest=rows.filter(r=>!used.has(r.id)&&Math.abs(r.at-at)<=HOUR/2).sort((a,b)=>Math.abs(a.at-at)-Math.abs(b.at-at)||a.at-b.at)[0];
    if(!nearest||nearest.temperature===null){skipped.observation_unavailable++;continue;}
    if(!['V','G'].includes(nearest.temperature_qc)){skipped.quality_excluded++;continue;}
    used.add(nearest.id);pairs.push({valid_at:new Date(at).toISOString(),forecast_f:temp,observed_f:nearest.temperature,error_f:temp-nearest.temperature,observation_at:new Date(nearest.at).toISOString(),observation_id:nearest.id,quality:nearest.temperature_qc,forecast_revision:check.revision,forecast_checked_at:new Date(check.at*1000).toISOString(),forecast_issued_at:new Date(issue).toISOString(),lead_hours:(at-issue)/HOUR});
  }
  const n=pairs.length,mean=fn=>n?pairs.reduce((sum,p)=>sum+fn(p),0)/n:null;
  return {pairs,eligible_hours:targets.length,skipped,sample_count:n,days:new Set(pairs.map(p=>p.valid_at.slice(0,10))).size,mae_f:mean(p=>Math.abs(p.error_f)),bias_f:mean(p=>p.error_f),rmse_f:n?Math.sqrt(mean(p=>p.error_f**2)):null};
}
