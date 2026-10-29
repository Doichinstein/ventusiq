import {leadAnalysisNodes} from './verification-leads-ui.mjs';
import {observations,HOUR} from './observations-core.mjs';
export function mountObservations({document,window,fetcher=fetch,clock=()=>Date.now()}){
  const get=id=>document.getElementById(id),el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
  const enabled=window.WEATHER_CONFIG?.mode==='hosted',cache=new Map();let place=null,station=null,data=null,generation=0,reportGeneration=0,report=null;
  const fmt=at=>{try{return new Date(at).toLocaleString(undefined,{timeZone:station?.time_zone||undefined,month:'short',day:'numeric',hour:'numeric',minute:'2-digit',timeZoneName:'short'});}catch{return new Date(at).toISOString();}};
  const number=(value,unit)=>value===null?'Unavailable':value.toFixed(1)+unit;
  async function json(path,ttl=0){const old=cache.get(path);if(old&&clock()-old.at<ttl)return old.data;const r=await fetcher(path,{signal:AbortSignal.timeout(60000)});if(!r.ok)throw Error('Source returned HTTP '+r.status);const d=await r.json();cache.set(path,{at:clock(),data:d});return d;}
  function clearReport(){report=null;reportGeneration++;get('verification-export').disabled=true;get('verification-results').replaceChildren(el('p','Compare this station with forecasts collected for your saved point before the weather occurred.'));}
  function chart(rows){
    const target=get('observation-chart');target.replaceChildren();const usable=rows.filter(r=>r.temperature!==null);if(!usable.length)return;
    const ns='http://www.w3.org/2000/svg',svg=document.createElementNS(ns,'svg');svg.setAttribute('viewBox','0 0 640 200');svg.setAttribute('role','img');svg.setAttribute('aria-label','Observed station temperature during the last 24 hours. Missing readings and gaps over 90 minutes break the line. Exact readings follow in the table.');
    const node=(tag,attrs,text)=>{const n=document.createElementNS(ns,tag);for(const [k,v] of Object.entries(attrs))n.setAttribute(k,String(v));if(text!==undefined)n.textContent=text;svg.append(n);return n;};
    const min=Math.floor(Math.min(...usable.map(r=>r.temperature)))-2,max=Math.ceil(Math.max(...usable.map(r=>r.temperature)))+2,start=clock()-24*HOUR,x=t=>55+(t-start)/(24*HOUR)*565,y=t=>155-(t-min)/(max-min)*130;
    for(const t of [min,(min+max)/2,max]){node('line',{x1:55,x2:620,y1:y(t),y2:y(t),class:'chart-grid'});node('text',{x:5,y:y(t)+4},t.toFixed(0)+'°F');}
    let path='',previous=null;for(const r of rows){if(r.temperature===null){previous=null;continue;}path+=(previous&&r.at-previous.at<=1.5*HOUR?' L':' M')+x(r.at).toFixed(1)+' '+y(r.temperature).toFixed(1);previous=r;}
    node('path',{d:path,class:'chart-observed'});for(const r of usable)node('circle',{cx:x(r.at),cy:y(r.temperature),r:1.6,fill:'#88baff'});
    node('text',{x:55,y:187},'24 hours ago');node('text',{x:580,y:187},'Now');target.append(svg);
  }
  function render(){
    if(!data||!station)return;const rows=observations(data,clock()),latest=rows.at(-1),old=!latest||clock()-latest.at>2*HOUR;
    const status=`${station.name} (${station.id}) · ${station.distance_km.toFixed(1)} km from this place · checked ${fmt(data.checked_at)}`;
    get('observation-status').textContent=(data.stale?'Updates delayed. ':'')+status+(data.error?' · '+data.error:'');
    const nodes=[el('p',latest?`${old?'Latest available reading — delayed':'Observed'} ${fmt(latest.at)}`:'No readings returned in the requested seven days.',old?'warning-note':'small')];
    if(latest){nodes.push(el('p',number(latest.temperature,'°F'),'outlook-number'),el('p',`${latest.description} · temperature QC ${latest.temperature_qc}`),el('p',`Wind ${number(latest.wind,' mph')} (QC ${latest.wind_qc}) · gust ${number(latest.gust,' mph')} (QC ${latest.gust_qc})`));}
    if(data.truncated)nodes.push(el('p','The source exceeded the 3,000-record collection limit. The returned history is partial.','warning-note'));
    const link=el('a','Official station observations ↗');link.href='https://api.weather.gov/stations/'+station.id+'/observations';link.target='_blank';link.rel='noopener';nodes.push(link);
    get('observation-current').replaceChildren(...nodes);const recent=rows.filter(r=>r.at>=clock()-24*HOUR);chart(recent);
    get('observation-table').replaceChildren(...recent.slice().reverse().map(r=>{const tr=el('tr');for(const v of [fmt(r.at),number(r.temperature,'°F'),r.temperature_qc,number(r.wind,' mph'),number(r.gust,' mph')])tr.append(el('td',v));return tr;}));
    get('observation-count').textContent=`${recent.length} readings in the last 24 hours. Times use the station timezone. Gaps remain unfilled.`;
  }
  async function select(id){
    const selected=stationOptions.find(s=>s.id===id);if(!selected)return;const token=++generation;station=selected;data=null;clearReport();get('observation-current').replaceChildren();get('observation-chart').replaceChildren();get('observation-table').replaceChildren();get('observation-count').textContent='';get('verification-run').disabled=true;get('observation-status').textContent='Loading station observations…';
    try{const result=await json('/api/observations/station?id='+id,1800000);if(token!==generation)return;data=result;render();get('verification-run').disabled=false;}catch(error){if(token===generation)get('observation-status').textContent='Observations unavailable: '+error.message;}
  }
  let stationOptions=[];
  async function updatePlace(next){
    const same=next&&place&&next.lat===place.lat&&next.lon===place.lon;if(same)return;place=next;station=null;data=null;stationOptions=[];const token=++generation;clearReport();get('observation-controls').hidden=true;get('observation-current').replaceChildren();get('observation-chart').replaceChildren();get('observation-table').replaceChildren();get('observation-count').textContent='';get('observation-coverage').textContent='';get('verification-run').disabled=true;
    if(!enabled||!next)return;get('observation-controls').hidden=false;get('observation-station').replaceChildren();get('observation-station').disabled=true;
    get('observation-status').textContent='Finding NWS-listed stations within 50 km…';
    try{const list=await json(`/api/observations/near?lat=${next.lat}&lon=${next.lon}`,86400000);if(token!==generation)return;stationOptions=list.stations;get('observation-station').replaceChildren(...list.stations.map(s=>{const o=el('option',`${s.name} · ${s.distance_km.toFixed(1)} km`);o.value=s.id;return o;}));get('observation-coverage').textContent=list.coverage+(list.stale?' Station discovery is delayed.':'');
      if(!list.stations.length){get('observation-status').textContent='No listed stations within 50 km. Observed conditions here are unknown.';return;}get('observation-station').disabled=false;get('observation-station').value=list.stations[0].id;await select(list.stations[0].id);
    }catch(error){if(token===generation)get('observation-status').textContent='Station discovery unavailable: '+error.message;}
  }
  async function verify(){
    if(!station||!place||!data)return;const token=++reportGeneration,selection=generation;get('verification-run').disabled=true;get('verification-results').replaceChildren(el('p','Matching archived forecasts with later observations…'));get('verification-export').disabled=true;
    try{const result=await json(`/api/verification?lat=${place.lat}&lon=${place.lon}&station=${station.id}`);if(token!==reportGeneration||selection!==generation)return;report=result;
      const nodes=[el('p',result.sample_count?`${result.mae_f.toFixed(1)}°F mean absolute error`:'No eligible forecast–observation pairs yet.',result.sample_count?'outlook-number':''),el('p',`${result.sample_count} matched hours across ${result.days} UTC days / ${result.eligible_hours} candidate hours in the last seven days.`)];
      if(result.sample_count)nodes.push(el('p',`Bias ${result.bias_f>0?'+':''}${result.bias_f.toFixed(1)}°F · RMS error ${result.rmse_f.toFixed(1)}°F. Positive bias means warmer forecasts.`));
      if(result.stale||result.observations_truncated)nodes.push(el('p','Observation collection is delayed or partial; this comparison uses the available archived records.','warning-note'));
      nodes.push(el('p',result.method,'small'),el('p',`Not matched: ${result.skipped.no_archive} without an eligible archive check; ${result.skipped.forecast_unavailable} missing or unsuitable forecasts; ${result.skipped.observation_unavailable} missing measurements; ${result.skipped.quality_excluded} excluded by quality flag.`,'small'),el('p','Nearby terrain, elevation and urban conditions can differ from the forecast point. Consecutive hours are correlated. This small local sample does not establish future accuracy.','small'),el('p',`Evaluated ${fmt(result.generated_at)} · observations checked ${fmt(result.observation_checked_at)}`,'small'));
      if(!result.sample_count)nodes.push(el('p','Forecasts must have been collected 6–24 hours before their valid time. Revisit this place after that history accumulates; we do not reconstruct past forecasts from today’s version.'));
      if(result.observation_audit?.time_excluded||result.observation_audit?.conflicting_timestamps)nodes.push(el('p',`${result.observation_audit.time_excluded} observation records lacked explicit valid timezones; ${result.observation_audit.conflicting_timestamps} timestamps had conflicting temperature records. These cannot supply a verifying temperature.`,'warning-note'));
      nodes.push(...leadAnalysisNodes(document,result.lead_analysis));
      const details=el('details'),summary=el('summary','Inspect matched hours and provenance'),scroll=el('div',undefined,'hourly-scroll'),table=el('table',undefined,'hourly-table'),head=el('thead'),hr=el('tr');for(const name of ['Valid time','Forecast °F','Observed °F','Error °F','Observation time','QC','Forecast checked','Source lead'])hr.append(el('th',name));head.append(hr);const body=el('tbody');for(const p of result.pairs.slice().reverse()){const tr=el('tr');for(const value of [fmt(p.valid_at),p.forecast_f.toFixed(1),p.observed_f.toFixed(1),p.error_f.toFixed(1),fmt(p.observation_at),p.quality,fmt(p.forecast_checked_at),p.lead_hours.toFixed(1)+' h'])tr.append(el('td',value));body.append(tr);}table.append(head,body);scroll.append(table);details.append(summary,scroll);nodes.push(details);get('verification-results').replaceChildren(...nodes);get('verification-export').disabled=false;
    }catch(error){if(token===reportGeneration&&selection===generation){report=null;get('verification-results').replaceChildren(el('p','Comparison unavailable: '+error.message));}}finally{if(token===reportGeneration&&selection===generation)get('verification-run').disabled=false;}
  }
  get('observation-card').hidden=!enabled;get('observation-station').onchange=()=>select(get('observation-station').value);get('verification-run').onclick=verify;
  let refreshing=false;
  get('observation-refresh').onclick=async()=>{if(refreshing)return;if(!station){if(place){const retry=place;place=null;await updatePlace(retry);}return;}refreshing=true;const token=generation,id=station.id;try{const result=await json('/api/observations/station?id='+id);if(token!==generation)return;data=result;render();get('verification-run').disabled=false;}catch(error){if(token===generation){if(data){data={...data,stale:true,error:error.message};render();}else get('observation-status').textContent='Observations unavailable: '+error.message;}}finally{refreshing=false;}};
  get('verification-export').onclick=()=>{if(!report)return;const url=window.URL.createObjectURL(new Blob([JSON.stringify(report,null,2)],{type:'application/json'})),a=el('a');a.href=url;a.download='ventusiq-temperature-'+report.station.id+'.json';a.click();window.setTimeout(()=>window.URL.revokeObjectURL(url),1000);};
  window.WeatherObservations={updatePlace};if(enabled)updatePlace(window.WeatherPersonal?.current());
  window.setInterval(()=>{if(data){render();const cached=cache.get('/api/observations/station?id='+station.id);if(!get('personal-workspace').hidden&&cached&&clock()-cached.at>=1800000)get('observation-refresh').onclick();}},60000);
  return {updatePlace,select,verify};
}
if(typeof window!=='undefined'&&typeof document!=='undefined')mountObservations({document,window});
