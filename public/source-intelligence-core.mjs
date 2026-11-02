/* Local, descriptive evidence. Apache-2.0. No fitted weights or probabilities. */
import {HOUR,quantity} from './observations-core.mjs';
import {verificationObservations} from './verification-leads.mjs';
const finite=Number.isFinite;
const explicit=t=>typeof t==='string'&&/(Z|[+-]\d{2}:\d{2})$/.test(t)?Date.parse(t):NaN;
export const SOURCE_METHOD='local-temperature-evidence-v1';
export const SOURCES=[
  {id:'nws',label:'NWS hourly',lineage:'Official point guidance. May incorporate numerical models; not an independent vote alongside every model.'},
  {id:'hrrr',label:'HRRR',lineage:'NOAA regional model, nearest native cell. Temperature and smoke from the same model are different variables, not independent forecasts of temperature.'},
  {id:'gefs',label:'GEFS median',lineage:'NOAA global ensemble. Members share a model system; its member range is not a calibrated probability interval.'}
];
const dateKey=(at,zone)=>new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit'}).format(at);
export function localDay(now,zone){
  // Find actual local midnight boundaries, including 23/25-hour DST days.
  const key=dateKey(now,zone),boundary=(lo,hi,after)=>{while(hi-lo>1){const mid=Math.floor((lo+hi)/2);if((dateKey(mid,zone)===key)===after)hi=mid;else lo=mid;}return hi;};
  return {key,zone,start:boundary(now-36*HOUR,now,true),end:boundary(now,now+36*HOUR,false)};
}
function editionPeriods(edition,cutoff){
  const checked=explicit(edition?.checked_at),issued=explicit(edition?.forecast?.properties?.updateTime);
  if(!finite(checked)||!finite(issued)||issued>checked||checked>cutoff)return [];
  const rows=new Map();
  for(const p of edition.forecast.properties.periods||[]){const at=explicit(p.startTime),end=explicit(p.endTime),temperature=typeof p.temperature==='object'?quantity(p.temperature,'temperature'):quantity({value:p.temperature,unitCode:'wmoUnit:deg'+p.temperatureUnit},'temperature');
    if(!finite(at)||end-at!==HOUR||at<issued)continue;
    rows.set(at,rows.has(at)?null:{at,temperature});
  }return [...rows.values()].filter(Boolean).sort((a,b)=>a.at-b.at);
}
export function dayComparison({now,zone,earlier,current,observed}){
  const day=localDay(now,zone),inDay=r=>r.at>=day.start&&r.at<day.end;
  const audit=verificationObservations(observed||{features:[]},now),readings=audit.rows.filter(inDay).filter(r=>finite(r.temperature)&&['V','G'].includes(r.temperature_qc));
  const early=editionPeriods(earlier,day.start-1).filter(inDay),future=editionPeriods(current,now).filter(inDay).filter(r=>r.at>=now);
  const values=readings.map(r=>r.temperature),latest=readings.at(-1);
  return {method:SOURCE_METHOD,day,as_of:new Date(now).toISOString(),earlier:early,remaining:future,readings,observation_series:audit.rows.filter(inDay).map(r=>({...r,temperature:['V','G'].includes(r.temperature_qc)?r.temperature:null})),
    observed_min_f:values.length?Math.min(...values):null,observed_max_f:values.length?Math.max(...values):null,
    observed_delayed:!!observed?.stale||!latest||now-latest.at>2*HOUR,observations_partial:!!observed?.truncated,
    outlook_delayed:!!current?.stale||!!current?.error||!finite(explicit(current?.checked_at))||now-explicit(current?.checked_at)>900000||!finite(explicit(current?.forecast?.properties?.updateTime))||now-explicit(current?.forecast?.properties?.updateTime)>24*HOUR,
    earlier_revision:earlier?.revision||null,earlier_checked_at:earlier?.checked_at||null,earlier_issued_at:earlier?.forecast?.properties?.updateTime||null,
    current_revision:current?.revision||null,current_checked_at:current?.checked_at||null,current_issued_at:current?.forecast?.properties?.updateTime||null,
    observation_revision:observed?.revision||null,observation_checked_at:observed?.checked_at||null,
    observation_audit:{time_excluded:audit.time_excluded,conflicting_timestamps:audit.conflicting_timestamps}};
}
const band=p=>p.lead_hours>=6&&p.lead_hours<12?'6–12 h':p.lead_hours>=12&&p.lead_hours<24?'12–24 h':null;
const identity=p=>JSON.stringify([p.valid_at,p.observation_id,p.observation_at,p.observed_f,band(p)]);
export function eligiblePairs(report,id){
  const input=id==='nws'&&report?.lead_analysis?.groups?report.lead_analysis.groups.filter(g=>['6-12','12-24'].includes(g.id)).flatMap(g=>g.pairs||[]):report?.pairs||[];
  const rows=new Map();
  for(const p of input){const forecast=id==='gefs'?p.median_f:p.forecast_f,at=explicit(p.valid_at),checked=explicit(p.forecast_checked_at),issued=explicit(p.forecast_issued_at||p.initialization_at),obs=explicit(p.observation_at);
    if(!finite(forecast)||!finite(p.observed_f)||!band(p)||!finite(at)||!finite(checked)||!finite(issued)||issued>checked||checked>=at||!finite(obs)||Math.abs(obs-at)>HOUR/2||!p.observation_id||!['V','G'].includes(p.quality))continue;
    // Existing source-specific collection rules remain intact. Also audit reported lead.
    if(Math.abs((at-issued)/HOUR-p.lead_hours)>0.001)continue;
    const value={...p,forecast_f:forecast,error_f:forecast-p.observed_f},key=JSON.stringify([p.valid_at,band(p)]);
    rows.set(key,rows.has(key)?null:value);
  }return [...rows.values()].filter(Boolean).sort((a,b)=>Date.parse(a.valid_at)-Date.parse(b.valid_at));
}
export function errorStats(pairs){const n=pairs.length;return {sample_count:n,days:new Set(pairs.map(p=>p.valid_at.slice(0,10))).size,mae_f:n?pairs.reduce((s,p)=>s+Math.abs(p.error_f),0)/n:null,bias_f:n?pairs.reduce((s,p)=>s+p.error_f,0)/n:null};}
export function sourceScorecard(reports){
  const sources=SOURCES.map(source=>{const r=reports[source.id],pairs=eligiblePairs(r,source.id);return {...source,pairs,...errorStats(pairs),generated_at:r?.generated_at||null,observation_checked_at:r?.observation_checked_at||r?.observation_evidence?.checked_at||null,delayed:!!r?.stale||!!r?.observations_truncated,error:r?.error||null,groups:['6–12 h','12–24 h'].map(label=>({label,...errorStats(pairs.filter(p=>band(p)===label))}))};});
  const shared=[];
  for(let i=0;i<sources.length;i++)for(let j=i+1;j<sources.length;j++){
    const left=sources[i],right=sources[j],lookup=new Map(right.pairs.map(p=>[identity(p),p])),pairs=left.pairs.filter(p=>lookup.has(identity(p))),other=pairs.map(p=>lookup.get(identity(p)));
    shared.push({left:left.id,right:right.id,left_stats:errorStats(pairs),right_stats:errorStats(other),pairs:pairs.map((p,k)=>({left:p,right:other[k]}))});
  }
  return {method:SOURCE_METHOD,sources,shared};
}
export function thresholdStats(pairs,min,max){
  if(!finite(min)||!finite(max)||min>max)throw Error('Enter a minimum no higher than the maximum.');
  const c={within_both:0,missed_exceedance:0,false_exceedance:0,outside_both:0},within=v=>v>=min&&v<=max;
  for(const p of pairs){const f=within(p.forecast_f),o=within(p.observed_f);c[f?(o?'within_both':'missed_exceedance'):(o?'false_exceedance':'outside_both')]++;}
  const predictedWithin=c.within_both+c.missed_exceedance,observedOutside=c.missed_exceedance+c.outside_both,predictedOutside=c.false_exceedance+c.outside_both;
  return {...errorStats(pairs),min_f:min,max_f:max,counts:c,predicted_within:predictedWithin,observed_outside:observedOutside,predicted_outside:predictedOutside,
    within_hit_fraction:predictedWithin?c.within_both/predictedWithin:null,miss_fraction:observedOutside?c.missed_exceedance/observedOutside:null,false_alarm_fraction:predictedOutside?c.false_exceedance/predictedOutside:null};
}
