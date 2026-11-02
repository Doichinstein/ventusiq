import {ensemblePoint} from './ensemble-core.mjs';
import {smokePoint} from './smoke-core.mjs';
import {SOURCE_METHOD,SOURCES,localDay,dayComparison,sourceScorecard,eligiblePairs,thresholdStats} from './source-intelligence-core.mjs';
export function mountSourceIntelligence({document,window,fetcher=fetch,clock=Date.now,selection}){
  const get=id=>document.getElementById(id),el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
  const num=v=>Number.isFinite(v)?v.toFixed(1):'Unknown',percent=v=>v===null?'Unknown':(v*100).toFixed(0)+'%';
  let generation=0,reportGeneration=0,displayedDecision=null,reports=null,score=null,daily=null,earlier=null,dayKey=null,archiveError=null,archivePending=false,selected=null;
  const fmt=t=>{try{return new Date(t).toLocaleString(undefined,{timeZone:selected?.station?.time_zone||'UTC',month:'short',day:'numeric',hour:'numeric',minute:'2-digit',timeZoneName:'short'});}catch{return 'Unknown';}};
  function table(head,rows){const wrap=el('div',undefined,'hourly-scroll'),t=el('table',undefined,'hourly-table'),thead=el('thead'),tr=el('tr'),body=el('tbody');for(const h of head)tr.append(el('th',h));thead.append(tr);for(const row of rows){const r=el('tr');for(const v of row)r.append(el('td',v));body.append(r);}t.append(thead,body);wrap.append(t);wrap.setAttribute('tabindex','0');return wrap;}
  function reset(){generation++;reportGeneration++;displayedDecision=null;reports=null;score=null;daily=null;earlier=null;dayKey=null;archiveError=null;archivePending=false;selected=selection();get('intelligence-run').disabled=!selected?.station;get('intelligence-export').disabled=true;get('intelligence-status').textContent='Evaluate the retained local archive when you are ready.';get('intelligence-sources').replaceChildren();get('intelligence-decision').replaceChildren();get('intelligence-day').replaceChildren(el('p','Select a place and observation station to compare today.','small'));window.WeatherPlanner?.refresh?.();}
  function chart(r){
    const ns='http://www.w3.org/2000/svg',svg=document.createElementNS(ns,'svg'),values=[...r.earlier,...r.readings,...r.remaining].map(p=>p.temperature).filter(Number.isFinite);if(!values.length)return el('p','No eligible temperature values for this local day.','small');
    svg.setAttribute('viewBox','0 0 640 215');svg.setAttribute('role','img');svg.setAttribute('aria-label','Today’s temperatures: dashed blue earlier forecast, green station readings, orange remaining forecast. Gaps over 90 minutes break each line. Exact values are in the table below.');
    const add=(tag,attrs,text)=>{const n=document.createElementNS(ns,tag);for(const [k,v] of Object.entries(attrs))n.setAttribute(k,v);if(text!==undefined)n.textContent=text;svg.append(n);return n;};
    const low=Math.floor(Math.min(...values))-2,high=Math.ceil(Math.max(...values))+2,x=t=>55+(t-r.day.start)/(r.day.end-r.day.start)*565,y=v=>165-(v-low)/(high-low)*135;
    for(const v of [low,(low+high)/2,high]){add('line',{x1:55,x2:620,y1:y(v),y2:y(v),class:'chart-grid'});add('text',{x:4,y:y(v)+4},v.toFixed(0)+'°F');}
    for(const [rows,color,dash] of [[r.earlier,'#88baff','6 4'],[r.observation_series,'#67e8b3',''],[r.remaining,'#ffbb70','']]){let path='',previous=null;for(const p of rows){if(!Number.isFinite(p.temperature)){previous=null;continue;}path+=(previous&&p.at-previous.at<=5400000?' L':' M')+x(p.at).toFixed(1)+' '+y(p.temperature).toFixed(1);previous=p;add('circle',{cx:x(p.at),cy:y(p.temperature),r:2,fill:color});}add('path',{d:path,fill:'none',stroke:color,'stroke-width':2,'stroke-dasharray':dash});}
    add('line',{x1:x(clock()),x2:x(clock()),y1:20,y2:170,stroke:'#aaa','stroke-dasharray':'3 5'});add('text',{x:55,y:200},'Local midnight');add('text',{x:450,y:200},'Next midnight');return svg;
  }
  function renderDay(){
    const context=window.WeatherPersonal?.context?.(),s=selection();if(!s?.station||!s?.data)return;
    // Only the active point's outlook may be used, even while old requests complete.
    const same=context?.place?.lat===s.place?.lat&&context?.place?.lon===s.place?.lon;
    daily=dayComparison({now:clock(),zone:s.station.time_zone||'UTC',earlier,current:same?context.forecast:null,observed:s.data});
    const r=daily,nodes=[el('p',`${s.station.name} (${s.station.id}) · ${s.station.distance_km.toFixed(1)} km from your point. ${s.station.time_zone?'Station local day':'UTC day; station timezone unavailable'}.`,'small')];
    nodes.push(el('p',r.readings.length?`Observed so far: ${num(r.observed_min_f)}–${num(r.observed_max_f)}°F · ${r.readings.length} accepted readings.`:'No quality-accepted readings for today yet.'));
    if(r.observed_delayed||r.observations_partial)nodes.push(el('p','Observations are delayed or partial. These are extrema of the available samples, not a complete daily high or low.','warning-note'));
    else nodes.push(el('p','Observed extrema describe available station samples. They do not bound the temperature at your location or predict the rest of the day.','small'));
    nodes.push(el('p','Dashed blue: forecast collected before today · Green: observed · Orange: remaining outlook','small'),chart(r));
    if(!r.earlier.length)nodes.push(el('p',archivePending?'Reading the forecast archived before local midnight…':archiveError||'No forecast captured before this local day is available. Today’s version cannot reconstruct it.','small'));
    if(r.outlook_delayed)nodes.push(el('p','Remaining outlook is missing or delayed. Check its issue and collection times before using it.','warning-note'));
    const details=el('details');details.append(el('summary','Today’s readings, outlook & timestamps'));
    details.append(el('p',`Earlier: issued ${r.earlier_issued_at?fmt(r.earlier_issued_at):'unknown'}; collected ${r.earlier_checked_at?fmt(r.earlier_checked_at):'unknown'}. Latest: issued ${r.current_issued_at?fmt(r.current_issued_at):'unknown'}; checked ${r.current_checked_at?fmt(r.current_checked_at):'unknown'}.`,'small'));
    const rows=[...r.earlier.map(p=>[p.at,'Earlier forecast',p.temperature]),...r.readings.map(p=>[p.at,'Observed · QC '+p.temperature_qc,p.temperature]),...r.remaining.map(p=>[p.at,'Remaining outlook',p.temperature])].sort((a,b)=>a[0]-b[0]);details.append(table(['Station local time','Evidence','°F'],rows.map(p=>[fmt(p[0]),p[1],num(p[2])])));nodes.push(details);get('intelligence-day').replaceChildren(...nodes);get('intelligence-export').disabled=false;
  }
  async function update(){
    const s=selection();if(!s?.station||!s?.data)return;selected=s;
    const day=localDay(clock(),s.station.time_zone||'UTC'),key=JSON.stringify([s.place.lat,s.place.lon,s.station.id,day.start]);
    if(dayKey!==key){dayKey=key;earlier=null;archiveError=null;archivePending=true;const token=generation;renderDay();
      try{const response=await fetcher('/api/forecast?'+new URLSearchParams({lat:s.place.lat,lon:s.place.lon,at:new Date(day.start-1000).toISOString()}),{signal:AbortSignal.timeout(30000)});const r=await response.json();if(token!==generation||key!==dayKey)return;if(response.ok)earlier=r;else if(response.status!==404)archiveError='Earlier forecast unavailable: '+(r.error||response.status);}
      catch(e){if(token===generation&&key===dayKey)archiveError='Earlier forecast unavailable: '+e.message;}
      finally{if(token===generation&&key===dayKey){archivePending=false;renderDay();}}
    }else renderDay();
  }
  function decisionFor({place,preferences}){
    if(!reports?.nws||!selected||place?.lat!==selected.place?.lat||place?.lon!==selected.place?.lon)return null;
    const pairs=eligiblePairs({...reports.nws,lead_analysis:null},'nws');
    const min=Number(preferences?.minTemp),max=Number(preferences?.maxTemp);if(!Number.isFinite(min)||!Number.isFinite(max)||min>max)return null;
    const baseline=eligiblePairs({pairs:reports.nws.persistence?.overall?.pairs||[]},'nws');
    return {method:SOURCE_METHOD,source:'NWS hourly',station:selected.station,point:selected.place,evaluated_at:reports.nws.generated_at,window:reports.nws.window,
      ...thresholdStats(pairs,min,max),lead_groups:[[6,12],[12,24]].map(([lo,hi])=>({label:`${lo}–${hi} h`,...thresholdStats(pairs.filter(p=>p.lead_hours>=lo&&p.lead_hours<hi),min,max)})),
      persistence:baseline.length?{forecast:thresholdStats(baseline,min,max),baseline:thresholdStats(baseline.map(p=>({...p,forecast_f:p.baseline.temperature_f,error_f:p.baseline.temperature_f-p.observed_f})),min,max)}:null,
      interpretation:'Retrospective hourly temperature-limit checks at a nearby station, with 6–24 hour forecast lead. Not a probability for an upcoming activity, a complete-window success rate or a route assessment. Limits can be changed after seeing outcomes; this is exploratory. Rain, gust, smoke and air-quality reliability are unscored.'};
  }
  function renderDecision(){
    const target=get('intelligence-decision');if(!reports){target.replaceChildren(el('p','Evaluate the local archive first.','small'));return;}
    const min=get('intelligence-min').value,max=get('intelligence-max').value;if(min.trim()===''||max.trim()===''){target.replaceChildren(el('p','Enter both temperature limits.'));return;}
    const r=decisionFor({place:selected.place,preferences:{minTemp:min,maxTemp:max}});displayedDecision=r;if(!r){target.replaceChildren(el('p','Enter a valid minimum and maximum.'));return;}
    const c=r.counts,nodes=[el('p',r.sample_count?`${c.within_both}/${r.predicted_within} forecasts within your limits also had a reading within them (${percent(r.within_hit_fraction)}).`:'No eligible local temperature pairs yet.'),el('p',`${r.sample_count} hourly cases across ${r.days} UTC days. Limits include both endpoints. Consecutive hours are correlated.`,'small'),table(['Outcome','Cases'],[['Within limits in both forecast and observation',c.within_both],['Forecast within; observation outside (miss)',c.missed_exceedance],['Forecast outside; observation within (false alarm)',c.false_exceedance],['Outside in both',c.outside_both]]),el('p',`Miss rate: ${c.missed_exceedance}/${r.observed_outside} observed exceedances (${percent(r.miss_fraction)}). False-alarm rate: ${c.false_exceedance}/${r.predicted_outside} forecast exceedances (${percent(r.false_alarm_fraction)}).`,'small')];
    for(const g of r.lead_groups)nodes.push(el('p',`${g.label}: ${g.sample_count} cases; ${g.counts.missed_exceedance} missed exceedances; ${g.counts.false_exceedance} false alarms.`,'small'));
    if(r.persistence)nodes.push(el('p',`Same ${r.persistence.forecast.sample_count} cases with an archived persistence baseline: NWS missed ${r.persistence.forecast.counts.missed_exceedance} exceedances; holding the earlier reading constant missed ${r.persistence.baseline.counts.missed_exceedance}. This subset may differ from the full sample.`,'small'));
    nodes.push(el('p',r.interpretation,'small'));target.replaceChildren(...nodes);
  }
  function renderScore(){
    const nodes=[el('p','Temperature only · retained past seven days · source leads 6 to under 24 hours. Unpaired rows can cover different weather; use the shared-case comparisons below.','small')];
    for(const s of score.sources){const d=el('details');d.append(el('summary',`${s.label} · ${s.sample_count?num(s.mae_f)+'°F mean absolute error':'No eligible pairs'}`),el('p',`${s.sample_count} forecast cases across ${s.days} UTC days · bias ${num(s.bias_f)}°F. Positive means warmer forecasts.`),el('p',s.lineage,'small'));
      for(const g of s.groups)d.append(el('p',`${g.label}: ${g.sample_count} cases; MAE ${num(g.mae_f)}°F; bias ${num(g.bias_f)}°F.`,'small'));
      d.append(el('p',`Evaluated ${s.generated_at?fmt(s.generated_at):'not available'} · observations checked ${s.observation_checked_at?fmt(s.observation_checked_at):'unknown'}.`,'small'));
      if(s.error||s.delayed)d.append(el('p',s.error||'Observation collection delayed or partial.','warning-note'));nodes.push(d);
    }
    for(const p of score.shared){const left=SOURCES.find(s=>s.id===p.left).label,right=SOURCES.find(s=>s.id===p.right).label;nodes.push(el('p',`${left} / ${right}: ${p.left_stats.sample_count} shared cases across ${p.left_stats.days} UTC days; MAE ${num(p.left_stats.mae_f)} / ${num(p.right_stats.mae_f)}°F.`,'small'));}
    nodes.push(el('p','Shared cases require the identical valid time, station observation and lead band; exact leads and forecast collection times can still differ. These descriptive errors do not establish a winner or supply model weights. NWS guidance, HRRR and GEFS can share information; agreement is not three independent votes.','small'));get('intelligence-sources').replaceChildren(...nodes);
  }
  async function run(){const s=selection();if(!s?.station||!s?.place)return;const token=++reportGeneration;selected=s;reports=null;displayedDecision=null;score=null;get('intelligence-run').disabled=true;get('intelligence-sources').replaceChildren();get('intelligence-decision').replaceChildren();get('intelligence-status').textContent='Evaluating retained local evidence for NWS, HRRR and GEFS…';window.WeatherPlanner?.refresh?.();
    const query=new URLSearchParams({lat:s.place.lat,lon:s.place.lon,station:s.station.id});
    const entries=await Promise.all(SOURCES.map(async source=>{try{const path={nws:'/api/verification',hrrr:'/api/forecast/hrrr-verification',gefs:'/api/ensemble/verification'}[source.id],r=await fetcher(path+'?'+query,{signal:AbortSignal.timeout(60000)}),body=await r.json();if(!r.ok)throw Error(body.error||'Source unavailable');if(body.station?.id!==s.station.id)throw Error('Station evidence does not match the selection');const target=source.id==='nws'?`${Number(s.place.lat).toFixed(4)},${Number(s.place.lon).toFixed(4)}`:source.id==='gefs'?ensemblePoint(s.place.lat,s.place.lon):smokePoint(s.place.lat,s.place.lon);if(typeof target==='string'?body.point!==target:body.point?.lat!==target.lat||body.point?.lon!==target.lon)throw Error('Location evidence does not match the selection');return [source.id,body];}catch(e){return [source.id,{error:e.message,pairs:[]}];}}));
    if(token!==reportGeneration)return;reports=Object.fromEntries(entries);score=sourceScorecard(reports);renderScore();renderDecision();get('intelligence-status').textContent='Local evaluation finished. Missing archives remain unknown; no new model run was requested.';get('intelligence-run').disabled=false;get('intelligence-export').disabled=false;window.WeatherPlanner?.refresh?.();
  }
  const p=window.WeatherPersonal?.preferences?.()||{};get('intelligence-min').value=String(p.minTemp??40);get('intelligence-max').value=String(p.maxTemp??85);
  get('intelligence-run').onclick=run;get('intelligence-limits').onsubmit=e=>{e.preventDefault();renderDecision();};
  get('intelligence-min').oninput=get('intelligence-max').oninput=()=>{displayedDecision=null;get('intelligence-decision').replaceChildren(el('p','Limits changed. Apply them to update this retrospective check.','small'));};
  get('intelligence-export').onclick=()=>{const body={method:SOURCE_METHOD,exported_at:new Date(clock()).toISOString(),place:selected?.place,station:selected?.station,today:daily,scorecard:score,decision:displayedDecision,source_reports:reports};const url=window.URL.createObjectURL(new Blob([JSON.stringify(body,null,2)],{type:'application/json'})),a=el('a');a.href=url;a.download='ventusiq-local-temperature-evidence.json';a.click();window.setTimeout(()=>window.URL.revokeObjectURL(url),1000);};
  window.WeatherSourceIntelligence={decisionFor};reset();return {reset,update,run,decisionFor};
}
