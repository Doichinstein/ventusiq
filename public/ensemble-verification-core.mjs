/* Prospective archive comparisons, not calibrated ensemble probabilities. Apache-2.0. */
import {GEFS_RUN_METHOD,normalizeGEFSRun} from './gefs-run-core.mjs';
import {forecastChoices,HOUR} from './observations-core.mjs';
export const ENSEMBLE_VERIFICATION_METHOD='2026-10-29.1';
export function ensembleTargets(now){const step=3*HOUR,targets=[];for(let at=Math.ceil((now-7*24*HOUR)/step)*step;at<=now-HOUR/2;at+=step)targets.push(at);return targets;}
export function ensembleChoices(checks,targets){return forecastChoices(checks,targets,{minLead:6,maxLead:120});}
export function temperatureEvidence(product,point,now){
  if(product?.method!==GEFS_RUN_METHOD||product.model!=='gfs025'||product.point?.key!==point.key)throw Error('Unidentified or mismatched ensemble archive');
  const raw=normalizeGEFSRun(product.raw,point,now);
  return {initialization_at:raw.initialization_at,snapshot_id:raw.snapshot_id,archive_version:raw.archive_version,grid:{lat:raw.latitude,lon:raw.longitude},rows:raw.hourly.time.map((at,i)=>({at:at*1000,members:Array.from({length:31},(_,member)=>({member,value:raw.hourly['temperature_2m'+(member?'_member'+String(member).padStart(2,'0'):'')]?.[i]??null}))}))};
}
function stats(pairs){const n=pairs.length,mean=fn=>n?pairs.reduce((sum,p)=>sum+fn(p),0)/n:null;return {sample_count:n,days:new Set(pairs.map(p=>p.valid_at.slice(0,10))).size,runs:new Set(pairs.map(p=>p.initialization_at)).size,median_mae_f:mean(p=>Math.abs(p.error_f)),median_bias_f:mean(p=>p.error_f),inside_p10_p90:pairs.filter(p=>p.inside_p10_p90).length,mean_width_f:mean(p=>p.p90_f-p.p10_f)};}
export function compareEnsemble(targets,choices,forecasts,observations){
  const pairs=[],skipped={no_archive:targets.length-choices.length,forecast_unavailable:0,incomplete_members:0,observation_unavailable:0,quality_excluded:0},used=new Set();
  for(const {at,check} of choices){
    const forecast=forecasts.get(check.revision),init=Date.parse(forecast?.initialization_at),row=forecast?.rows.find(r=>r.at===at);
    if(!row||!Number.isFinite(init)||init>check.at*1000||check.at*1000>at-6*HOUR||init<at-120*HOUR||init>at-6*HOUR){skipped.forecast_unavailable++;continue;}
    const values=row.members.map(m=>m.value);if(values.length!==31||values.some(v=>typeof v!=='number'||!Number.isFinite(v)||v< -200||v>180)){skipped.incomplete_members++;continue;}
    const nearest=observations.filter(r=>!used.has(r.id)&&Math.abs(r.at-at)<=HOUR/2).sort((a,b)=>Math.abs(a.at-at)-Math.abs(b.at-at)||a.at-b.at)[0];
    if(!nearest||nearest.temperature===null||!Number.isFinite(nearest.temperature)||nearest.temperature< -200||nearest.temperature>180){skipped.observation_unavailable++;continue;}
    if(!['V','G'].includes(nearest.temperature_qc)){skipped.quality_excluded++;continue;}
    used.add(nearest.id);const sorted=values.slice().sort((a,b)=>a-b),p10=sorted[3],median=sorted[15],p90=sorted[27];
    pairs.push({valid_at:new Date(at).toISOString(),initialization_at:forecast.initialization_at,lead_hours:(at-init)/HOUR,forecast_checked_at:new Date(check.at*1000).toISOString(),forecast_revision:check.revision,snapshot_id:forecast.snapshot_id,archive_version:forecast.archive_version,grid:forecast.grid,members:row.members,median_f:median,p10_f:p10,p90_f:p90,observed_f:nearest.temperature,error_f:median-nearest.temperature,inside_p10_p90:nearest.temperature>=p10&&nearest.temperature<=p90,observation_at:new Date(nearest.at).toISOString(),observation_id:nearest.id,quality:nearest.temperature_qc});
  }
  const groups=[{label:'6 to under 24 hours',min:6,max:24},{label:'24 to under 48 hours',min:24,max:48},{label:'48 to 120 hours',min:48,max:121}].map(g=>({label:g.label,...stats(pairs.filter(p=>p.lead_hours>=g.min&&p.lead_hours<g.max))}));
  const daily=[...new Set(pairs.map(p=>p.valid_at.slice(0,10)))].map(date=>({date,...stats(pairs.filter(p=>p.valid_at.startsWith(date)))}));
  return {method_version:ENSEMBLE_VERIFICATION_METHOD,eligible_times:targets.length,skipped,pairs,groups,daily,...stats(pairs)};
}
