import {smokeValue} from './journey-smoke.mjs';
import {journeySampleLabel} from './journey-stops.mjs';
import {SMOKE_SOURCE} from './smoke-core.mjs';
export function smokeJourneySummary(journey){
  if(!journey.smoke_requested)return 'Smoke comparison not requested.';
  let text=`Smoke: ${journey.complete_smoke_samples}/${journey.total_samples} complete time brackets · highest available bracketing value ${smokeValue(journey.max_bracketing_smoke)}.`;
  if(journey.smoke_limit_ug_m3!==null)text+=` ${journey.smoke_exceedance_samples} brackets contain a sample above ${smokeValue(journey.smoke_limit_ug_m3)}; ${journey.smoke_unknown_limit_samples} unknown limit results.`;
  return text;
}
export function renderJourneySmoke(document,journey,format){
  const get=id=>document.getElementById(id),el=(tag,text)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;return n;};
  get('journey-smoke-results').hidden=!journey.smoke_requested;if(!journey.smoke_requested)return;
  get('journey-smoke-summary').textContent=smokeJourneySummary(journey)+(journey.smoke_runs.length>1?' Samples come from different model issue times; inspect each row.':'');
  get('journey-smoke-body').replaceChildren(...journey.rows.map((row,i)=>{
    const r=row.smoke,tr=el('tr'),samples=r.samples.map(s=>`${format(s.at)}: ${smokeValue(r.fresh?s.smoke_ug_m3:null)}${s.reason?' ('+s.reason+')':''}`).join(' / ');
    const status=r.reason||'Complete bracketing samples',limit=r.limit_ug_m3===null?'No limit selected':r.exceeds===null?'Limit result unknown':r.exceeds?'A bracket sample exceeds your limit':'Available bracket samples are at or below your limit';
    for(const value of [journeySampleLabel(row,i,journey.rows.length),format(row.at),samples||'Unavailable',smokeValue(r.maximum_ug_m3),status+' · '+limit])tr.append(el('td',value));
    const source=el('td');source.append(el('p','Run '+(r.issued_at?format(r.issued_at):'unavailable')),el('p','Checked '+(r.checked_at?format(r.checked_at):'unavailable')));
    if(r.point)source.append(el('p',`Requested smoke point ${r.point.lat}, ${r.point.lon}`));const link=el('a','NOAA RAP smoke source ↗');link.href=SMOKE_SOURCE;link.target='_blank';link.rel='noopener';source.append(link);tr.append(source);return tr;
  }));
  const stops=get('journey-stop-smoke');stops.replaceChildren();
  if(journey.smoke_stops?.length){
    stops.append(el('h3','Estimated smoke during planned stops'),el('p','These estimates assume a straight-line change between adjacent hourly RAP values at the stop. They are separate from the sample-limit checks above. Missing intervals withhold the whole-stop mean and duration estimate. This method has not been validated against measured personal exposure.'));
    const minutes=n=>n===null?'Unknown':n>0&&n<0.1?'<0.1 min':n.toLocaleString(undefined,{maximumFractionDigits:1})+' min';
    for(const stop of journey.smoke_stops){
      const details=el('details'),summary=el('summary',`Via ${stop.stop_index} · ${minutes(stop.duration_minutes)} stop · ${stop.complete?'estimated mean '+smokeValue(stop.mean_ug_m3):'incomplete smoke coverage'}`);
      details.append(summary,el('p',`${format(stop.start)} – ${format(stop.end)} · ${minutes(stop.covered_minutes)} with adjacent hourly values; ${minutes(stop.unknown_minutes)} unknown.`));
      if(stop.limit_ug_m3!==null)details.append(el('p',`Estimated time above your ${smokeValue(stop.limit_ug_m3)} limit: ${minutes(stop.minutes_above_limit)}. This is an interpolation estimate, not observed time above the limit.`));
      if(stop.reason)details.append(el('p',stop.reason));
      details.append(el('p',`RAP run: ${stop.source?.issued_at?format(stop.source.issued_at):'Unknown'} · checked: ${stop.source?.checked_at?format(stop.source.checked_at):'Unknown'}. Exact interval endpoints and source samples are included in the journey export.`));
      stops.append(details);
    }
  }
}
