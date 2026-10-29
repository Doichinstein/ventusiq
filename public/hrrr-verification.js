import {persistenceNodes} from './verification-persistence-ui.mjs';
import {HRRR_VERIFICATION_METHOD} from './hrrr-verification-core.mjs';
export function mountHrrrVerification({document,window,selection,fetcher=fetch}){
  const get=id=>document.getElementById(id),el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;},num=n=>Number.isFinite(n)?n.toFixed(1):'Unknown';
  let generation=0,report=null;
  function reset(){generation++;report=null;get('hrrr-verify-run').disabled=!selection().station;get('hrrr-verify-export').disabled=true;get('hrrr-verify-results').replaceChildren(el('p','Choose an observation station above. This compares HRRR forecasts already collected before each target hour.','small'));}
  async function run(){
    const {place,station}=selection();if(!place||!station||window.WEATHER_CONFIG?.mode!=='hosted')return;
    const token=++generation;report=null;get('hrrr-verify-run').disabled=true;get('hrrr-verify-export').disabled=true;get('hrrr-verify-results').replaceChildren(el('p','Comparing captured HRRR forecasts with station readings…'));
    try{
      const response=await fetcher('/api/forecast/hrrr-verification?'+new URLSearchParams({lat:place.lat,lon:place.lon,station:station.id}),{signal:AbortSignal.timeout(60000)}),result=await response.json();if(!response.ok)throw Error(result.error||'Comparison unavailable');if(token!==generation)return;
      if(result.method_version!==HRRR_VERIFICATION_METHOD||result.station?.id!==station.id||result.point?.lat!==Number(Number(place.lat).toFixed(2))||result.point?.lon!==Number(Number(place.lon).toFixed(2)))throw Error('Comparison belongs to a different source, station or location');
      report=result;const nodes=[el('p',result.sample_count?`${num(result.mae_f)}°F mean absolute error`:'No eligible HRRR forecast–observation pairs yet.',result.sample_count?'outlook-number':''),el('p',`${result.sample_count}/${result.eligible_hours} candidate hours matched across ${result.days} UTC days and ${result.runs} runs. Station: ${station.name} (${station.id}).`)];
      if(result.sample_count)nodes.push(el('p',`Bias ${num(result.bias_f)}°F · RMS error ${num(result.rmse_f)}°F. Positive bias means warmer forecasts.`));
      else if(result.archive?.scanned_checks)nodes.push(el('p',`Successful collection checks retained: ${result.archive.scanned_checks}. No eligible matches yet. Earliest target allowed by the first retained collection: ${result.archive.earliest_target_by_collection_rule}; its observation window ends ${result.archive.earliest_observation_window_end}. Forecast coverage, station readings and QC must also qualify. These times do not schedule collection.`));
      else nodes.push(el('p','Load HRRR temperature above to begin collecting evidence. Only later weather can verify that capture; today’s loading cannot create past predictions.'));
      if(result.stale||result.observations_truncated)nodes.push(el('p','Station collection is delayed or partial. Available historical matches remain inspectable.','warning-note'));
      nodes.push(el('p',result.interpretation,'small'),...persistenceNodes(document,result.persistence,{overallLabel:'1–48 hours · HRRR'}));
      const details=el('details'),scroll=el('div',undefined,'hourly-scroll'),table=el('table',undefined,'hourly-table'),head=el('thead'),hr=el('tr'),body=el('tbody');
      scroll.setAttribute('tabindex','0');scroll.setAttribute('role','region');scroll.setAttribute('aria-label','HRRR observation comparison table; scroll horizontally for source times');
      for(const title of ['Target UTC','Forecast °F','Observed °F','Error °F','Observation UTC / QC','Run UTC','Captured UTC','Model / collection lead h','Grid to station km'])hr.append(el('th',title));head.append(hr);
      for(const p of result.pairs){const tr=el('tr');for(const v of [p.valid_at,num(p.forecast_f),num(p.observed_f),num(p.error_f),p.observation_at+' / '+p.quality,p.initialization_at,p.forecast_checked_at,num(p.lead_hours)+' / '+num(p.collection_lead_hours),num(p.grid_station_distance_km)])tr.append(el('td',v));body.append(tr);}table.append(head,body);scroll.append(table);
      details.append(el('summary','Inspect HRRR matches, coverage & sources'),el('p',`${result.window_start} – ${result.window_end}. All evidence times use UTC.`,'small'),el('p',result.method,'small'),el('p',`Not matched: ${result.skipped.no_archive} without an eligible archive; ${result.skipped.forecast_unavailable} unsuitable forecasts; ${result.skipped.observation_unavailable} missing readings; ${result.skipped.quality_excluded} excluded by quality flag.`,'small'));
      for(const g of result.groups)details.append(el('p',`Model lead ${g.label}: ${g.sample_count} matches, MAE ${num(g.mae_f)}°F.`,'small'));
      const audit=result.observation_audit;if(audit.time_excluded||audit.conflicting_timestamps)details.append(el('p',`${audit.time_excluded} readings with invalid timezones and ${audit.conflicting_timestamps} conflicting timestamps excluded.`,'small'));
      details.append(scroll);nodes.push(details);get('hrrr-verify-results').replaceChildren(...nodes);get('hrrr-verify-export').disabled=false;
    }catch(error){if(token===generation){report=null;get('hrrr-verify-results').replaceChildren(el('p','HRRR comparison unavailable: '+error.message));}}
    finally{if(token===generation)get('hrrr-verify-run').disabled=false;}
  }
  get('hrrr-verify-run').onclick=run;get('hrrr-verify-export').onclick=()=>{if(!report)return;const url=window.URL.createObjectURL(new Blob([JSON.stringify(report,null,2)],{type:'application/json'})),a=el('a');a.href=url;a.download='ventusiq-hrrr-temperature-comparison.json';a.click();window.setTimeout(()=>window.URL.revokeObjectURL(url),1000);};reset();return {run,reset};
}
