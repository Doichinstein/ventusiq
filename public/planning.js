import {evaluatePlan,preferences,PRESETS} from './planning-core.mjs';
export function mountPlanner({document,window,fetcher=fetch,clock=Date.now}){
  const get=id=>document.getElementById(id),el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
  const fields={duration:'plan-duration',minTemp:'plan-min',maxTemp:'plan-max',wind:'plan-wind',rain:'plan-rain',gust:'plan-gust',tempMargin:'plan-temp-margin',windMargin:'plan-wind-margin',rainMargin:'plan-rain-margin',smoke:'plan-smoke',pm25:'plan-pm25'};
  let report=null,key=null,generation=0,grid=null,pending=false,nextFetch=0,signature=null;
  function fill(p){for(const [name,id] of Object.entries(fields))get(id).value=p[name]??'';}
  function input(){return preferences(Object.fromEntries(Object.entries(fields).map(([name,id])=>[name,get(id).value])));}
  function fmt(t){const zone=window.WeatherPersonal?.context?.()?.forecast?.metadata?.properties?.timeZone;try{return new Date(t).toLocaleString(undefined,{timeZone:zone,weekday:'short',hour:'numeric',minute:'2-digit',timeZoneName:'short'});}catch{return new Date(t).toISOString();}}
  const number=(n,suffix)=>n===null?'unknown':Math.round(n)+suffix;
  async function loadGrid(context){
    if(pending||clock()<nextFetch||!context.forecast?.metadata)return;const token=generation;pending=true;nextFetch=clock()+600000;get('plan-grid-status').textContent='Checking the official gust forecast…';
    try{const hosted=window.WEATHER_CONFIG?.mode==='hosted',url=hosted?`/api/planning/grid?lat=${context.place.lat}&lon=${context.place.lon}`:context.forecast.metadata.properties?.forecastGridData;if(!hosted&&!/^https:\/\/api\.weather\.gov\/gridpoints\/[A-Z]{3}\/-?\d+,-?\d+$/.test(url||''))throw Error('Grid data unavailable for this place');const r=await fetcher(url,{headers:{Accept:'application/geo+json, application/json'},signal:AbortSignal.timeout(60000)});if(!r.ok)throw Error('Gust source returned HTTP '+r.status);const data=await r.json();if(token!==generation)return;grid=hosted?data:{grid:data,source_url:url,issued_at:data.properties?.updateTime,checked_at:new Date(clock()).toISOString(),stale:false};if(grid.stale||grid.error)nextFetch=clock()+120000;
    }catch(error){if(token!==generation)return;grid={...grid,stale:true,error:error.message};nextFetch=clock()+120000;}
    finally{if(token===generation){pending=false;refresh();}}
  }
  function render(){
    const r=report,p=r.preferences;get('plan-grid-status').textContent=grid?.error?'Gust updates delayed: '+grid.error:r.grid_fresh?`Gust grid issued ${fmt(grid.issued_at)} · checked ${fmt(grid.checked_at)}`:pending?'Checking the official gust forecast…':'Gust forecast missing or stale. A requested gust limit remains unknown.';
    const air=r.air;get('plan-air').textContent=air.monitor?`Nearby PM2.5: AQI ${air.monitor.properties.aqi} (${air.category}), ${air.monitor.properties.name}, ${air.monitor.distance_km.toFixed(1)} km away, measured ${fmt(air.monitor.properties.observed_at)}. Future air quality is unknown. ${air.note}`:'No fresh measured PM2.5 monitor with AQI within 50 km. Current and future air-quality coverage is unknown.';
    if(r.sources.air_forecast)get('plan-air').textContent=air.monitor?`Nearby measured PM2.5: AQI ${air.monitor.properties.aqi} (${air.category}). ${air.note}`:'No fresh nearby PM2.5 monitor. Model forecasts are separate from measurements.';
    get('plan-pm25-status').textContent=p.pm25===null?'No total PM2.5 limit requested. Load its forecast above for optional context.':`Total PM2.5 ceiling ${p.pm25} µg/m³, checked against hourly samples spanning each window. Load its forecast if coverage is unknown. Run age and concentrations between samples remain unknown.`;
    get('plan-smoke-status').textContent=p.smoke===null?'Smoke is shown as context; no smoke ceiling is requested.':`Requested smoke-sample ceiling: ${p.smoke} µg/m³. Every hourly sample spanning the window is checked, including the samples just before its start and just after its end when needed. This does not bound smoke between forecast times.`;
    if(!r.forecast_fresh){get('plan-results').replaceChildren(el('p','Planning is paused while the hourly forecast is missing, stale or has no current issue time.','warning-note'));return;}
    const fits=r.windows.filter(w=>w.status==='fits'),options=[];for(const w of r.windows){if(options.every(o=>Math.abs(Date.parse(o.start)-Date.parse(w.start))>=p.duration*3600000))options.push(w);if(options.length===3)break;}
    const nodes=[el('p',fits.length?`${fits.length} candidate windows meet your numeric limits. Windows that also pass your extra margins appear first.`:'No full window can be confirmed against every requested limit. Check the reasons below.')];
    if(!options.length)nodes.push(el('p','No upcoming forecast intervals are available.'));
    for(const w of options){const box=el('article',undefined,`plan-window ${w.status==='fits'?'fits':''}`);box.append(el('strong',`${fmt(w.start)} – ${fmt(w.end)}`),el('p',w.status==='fits'?(w.passes_margin?(p.smoke===null?'Limits and extra margins met':'Weather limits, extra weather margins and smoke-sample ceiling met'):(p.smoke===null?'Limits met; extra margins not met':'Weather limits and smoke-sample ceiling met; extra weather margins not met')):w.status==='unknown'?'Some requested checks are unknown':'Outside one or more limits'),el('p',`${number(w.values.min_temperature_f,'')}–${number(w.values.max_temperature_f,'°F')} · sustained wind ${number(w.values.sustained_wind_mph,' mph')} · gust ${number(w.values.gust_mph,' mph')} · rain chance ${number(w.values.rain_percent,'%')}`));
      for(const c of w.checks.filter(c=>c.status!=='fits'))box.append(el('p',`${c.label}: ${c.status==='unknown'?'missing, stale or incomplete coverage':'exceeds your limits'}`,'warning-note'));
      if(w.status==='fits'&&!w.passes_margin)box.append(el('p','Margin test: '+w.margin_checks.filter(c=>c.status!=='fits').map(c=>c.label).join(', ')+'.','small'));
      if(w.alerts.length)box.append(el('p','Official alerts overlap this window: '+w.alerts.map(f=>f.properties.event).join(', ')+'. Read the instructions above before planning.','warning-note'));
      if(!w.coverage.alerts)box.append(el('p','Alert coverage is incomplete or delayed; absence of a listed overlap is not an all-clear.','warning-note'));
      const pm=w.pm25;if(p.pm25!==null||pm.samples.length){box.append(el('p',`Total PM2.5: ${pm.samples.filter(s=>s.pm2_5_ug_m3!==null).length}/${pm.samples.length} samples · highest available ${pm.maximum_ug_m3===null?'unknown':pm.maximum_ug_m3.toLocaleString(undefined,{maximumFractionDigits:1})+' µg/m³'}${pm.fresh?'':' · retrieval missing/delayed'}. ${p.pm25!==null&&pm.status==='fits'?'PM2.5 sample ceiling met. ':''}Model-run age is unknown.`,'small'));if(pm.reason)box.append(el('p',pm.reason,'small'));const detail=el('details');detail.append(el('summary','Total PM2.5 samples spanning this window'));for(const sample of pm.samples)detail.append(el('p',`${fmt(sample.at)}: ${sample.pm2_5_ug_m3===null?'unknown':sample.pm2_5_ug_m3+' µg/m³'}`,'small'));box.append(detail);}
      const smoke=w.smoke;
      if(smoke.samples.length){
        box.append(el('p',`Modeled smoke: ${smoke.samples.filter(s=>s.smoke_ug_m3!==null).length}/${smoke.samples.length} hourly samples available · highest available sample ${smoke.maximum_ug_m3===null?'unknown':smoke.maximum_ug_m3.toLocaleString(undefined,{maximumFractionDigits:1})+' µg/m³'}${smoke.fresh?'':' · delayed data'}.`,'small'));
        const details=el('details');details.append(el('summary','Smoke samples spanning this window'));
        for(const sample of smoke.samples)details.append(el('p',`${fmt(sample.at)}: ${sample.smoke_ug_m3===null?'unknown — '+sample.reason:sample.smoke_ug_m3.toLocaleString(undefined,{maximumFractionDigits:1})+' µg/m³'}`,'small'));
        details.append(el('p',`RAP run ${fmt(smoke.issued_at)} · checked ${fmt(smoke.checked_at)}. These instantaneous values do not establish continuous concentrations or total PM2.5.`,'small'));box.append(details);
      }
      if(smoke.reason)box.append(el('p',smoke.reason+'.','small'));
      box.append(el('p','Smoke samples do not establish health-safe air, AQI or personal exposure during this window.','small'));nodes.push(box);
    }
    nodes.push(el('p',r.uncertainty,'small'));get('plan-results').replaceChildren(...nodes);
  }
  function refresh(){
    const c=window.WeatherPersonal?.context?.(),newKey=c?.place?`${c.place.lat},${c.place.lon}`:null;
    if(newKey!==key){key=newKey;generation++;pending=false;nextFetch=0;grid=null;signature=null;report=null;get('plan-export').disabled=true;}
    if(!c?.place){get('plan-results').replaceChildren();get('plan-air').textContent='';get('plan-grid-status').textContent='';get('plan-smoke-status').textContent='';get('plan-pm25-status').textContent='';return;}
    loadGrid(c);let pref;try{pref=preferences(window.WeatherPersonal?.preferences?.()||input());report=evaluatePlan({...c,grid,airForecast:window.WeatherAirForecast?.snapshot?.(),smoke:window.WeatherSmoke?.snapshot?.(),air:window.WeatherHazards?.snapshot?.('air'),preferences:pref,now:clock(),core:window.WeatherCore});}catch(error){report=null;get('plan-results').replaceChildren(el('p',error.message));get('plan-export').disabled=true;return;}
    get('plan-export').disabled=false;const next=JSON.stringify([report,grid?.error]);if(next!==signature){signature=next;render();}
  }
  let initial;try{initial=preferences(window.WeatherPersonal?.preferences?.()||{});}catch{initial=preferences();window.WeatherPersonal?.setPreferences?.(initial);}fill(initial);
  const custom=el('option','Custom limits');custom.value='';get('plan-preset').replaceChildren(custom,...Object.entries(PRESETS).map(([id,p])=>{const o=el('option',p.label);o.value=id;return o;}));get('plan-preset').value='';
  get('plan-preset').onchange=()=>{const preset=PRESETS[get('plan-preset').value];if(!preset)return;fill(preferences({...window.WeatherPersonal?.preferences?.(),...preset}));get('plan-preset-note').textContent=preset.label+' defaults loaded. Edit any value, then compare. These are comfort preferences, not validated safety limits.';};
  get('planner-form').onsubmit=e=>{e.preventDefault();try{const p=input();window.WeatherPersonal.setPreferences(p);get('plan-preset-note').textContent='Limits saved on this device. Extra margins test warmer/colder, windier and wetter scenarios; they are not forecast error estimates.';refresh();}catch(error){get('plan-preset-note').textContent=error.message;}};
  get('plan-pm25-load').onclick=()=>window.WeatherAirForecast?.run?.();
  get('plan-grid-refresh').onclick=()=>{nextFetch=0;refresh();};
  get('plan-export').onclick=()=>{refresh();if(!report)return;const url=window.URL.createObjectURL(new Blob([JSON.stringify(report,null,2)],{type:'application/json'})),a=el('a');a.href=url;a.download='ventusiq-activity-plan.json';a.click();window.setTimeout(()=>window.URL.revokeObjectURL(url),1000);};
  window.WeatherPlanner={refresh};refresh();window.setInterval(refresh,60000);return {refresh};
}
if(typeof window!=='undefined'){const start=()=>mountPlanner({document,window});if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();}
