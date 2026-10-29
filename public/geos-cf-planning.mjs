import {geosView,GEOS_FIELDS} from './geos-cf-core.mjs';
export const GEOS_PLAN_METHOD='2026-10-29.1',GEOS_PLAN_MAX_RUN_HOURS=48;
const HOUR=3600000,iso=t=>new Date(t).toISOString();
export function geosForecastWindow(product,place,start,end,limit=null,now=Date.now(),variable='pm25_rh35'){
  const field=GEOS_FIELDS[variable],base={method:GEOS_PLAN_METHOD,model:'geos_cf_v2',variable,unit:field?.unit||null,limit,status:limit===null?'not_requested':'unknown',scope:`Each full hourly ${field?.label||'unknown pollutant'} average whose interval overlaps the activity window`,continuous_coverage:false,complete:false,fresh:false,maximum:null,samples:[],max_run_age_hours:GEOS_PLAN_MAX_RUN_HOURS,reason:'NASA forecast not loaded'};
  if(!field||!Number.isFinite(start)||!Number.isFinite(end)||end<=start||end-start>12*HOUR||limit!==null&&(!Number.isFinite(limit)||limit<0||limit>10000))return {...base,status:'unknown',reason:'Invalid NASA forecast window or limit'};
  if(!product)return base;
  try{
    const view=geosView(product,place,now),rows=new Map(view.rows.map(r=>[Date.parse(r.start),r])),samples=[];
    for(let t=Math.floor(start/HOUR)*HOUR;t<end;t+=HOUR){const row=rows.get(t);samples.push({at:iso(t+HOUR/2),start:iso(t),end:iso(t+HOUR),overlap_start:iso(Math.max(t,start)),overlap_end:iso(Math.min(t+HOUR,end)),value:row?.[variable]??null,unit:field.unit,reason:row?row.quality[variable]:'No forecast interval'});}
    const usable=samples.filter(s=>s.value!==null),complete=usable.length===samples.length,fresh=view.collection_recent&&view.run_age_hours>=0&&view.run_age_hours<=GEOS_PLAN_MAX_RUN_HOURS,maximum=usable.length?Math.max(...usable.map(s=>s.value)):null;
    return {...base,samples,complete,fresh,maximum,status:limit===null?'not_requested':!fresh?'unknown':usable.some(s=>s.value>limit)?'outside_limits':complete?'fits':'unknown',initialized_at:view.initialized_at,run_age_hours:view.run_age_hours,checked_at:view.checked_at,revision:product.revision||null,source_url:product.source_url,reason:!view.collection_recent?'NASA forecast collection is missing, stale or delayed':view.run_age_hours<0||view.run_age_hours>GEOS_PLAN_MAX_RUN_HOURS?'NASA model initialization is outside the planner’s 0–48 hour age range':!complete?'Missing or invalid NASA hourly averages':null};
  }catch(error){return {...base,reason:error.message};}
}
