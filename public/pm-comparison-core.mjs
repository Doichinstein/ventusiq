import {airPoint,validateAirForecast,AIR_MODEL} from './air-forecast-core.mjs';
import {airTrend,HOUR} from './air-trends-core.mjs';
export const PM_COMPARISON_METHOD='2026-10-29.2';
export function comparisonTargets(now){const end=Math.floor(now/HOUR)*HOUR-HOUR;return Array.from({length:24},(_,i)=>end-(23-i)*HOUR);}
export function pendingComparisonTargets(now){const start=Math.floor(now/HOUR)*HOUR;return Array.from({length:25},(_,i)=>start+i*HOUR);}
export function comparisonChoices(checks,targets){const valid=checks.filter(c=>Number.isSafeInteger(c.at)&&typeof c.revision==='string').sort((a,b)=>b.at-a.at);return targets.map(at=>({at,check:valid.find(c=>c.at*1000<=at-HOUR&&c.at*1000>=at-24*HOUR)||null}));}
const stats=pairs=>{if(!pairs.length)return {count:0,mean_absolute_difference:null,mean_signed_difference:null};return {count:pairs.length,mean_absolute_difference:pairs.reduce((n,p)=>n+Math.abs(p.difference),0)/pairs.length,mean_signed_difference:pairs.reduce((n,p)=>n+p.difference,0)/pairs.length};};
function readiness({point,checks,forecasts,now,audit,pairs}){
  if(pairs.length)return {status:'paired'};
  const missing=audit.findLast(r=>r.reason==='Measured concentration missing, invalid or conflicting');
  if(missing)return {status:'measurement_unavailable',target_at:missing.at,period_ends_at:new Date(Date.parse(missing.at)+HOUR).toISOString(),forecast_check:missing.forecast_check};
  const targets=pendingComparisonTargets(now),choices=comparisonChoices(checks.filter(c=>c.at*1000<=now),targets);
  for(const {at,check} of choices){
    if(!check)continue;
    const product=forecasts.get(check.revision);let sample;
    try{if(product?.model!==AIR_MODEL||product?.point?.lat!==point.lat||product?.point?.lon!==point.lon)continue;sample=validateAirForecast(product.raw,point).find(r=>Date.parse(r.at)===at);}catch{continue;}
    if(!sample||sample.pm2_5===null)continue;
    return {status:'awaiting_completed_hour',target_at:new Date(at).toISOString(),period_ends_at:new Date(at+HOUR).toISOString(),
      forecast_check:{revision:check.revision,checked_at:new Date(check.at*1000).toISOString(),collection_lead_hours:(at-check.at*1000)/HOUR},
      forecast_pm25:sample.pm2_5,forecast_source:{revision:check.revision,product}};
  }
  return {status:'no_pending_forecast',searched_through:new Date(targets.at(-1)).toISOString()};
}
export function comparePM({place,monitor,observations,checks,forecasts,baselineEditions=new Map(),now=Date.now()}){
  const point=airPoint(place.lat,place.lon),targets=comparisonTargets(now),choices=comparisonChoices(checks,targets),obsChecked=Date.parse(observations.checked_at);
  if(!Number.isFinite(obsChecked)||obsChecked>now)throw Error('Invalid measurement collection time');
  const trend=airTrend(observations,monitor,Math.min(now,obsChecked)),measured=new Map(trend.rows.filter(r=>Date.parse(r.at)+HOUR<=Math.min(now,obsChecked)).map(r=>[Date.parse(r.at),r])),audit=[],pairs=[],sources=new Map(),baselineSources=new Map();
  for(const {at,check} of choices){const row={at:new Date(at).toISOString(),status:'unmatched',reason:null,forecast_check:check?{revision:check.revision,checked_at:new Date(check.at*1000).toISOString(),collection_lead_hours:(at-check.at*1000)/HOUR}:null,measurement:measured.get(at)||null};audit.push(row);
    if(!check){row.reason='No forecast archived 1–24 hours before this timestamp';continue;}
    const product=forecasts.get(check.revision);let modelRow;
    try{if(product?.model!==AIR_MODEL||product?.point?.lat!==point.lat||product?.point?.lon!==point.lon)throw Error();modelRow=validateAirForecast(product.raw,point).find(r=>Date.parse(r.at)===at);}catch{row.reason='Invalid or unavailable archived forecast';continue;}
    sources.set(check.revision,{revision:check.revision,product});
    if(!modelRow||modelRow.pm2_5===null){row.reason='Forecast sample missing or invalid';continue;}
    if(!row.measurement||row.measurement.pm25===null){row.reason='Measured concentration missing, invalid or conflicting';continue;}
    row.status='matched';const pair={at:row.at,forecast_pm25:modelRow.pm2_5,observed_pm25:row.measurement.pm25,difference:modelRow.pm2_5-row.measurement.pm25,forecast_revision:check.revision,forecast_checked_at:row.forecast_check.checked_at,collection_lead_hours:row.forecast_check.collection_lead_hours,observation_revision:observations.revision||null,observation_source_ids:row.measurement.source_ids,baseline:null};
    const edition=baselineEditions.get(check.at),editionAt=Date.parse(edition?.checked_at);
    if(edition&&Number.isFinite(editionAt)&&editionAt<check.at*1000){try{const old=airTrend(edition,monitor,editionAt),latest=old.rows.filter(r=>r.pm25!==null&&Date.parse(r.at)+HOUR<=editionAt&&Date.parse(r.at)<check.at*1000&&check.at*1000-Date.parse(r.at)<=3*HOUR).at(-1);if(latest){pair.baseline={at:latest.at,pm25:latest.pm25,difference:latest.pm25-pair.observed_pm25,revision:edition.revision||null,checked_at:edition.checked_at,source_ids:latest.source_ids};baselineSources.set(edition.revision,{revision:edition.revision,product:edition});}}catch{}}
    pairs.push(pair);
  }
  const paired=pairs.filter(p=>p.baseline),baselinePairs=paired.map(p=>({difference:p.baseline.difference}));
  return {method:PM_COMPARISON_METHOD,evaluated_at:new Date(now).toISOString(),place,point,monitor,window:{start:new Date(targets[0]).toISOString(),end:new Date(targets.at(-1)).toISOString(),target_hours:24},unit:'µg/m³',run_age_known:false,readiness:readiness({point,checks,forecasts,now,audit,pairs}),metrics:stats(pairs),paired_baseline:{model:stats(paired),persistence:stats(baselinePairs)},lead_groups:[[1,6],[6,12],[12,24]].map(([from,to],i)=>({from_hours:from,to_hours:to,upper_inclusive:i===2,...stats(pairs.filter(p=>p.collection_lead_hours>=from&&(i===2?p.collection_lead_hours<=to:p.collection_lead_hours<to)))})),coverage:{target_hours:24,measured_hours:targets.filter(t=>measured.get(t)?.pm25!=null).length,forecast_checks:choices.filter(c=>c.check).length,matched_hours:pairs.length,baseline_pairs:paired.length,off_hour_measurements:trend.rows.filter(r=>Date.parse(r.at)%HOUR!==0).length,observation_audit:trend.coverage.excluded},pairs,audit,sources:{forecasts:[...sources.values()],observations,baseline_observations:[...baselineSources.values()]},limitations:'Diagnostic comparison at the start timestamp of completed hourly observations of regional instantaneous model output and preliminary hourly monitor concentrations. Collection lead is not model-run lead. Location and temporal averaging differ; no calibrated probability, causal attribution, exposure estimate or national skill claim is established. Observation revisions can change these comparisons.'};
}
