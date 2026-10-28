import {compareRiverForecasts,forecastIdentity} from './river-changes-core.mjs';
export function mountRiverChanges({document,window,fetcher=fetch,clock=Date.now}){
  const get=id=>document.getElementById(id),el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;},hosted=window.WEATHER_CONFIG?.mode==='hosted',session=new Map();let product=null,report=null,generation=0,busy=false;
  const time=t=>t?new Date(t).toLocaleString():'unavailable',value=(v,unit)=>v===null||v===undefined?'unknown':v.toLocaleString(undefined,{maximumFractionDigits:2})+' '+unit,signed=(v,unit)=>(v>0?'+':'')+value(v,unit);
  const fresh=p=>p&&!p.stale&&!p.error&&Number.isFinite(Date.parse(p.checked_at))&&clock()-Date.parse(p.checked_at)<=1350000;
  function clear(){generation++;busy=false;report=null;get('river-change-export').disabled=true;get('river-change-results').replaceChildren();}
  function updateGauge(next){
    const changed=next?.metadata?.lid!==product?.metadata?.lid||next?.revision!==product?.revision||next?.checked_at!==product?.checked_at||!!next?.stale!==!!product?.stale||next?.error!==product?.error;
    if(!hosted&&next){const id=next.metadata.lid,old=session.get(id),identity=forecastIdentity(next);session.set(id,{identity,current:next,previous:old?.identity!==identity?old?.current||null:old?.previous||null});if(session.size>48)session.delete(session.keys().next().value);}
    product=next;if(changed||!fresh(next)){clear();get('river-change-status').textContent=!next?'Choose a gauge.':!fresh(next)?'Refresh the gauge before comparing delayed products.':hosted?'Compare the latest collected forecast with the preceding distinct forecast in the seven-day archive.':'Compare distinct forecasts collected while this tab is open.';}
    get('river-change-run').disabled=!fresh(next)||busy;
  }
  function table(headers,rows){const scroll=el('div',undefined,'hourly-scroll'),table=el('table',undefined,'hourly-table'),head=el('thead'),tr=el('tr'),body=el('tbody');for(const h of headers)tr.append(el('th',h));head.append(tr);for(const values of rows){const row=el('tr');for(const v of values)row.append(el('td',v));body.append(row);}table.append(head,body);scroll.append(table);return scroll;}
  function crossingText(c){return c.status==='unknown'?'Unknown coverage':c.status==='not_reached'?'Not reached in sampled horizon':c.after?`${time(c.after)} – ${time(c.at)}`:`At/above at ${time(c.at)}; crossing unknown`;}
  function render(){const r=report,nodes=[];get('river-change-status').textContent=r.status==='compared'?`Current issue ${time(r.current_issued_at)} · previous issue ${time(r.previous_issued_at)}`:r.reason;get('river-change-export').disabled=false;
    if(r.archive?.truncated)nodes.push(el('p','The archive scan reached its 128-product limit without a distinct forecast. Older retained products may contain a baseline.','warning-note'));
    if(r.status==='compared'){
      nodes.push(el('p',`${r.horizon.matched} matching future timestamps between ${time(r.horizon.start)} and ${time(r.horizon.end)}. Current product has ${r.horizon.current_future} future samples; previous has ${r.horizon.previous_future}. Unmatched times are excluded; values are not interpolated.`,'small'),el('p',`Largest matched change: ${signed(r.largest_change.change,r.unit)} at ${time(r.largest_change.at)}.`),el('p',`Highest matched sample: ${value(r.high.previous.value,r.unit)} → ${value(r.high.current.value,r.unit)} (${signed(r.high.change,r.unit)}). This is a shared-horizon sample maximum, not a guaranteed crest.`));
      if(r.high.previous.repeated||r.high.current.repeated||r.high.previous.at_end||r.high.current.at_end)nodes.push(el('p','At least one maximum repeats or occurs at the shared horizon’s end. A unique or later crest is not established.','small'));
      if(r.same_issue_revision)nodes.push(el('p','Forecast values changed under the same source issue timestamp; this is a collected revision, not evidence of a later issue.','small'));
      if(r.datum_status==='not_supplied')nodes.push(el('p','Vertical reference details are not supplied. The same-gauge comparison assumes an unchanged reference.','warning-note'));
      const labels={newly_reaches:'Now reaches this threshold',no_longer_reaches:'No longer reaches in this horizon',still_reaches:'Both forecasts reach it',neither_reaches:'Neither forecast reaches it',threshold_changed:'Threshold changed or unavailable',unknown:'Comparison unknown'};
      nodes.push(el('h3','Threshold timing changes'));if(!r.thresholds.length)nodes.push(el('p','No ordered compatible thresholds were available.'));
      for(const t of r.thresholds){const box=el('article',undefined,'river-impact');box.append(el('strong',`${t.name} · ${value(t.previous_value,r.unit)} → ${value(t.current_value,r.unit)}`),el('p',labels[t.change]),el('p','Previous: '+crossingText(t.before)),el('p','Current: '+crossingText(t.after)));
        if(t.timing){const a=t.timing.earliest_hours,b=t.timing.latest_hours;box.append(el('p',a>0?`Crossing bracket moved later by ${value(a,'to')} ${value(b,'hours')}.`:b<0?`Crossing bracket moved earlier by ${value(-b,'to')} ${value(-a,'hours')}.`:'Crossing brackets overlap or touch; an earlier/later crossing is not established.','small'));}
        if(t.change==='threshold_changed')box.append(el('p','Do not attribute this threshold result to forecast changes alone.','warning-note'));nodes.push(box);
      }
      const detail=el('details');detail.append(el('summary','Inspect matching forecast samples'),table(['Valid time','Previous','Current','Change'],r.pairs.map(p=>[time(p.at),value(p.previous,r.unit),value(p.current,r.unit),signed(p.change,r.unit)])));nodes.push(detail);
    }
    nodes.push(el('p',`Current checked ${time(r.current_checked_at)} · previous checked ${time(r.previous_checked_at)}. Changes describe collected forecasts; they do not prove measured flooding or improved forecast accuracy.`,'small'));get('river-change-results').replaceChildren(...nodes);
  }
  async function run(){if(!fresh(product)||busy)return;clear();const token=generation,id=product.metadata.lid;busy=true;get('river-change-run').disabled=true;get('river-change-status').textContent='Comparing collected forecast revisions…';
    try{let result;if(hosted){const response=await fetcher('/api/rivers/changes?id='+encodeURIComponent(id),{signal:AbortSignal.timeout(60000)});if(!response.ok)throw Error('Comparison returned HTTP '+response.status);result=await response.json();}else result={...compareRiverForecasts(product,session.get(id)?.previous||null,clock()),archive:{mode:'browser-session'}};
      if(token!==generation)return;product=result.current;window.WeatherRivers?.acceptProduct?.(product);report=result;render();get('river-change-export').disabled=!fresh(product);
    }catch(error){if(token===generation)get('river-change-status').textContent='Forecast comparison unavailable: '+error.message;}
    finally{if(token===generation){busy=false;get('river-change-run').disabled=!fresh(product);}}
  }
  get('river-change-run').onclick=run;get('river-change-export').onclick=()=>{if(!report)return;if(!fresh(product)){updateGauge(product);return;}const url=window.URL.createObjectURL(new Blob([JSON.stringify(report,null,2)],{type:'application/json'})),a=el('a');a.href=url;a.download='ventusiq-river-forecast-changes.json';a.click();window.setTimeout(()=>window.URL.revokeObjectURL(url),1000);};window.WeatherRiverChanges={updateGauge};updateGauge(window.WeatherRivers?.currentProduct?.()||null);window.setInterval(()=>{if(product&&!fresh(product))updateGauge(product);},60000);return {updateGauge,run};
}
if(typeof window!=='undefined'){const start=()=>mountRiverChanges({document,window});if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();}
