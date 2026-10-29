import {geosCell,geosView} from './geos-cf-core.mjs';
import {distanceKm,validPoint} from './hazards-core.mjs';
import {comparisonChoices} from './pm-comparison-core.mjs';
import {HOUR} from './air-trends-core.mjs';

export const GEOS_OZONE_COMPARISON_METHOD='2026-10-29.1';
const stats=rows=>({count:rows.length,mean_absolute_difference_ppb:rows.length?rows.reduce((n,r)=>n+Math.abs(r.difference_ppb),0)/rows.length:null,mean_signed_difference_ppb:rows.length?rows.reduce((n,r)=>n+r.difference_ppb,0)/rows.length:null});

// Archive check time is authoritative. Initialization alone never proves that
// this application had a prediction before the measurement period began.
export function compareGeosOzone({trend,checks,forecasts}){
  const monitor=trend.monitor,now=Date.parse(trend.evaluated_at),observedAt=Date.parse(trend.evidence?.checked_at);
  if(!validPoint(monitor?.geometry)||!Number.isFinite(now)||!Number.isFinite(observedAt)||observedAt>now+60000||trend.rows.length!==24)throw Error('Invalid ozone comparison context');
  const location={lat:monitor.geometry.coordinates[1],lon:monitor.geometry.coordinates[0]},cell=geosCell(location.lat,location.lon),sources=new Map(),decoded=new Map();
  const choices=comparisonChoices(checks,trend.rows.map(r=>Date.parse(r.at)));
  const rows=choices.map(({at,check},i)=>{
    const observation=trend.rows[i],r={...observation,forecast_check:check?{revision:check.revision,checked_at:new Date(check.at*1000).toISOString(),collection_lead_hours:(at-check.at*1000)/HOUR}:null,model_mean_ppb:null,difference_ppb:null,initialized_at:null,model_lead_start_hours:null,model_lead_end_hours:null,paired:false,reason:null};
    if(!Number.isFinite(at)||at%HOUR||Date.parse(observation.end)!==at+HOUR||at+HOUR>Math.min(now,observedAt)){r.reason='Observation hour incomplete or invalid';return r;}
    if(!check){r.reason='No NASA forecast archived 1–24 hours before this observation hour';return r;}
    if(new Set(checks.filter(c=>c.at===check.at).map(c=>c.revision)).size>1){r.reason='Conflicting forecast checks at the selected collection time';return r;}
    const p=forecasts.get(check.revision);if(p)sources.set(check.revision,p);
    let view;try{
      const key=check.revision+':'+check.at;
      if(!decoded.has(key))decoded.set(key,geosView({...p,checked_at:r.forecast_check.checked_at},location,check.at*1000));
      view=decoded.get(key);
      if(!view.collection_recent||view.run_age_hours<0||view.run_age_hours>48)throw Error();
    }catch{r.reason='Invalid, missing or delayed NASA forecast at collection';return r;}
    r.initialized_at=view.initialized_at;r.model_lead_start_hours=(at-Date.parse(view.initialized_at))/HOUR;r.model_lead_end_hours=r.model_lead_start_hours+1;
    const sample=view.rows.find(row=>Date.parse(row.start)===at&&Date.parse(row.end)===at+HOUR);
    r.model_mean_ppb=sample?.o3??null;
    if(r.model_mean_ppb===null){r.reason=sample?.quality.o3||'NASA hourly mean missing';return r;}
    if(typeof observation.ozone_ppb!=='number'||!Number.isFinite(observation.ozone_ppb)){r.reason='Missing usable hourly measurement';return r;}
    r.paired=true;r.difference_ppb=r.model_mean_ppb-observation.ozone_ppb;return r;
  });
  const paired=rows.filter(r=>r.paired);
  return {method:GEOS_OZONE_COMPARISON_METHOD,source:'geos',unit:'ppb',rows,paired_hours:paired.length,metrics:stats(paired),coverage:{target_hours:24,measured_hours:rows.filter(r=>r.ozone_ppb!==null).length,forecast_checks:choices.filter(r=>r.check).length,paired_hours:paired.length,negative_measured_pairs:paired.filter(r=>r.ozone_ppb<0).length},model_location:{...cell,monitor:location,grid_to_monitor_km:distanceKm(location.lat,location.lon,cell.grid.lat,cell.grid.lon)},lead_groups:[[1,6],[6,12],[12,24]].map(([from,to],i)=>({from_hours:from,to_hours:to,upper_inclusive:i===2,...stats(paired.filter(r=>r.forecast_check.collection_lead_hours>=from&&(i===2?r.forecast_check.collection_lead_hours<=to:r.forecast_check.collection_lead_hours<to)))})),forecast_checks:checks,forecast_sources:[...sources].map(([revision,product])=>({revision,product})),run_age_known:true,max_run_age_at_collection_hours:48,limitations:'Diagnostic differences between matching hourly NASA ozone means and preliminary AirNow concentrations, both in ppb. NASA is a regional surface-layer dry-air mixing ratio; monitor sampling and moisture basis may differ. Grid and instrument locations differ. Negative monitor values are retained with their source flags. Collection lead and model-run lead are separate. This small, on-demand sample is not calibrated accuracy, a regulatory evaluation, personal exposure or evidence that one model is generally better. Revised observations can change these differences.'};
}
