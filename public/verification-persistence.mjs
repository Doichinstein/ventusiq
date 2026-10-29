import {verificationObservations} from './verification-leads.mjs';
export const PERSISTENCE_METHOD='2026-10-29.1',PERSISTENCE_MAX_AGE=3*3600000;

export function persistenceReading(edition,check,station){
  const checked=Date.parse(edition?.checked_at),decision=Date.parse(check);
  const missing=reason=>({status:'unavailable',reason,forecast_checked_at:check,edition_revision:edition?.revision||null,edition_checked_at:edition?.checked_at||null});
  if(!edition)return missing('No station edition archived in the preceding three hours');
  if(!/(Z|[+-]\d{2}:\d{2})$/.test(check||'')||!/(Z|[+-]\d{2}:\d{2})$/.test(edition.checked_at||'')||!Number.isFinite(decision)||!Number.isFinite(checked)||checked>=decision||decision-checked>PERSISTENCE_MAX_AGE)return missing('Edition was not available strictly before the forecast check, or was too old');
  if(edition.station!==station||!Array.isArray(edition.features)||edition.features.length>3000)return missing('Invalid archived station edition');
  const source='https://api.weather.gov/stations/'+station;
  const audit=verificationObservations({features:edition.features.filter(f=>f.properties?.station===source)},checked),latest=audit.rows.at(-1);
  if(!latest||decision-latest.at>PERSISTENCE_MAX_AGE)return missing('Latest archived reading is missing or more than three hours old');
  if(latest.temperature===null||!['V','G'].includes(latest.temperature_qc))return missing('Latest archived reading has invalid, conflicting or unaccepted-quality temperature');
  return {status:'available',forecast_checked_at:check,edition_revision:edition.revision,edition_checked_at:edition.checked_at,observation_id:latest.id,observation_at:new Date(latest.at).toISOString(),temperature_f:latest.temperature,quality:latest.temperature_qc,age_at_check_hours:(decision-latest.at)/3600000,records:edition.features.filter(f=>f.properties?.station===source&&Date.parse(f.properties?.timestamp)===latest.at),source_url:edition.source_url||source+'/observations',edition_truncated:!!edition.truncated};
}

function comparison(pairs,byCheck){
  const matched=[],omitted=[];
  for(const pair of pairs){const baseline=byCheck.get(pair.forecast_checked_at);if(baseline?.status!=='available'){omitted.push({valid_at:pair.valid_at,forecast_checked_at:pair.forecast_checked_at,reason:baseline?.reason||'No eligible baseline evidence'});continue;}
    matched.push({...pair,baseline:{temperature_f:baseline.temperature_f,error_f:baseline.temperature_f-pair.observed_f,observation_id:baseline.observation_id,observation_at:baseline.observation_at,quality:baseline.quality,age_at_check_hours:baseline.age_at_check_hours,edition_revision:baseline.edition_revision,edition_checked_at:baseline.edition_checked_at,edition_truncated:baseline.edition_truncated}});
  }
  const n=matched.length,stats=error=>({mae_f:n?matched.reduce((a,p)=>a+Math.abs(error(p)),0)/n:null,bias_f:n?matched.reduce((a,p)=>a+error(p),0)/n:null,rmse_f:n?Math.sqrt(matched.reduce((a,p)=>a+error(p)**2,0)/n):null}),model=stats(p=>p.error_f),baseline=stats(p=>p.baseline.error_f);
  return {forecast_pair_count:pairs.length,sample_count:n,days:new Set(matched.map(p=>p.valid_at.slice(0,10))).size,forecast:model,persistence:baseline,mae_difference_f:n?model.mae_f-baseline.mae_f:null,pairs:matched,omitted};
}

export function comparePersistence(overall,groups,evidence){
  const sources=new Map();for(const r of evidence.byCheck.values()){if(r.status!=='available')continue;if(!sources.has(r.edition_revision))sources.set(r.edition_revision,{revision:r.edition_revision,source_url:r.source_url,truncated:r.edition_truncated,records:new Map()});const source=sources.get(r.edition_revision);for(const record of r.records)source.records.set(JSON.stringify(record),record);}
  return {method:PERSISTENCE_METHOD,overall:comparison(overall,evidence.byCheck),groups:groups.map(g=>({id:g.id,label:g.label,...comparison(g.pairs,evidence.byCheck)})),archive:evidence.archive,error:evidence.error||null,sources:[...sources.values()].map(s=>({...s,records:[...s.records.values()]})),scope:'Persistence holds the latest station reading archived strictly before forecast collection constant. Readings must be no more than three hours old and have temperature QC V/G. Forecast and persistence errors use identical later station readings. This is a collection-time descriptive benchmark, not a forecast-issue-time experiment, calibrated confidence or proof of future skill. Consecutive hours are correlated; station and forecast-point conditions can differ. Exported baseline sources are selected raw records, not complete observation editions.'};
}
