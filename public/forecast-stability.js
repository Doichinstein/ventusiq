export function mountForecastStability({document,window,fetcher=fetch}){
  const get=id=>document.getElementById(id),el=(tag,text)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;return n;};
  const enabled=window.WEATHER_CONFIG?.mode==='hosted';let place=null,scope=null,generation=0,report=null,busy=false;
  const value=(n,suffix)=>n===null?'Unknown':n.toFixed(1)+suffix,change=(n,suffix)=>n===null?'Unknown':(n>0?'+':'')+n.toFixed(1)+suffix;
  function clear(){report=null;get('stability-export').disabled=true;get('stability-results').replaceChildren();}
  function invalidate(){generation++;busy=false;clear();get('stability-run').disabled=!enabled||!place;}
  function updatePlace(next,nextScope=0){if(next&&place&&next.id===place.id&&next.lat===place.lat&&next.lon===place.lon&&scope===nextScope)return;place=next;scope=nextScope;invalidate();get('stability-status').textContent=place?'Compare already collected forecasts for the same future hours.':'Select a saved place.';}
  function render(r){
    const fmt=t=>{try{return new Date(t).toLocaleString(undefined,{timeZone:r.time_zone||undefined,timeZoneName:'short'});}catch{return t;}};
    const previous=r.comparison_mode==='previous_version';
    const nodes=[el('p',r.interpretation),el('p',previous?`Comparison fixed at ${fmt(r.evaluated_at)}. Previous different archived version, searched from ${fmt(r.search_since)}. Collection is irregular; this is not a fixed forecast-update interval.`:`Comparison fixed at ${fmt(r.evaluated_at)}. Earlier cutoff: ${fmt(r.earlier_cutoff)}.`)];
    if(previous&&r.collection_gap_hours!==null)nodes.push(el('p',`Selected collection checks are ${r.collection_gap_hours.toFixed(1)} hours apart. Different archived bodies may share a source issue time; this does not identify model runs.`));
    for(const [label,edition] of [['Latest',r.evidence.current],['Earlier',r.evidence.earlier]])nodes.push(el('p',edition?`${label}: collected ${fmt(edition.checked_at)}; source issued ${edition.issued_at?fmt(edition.issued_at):'unknown'}; revision ${edition.revision}.`:`${label}: no archived edition.`));
    if(r.current_delayed)nodes.push(el('p','Latest collection is delayed or unavailable. These archived values may not describe the current forecast.'));
    if(r.source_issue_moved_back)nodes.push(el('p','The latest collected edition has an earlier source issue time: the source may have rolled back.'));
    if(r.reason)nodes.push(el('p',r.reason));
    else{
      const s=r.summary;nodes.push(el('p',`${s.temperature_paired_hours}/48 temperature hours; ${s.rain_paired_hours}/48 rain-chance hours paired. Largest absolute changes: ${value(s.largest_absolute_temperature_change_f,'°F')} and ${value(s.largest_absolute_rain_change_percentage_points,' percentage points')}.`));
      if(r.same_revision)nodes.push(el('p','Both cutoffs selected the same archived edition. No new edition was observed between these checks.'));
      const details=el('details'),table=el('table');details.append(el('summary','Compare all 48 future hours'));table.className='hourly-table';const head=el('thead'),tr=el('tr');for(const title of ['Valid hour · place local time','Earlier °F','Latest °F','Change °F','Earlier rain chance','Latest rain chance','Change · percentage points'])tr.append(el('th',title));head.append(tr);table.append(head);const body=el('tbody');
      for(const row of r.rows){const line=el('tr');for(const text of [fmt(row.at),value(row.earlier.temperature_f,''),value(row.current.temperature_f,''),change(row.temperature_change_f,''),value(row.earlier.rain_percent,'%'),value(row.current.rain_percent,'%'),change(row.rain_change_percentage_points,'')])line.append(el('td',text));body.append(line);}table.append(body);const wrap=el('div');wrap.className='hourly-scroll';wrap.append(table);details.append(wrap);nodes.push(details);
    }
    get('stability-results').replaceChildren(...nodes);get('stability-status').textContent=r.status==='compared'?'Archive comparison ready.':'Archive comparison unavailable.';get('stability-export').disabled=false;
  }
  async function run(){if(!enabled||!place||busy)return;clear();busy=true;const token=++generation,p={...place},hours=get('stability-hours').value||'24';get('stability-run').disabled=true;get('stability-status').textContent='Reading archived forecast editions…';
    try{const response=await fetcher('/api/forecast/stability?'+new URLSearchParams({lat:p.lat,lon:p.lon,hours}),{signal:AbortSignal.timeout(60000)}),data=await response.json();if(token!==generation)return;if(!response.ok)throw Error(data.error||'Forecast archive unavailable');if(data.point!==Number(p.lat).toFixed(4)+','+Number(p.lon).toFixed(4)||(hours==='previous'?data.comparison_mode!=='previous_version'||data.lookback_hours!==null:data.comparison_mode==='previous_version'||data.lookback_hours!==Number(hours)))throw Error('Forecast comparison belongs to another selection');report=data;render(data);}catch(e){if(token===generation){clear();get('stability-status').textContent='Comparison unavailable: '+e.message;}}finally{if(token===generation){busy=false;get('stability-run').disabled=false;}}
  }
  get('stability-controls').hidden=!enabled;get('stability-run').onclick=run;get('stability-hours').onchange=()=>{invalidate();get('stability-status').textContent='Comparison window changed. Run a new archive comparison.';};
  get('stability-export').onclick=()=>{if(!report)return;const url=window.URL.createObjectURL(new Blob([JSON.stringify(report,null,2)],{type:'application/json'})),a=el('a');a.href=url;a.download='ventusiq-forecast-changes.json';a.click();window.setTimeout(()=>window.URL.revokeObjectURL(url),1000);};
  window.WeatherForecastStability={updatePlace};const context=window.WeatherPersonal?.context();updatePlace(context?.place||null,context?.scope_generation||0);return {run,updatePlace};
}
if(typeof window!=='undefined'){const start=()=>mountForecastStability({document,window});if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();}
