/* Captured HRRR guidance versus later station measurements. Apache-2.0. */
import {hrrrTemperatureView} from './hrrr-temperature-core.mjs';
import {forecastChoices,HOUR} from './observations-core.mjs';
import {distanceKm} from './hazards-core.mjs';
export const HRRR_VERIFICATION_METHOD='2026-10-29.2';
export const HRRR_LEAD_GROUPS=[{label:'1 to under 6 hours',min:1,max:6},{label:'6 to under 12 hours',min:6,max:12},{label:'12 to under 24 hours',min:12,max:24},{label:'24 to 48 hours',min:24,max:49}];
export function hrrrChoices(checks,targets){
  const groups=new Map();
  for(const c of checks)if(Number.isSafeInteger(c.at)&&c.at>0&&typeof c.revision==='string'&&c.revision){
    if(!groups.has(c.at))groups.set(c.at,new Set());groups.get(c.at).add(c.revision);
  }
  // A conflicting latest check stays unknown, rather than falling back to a
  // more favorable earlier edition. The database normally has one check/second.
  return forecastChoices([...groups].map(([at,ids])=>({at,revision:ids.size===1?[...ids][0]:null})),targets,{minLead:1,maxLead:48});
}
export function hrrrEvidence(product,point,check){
  if(!Number.isSafeInteger(check.at)||!check.revision)throw Error('Invalid archive check');
  const view=hrrrTemperatureView({...product,checked_at:new Date(check.at*1000).toISOString()},point,check.at*1000),c=view.cell;
  if(!view.collection_recent||!Number.isInteger(c.x)||c.x<0||c.x>=1799||!Number.isInteger(c.y)||c.y<0||c.y>=1059||c.lat< -90||c.lat>90||c.lon< -180||c.lon>180||c.projection_distance_m<0)throw Error('HRRR capture or grid unavailable');
  const init=new Date(view.issued_at),date=init.toISOString().slice(0,10).replaceAll('-',''),hour=init.toISOString().slice(11,13),chunk=`0.${Math.floor(c.y/150)}.${Math.floor(c.x/150)}`;
  const url=`https://hrrrzarr.s3.amazonaws.com/sfc/${date}/${date}_${hour}z_fcst.zarr/2m_above_ground/TMP/2m_above_ground/TMP/${chunk}`;
  if(product.source_url!==url||product.cell.chunk!==chunk||!/^([a-f0-9]{64})$/.test(product.chunk_sha256||''))throw Error('HRRR source identity is incomplete');
  return view;
}
function stats(pairs){const n=pairs.length,mean=f=>n?pairs.reduce((s,p)=>s+f(p),0)/n:null;return {sample_count:n,days:new Set(pairs.map(p=>p.valid_at.slice(0,10))).size,runs:new Set(pairs.map(p=>p.initialization_at)).size,mae_f:mean(p=>Math.abs(p.error_f)),bias_f:mean(p=>p.error_f),rmse_f:n?Math.sqrt(mean(p=>p.error_f**2)):null};}
export function compareHrrr(targets,choices,products,observations,point,station){
  const pairs=[],skipped={no_archive:targets.length-choices.length,forecast_unavailable:0,observation_unavailable:0,quality_excluded:0},used=new Set(),views=new Map();
  for(const {at,check} of choices){
    const key=check.revision+'/'+check.at;let view=views.get(key);
    if(!views.has(key)){try{view=hrrrEvidence(products.get(check.revision),point,check);}catch{view=null;}views.set(key,view);}
    const row=view?.rows.find(r=>Date.parse(r.at)===at),init=Date.parse(view?.issued_at),capture=check.at*1000;
    if(!row||row.temperature_f===null||capture>at-HOUR||capture<at-48*HOUR||init>capture||row.lead_hours<1||row.lead_hours>48){skipped.forecast_unavailable++;continue;}
    // Pick the nearest reading before examining QC; never skip a closer bad
    // reading to obtain a favorable valid one. One reading cannot verify twice.
    const observed=observations.filter(r=>!used.has(r.id)&&Math.abs(r.at-at)<=HOUR/2).sort((a,b)=>Math.abs(a.at-at)-Math.abs(b.at-at)||a.at-b.at)[0];
    if(!observed||typeof observed.temperature!=='number'||!Number.isFinite(observed.temperature)||observed.temperature< -200||observed.temperature>180){skipped.observation_unavailable++;continue;}
    if(!['V','G'].includes(observed.temperature_qc)){skipped.quality_excluded++;continue;}
    used.add(observed.id);const product=products.get(check.revision);
    pairs.push({valid_at:row.at,initialization_at:view.issued_at,lead_hours:row.lead_hours,collection_lead_hours:(at-capture)/HOUR,
      forecast_checked_at:new Date(capture).toISOString(),forecast_revision:check.revision,forecast_f:row.temperature_f,raw_kelvin:row.raw_kelvin,
      observed_f:observed.temperature,error_f:row.temperature_f-observed.temperature,observation_at:new Date(observed.at).toISOString(),observation_id:observed.id,quality:observed.temperature_qc,
      cell:view.cell,grid_station_distance_km:distanceKm(view.cell.lat,view.cell.lon,station.lat,station.lon),source_url:product.source_url,chunk_sha256:product.chunk_sha256});
  }
  const groups=HRRR_LEAD_GROUPS.map(g=>({label:g.label,...stats(pairs.filter(p=>p.lead_hours>=g.min&&p.lead_hours<g.max))}));
  const daily=[...new Set(pairs.map(p=>p.valid_at.slice(0,10)))].map(date=>({date,...stats(pairs.filter(p=>p.valid_at.startsWith(date)))}));
  return {method_version:HRRR_VERIFICATION_METHOD,eligible_hours:targets.length,skipped,pairs,groups,daily,...stats(pairs)};
}
