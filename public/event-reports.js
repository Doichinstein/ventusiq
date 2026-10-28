export function mountEventReports({document,window,fetcher=fetch}){
  const get=id=>document.getElementById(id),el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
  let story=null,asof=null,report=null,generation=0;
  const time=t=>t?new Date(t).toLocaleString():'unavailable';
  function updateStory(next,at=null){generation++;story=next;asof=at;report=null;get('event-reports-results').replaceChildren();get('event-reports-export').disabled=true;get('event-reports-run').disabled=!next;get('event-reports-status').textContent=!next?'Select a collected event.':at?'Historical view: only report editions and zone boundaries already collected by this cutoff can be used.':'Find preliminary tornado, wind and hail reports within this alert chain’s areas and times.';}
  function render(){
    const r=report,nodes=[];get('event-reports-status').textContent=`${r.matched_count} overlapping preliminary reports in the available editions. Report view ${time(r.as_of)} · alert archive ${time(r.alert_as_of)}.`;
    if(r.scope.unsupported_events.length)nodes.push(el('p','SPC tornado, wind and hail reports do not cover these alert types: '+r.scope.unsupported_events.join(', ')+'. Their outcomes remain unknown.','small'));
    if(!r.scope.windows.length)nodes.push(el('p','No eligible severe-convective alert window is available. This source does not establish flood, winter-weather, heat or fire outcomes.'));
    if(r.scope.days_omitted||r.scope.span_exceeds_limit||r.scope.windows_omitted||r.scope.invalid_windows||r.reports_omitted)nodes.push(el('p',`Coverage is partial: ${r.scope.days_omitted} additional source days, ${r.scope.windows_omitted} alert revisions and ${r.reports_omitted} matching reports are outside this bounded view; ${r.scope.invalid_windows} alert windows have invalid times.`,'warning-note'));
    const missing=r.areas.filter(a=>!a.complete);if(missing.length)nodes.push(el('p',`${missing.length} alert revisions have incomplete geographic coverage. Missing boundaries cannot be treated as areas without reports.`,'warning-note'));
    for(const d of r.days)nodes.push(el('p',`${d.day} report day (12:00 UTC to next day 11:59 UTC): ${d.status.replaceAll('_',' ')}${d.checked_at?' · checked '+time(d.checked_at):''}${d.invalid_rows?' · '+d.invalid_rows+' invalid rows excluded':''}${d.error?' · '+d.error:''}.`,d.status==='collected'?'small':'warning-note'));
    if(!r.reports.length&&r.scope.windows.length)nodes.push(el('p','No matching report was found in the available data. Reports may be delayed, incomplete or outside the loaded coverage; this is not evidence that no event occurred.'));
    for(const p of r.reports){const box=el('article',undefined,'river-impact'),magnitude=p.magnitude===null?'Magnitude not supplied':`${p.magnitude} ${p.unit}`;
      box.append(el('strong',`${p.kind[0].toUpperCase()+p.kind.slice(1)} report · ${time(p.observed_at)}`),el('p',`${p.location}, ${p.county}, ${p.state} · ${p.latitude}, ${p.longitude}`),el('p',magnitude));
      if(p.kind==='tornado')box.append(el('p',`Source rating field: ${p.reported_magnitude||'not supplied'}. A preliminary tornado report is not a confirmed track or final rating.`,'small'));
      const details=el('details');details.append(el('summary','Report comments and matching alert windows'),el('p',p.comments||'No comments supplied.'));for(const link of p.links)details.append(el('p',`${link.event} · ${link.coverage} · ${time(link.start)}–${time(link.end)} · message ${link.message_id.slice(0,12)}`,'small'));box.append(details,el('p','Source edition checked '+time(p.source_checked_at)+'. Report occurrence and collection time are different.','small'));
      const source=el('a','NOAA source report day ↗');source.href=p.source_url.replace('_rpts.csv','_rpts.html');source.target='_blank';source.rel='noopener';box.append(source);nodes.push(box);
    }
    nodes.push(el('p',r.interpretation,'small'));get('event-reports-results').replaceChildren(...nodes);get('event-reports-export').disabled=false;
  }
  async function run(){if(!story)return;const token=++generation;report=null;get('event-reports-export').disabled=true;get('event-reports-results').replaceChildren();get('event-reports-run').disabled=true;get('event-reports-status').textContent=asof?'Reading report editions collected by this cutoff…':'Collecting the relevant NOAA report days and official boundaries…';
    try{const params=new URLSearchParams({id:story.id});if(asof)params.set('at',asof);else params.set('alertAt',story.as_of);const response=await fetcher('/api/event-reports?'+params,{signal:AbortSignal.timeout(60000)}),data=await response.json();if(token!==generation)return;if(!response.ok)throw Error(data.error||'Report lookup failed');report=data;render();}
    catch(error){if(token===generation)get('event-reports-status').textContent='Reported outcomes unavailable: '+error.message;}
    finally{if(token===generation)get('event-reports-run').disabled=false;}
  }
  get('event-reports-run').onclick=run;get('event-reports-export').onclick=()=>{if(!report)return;const url=window.URL.createObjectURL(new Blob([JSON.stringify(report,null,2)],{type:'application/json'})),a=el('a');a.href=url;a.download='ventusiq-event-reports-'+story.id.slice(0,12)+'.json';a.click();window.setTimeout(()=>window.URL.revokeObjectURL(url),1000);};
  window.WeatherEventReports={updateStory};const current=window.WeatherEvents?.context?.();updateStory(current?.story||null,current?.asof||null);return {updateStory,run};
}
if(typeof window!=='undefined'){const start=()=>mountEventReports({document,window});if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();}
