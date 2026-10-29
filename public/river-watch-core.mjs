import {gaugeId} from './rivers-core.mjs';
import {sampleSeries,thresholds,datum,compareRiverForecasts} from './river-changes-core.mjs';
export const RIVER_WATCH_METHOD='2026-10-28.1';
const HOUR=3600000,instant=v=>typeof v==='string'&&/(Z|[+-]\d\d:\d\d)$/.test(v)?Date.parse(v):NaN;
export function riverWatchSetting(value){
  if(!value||typeof value!=='object'||Array.isArray(value)||!['action','minor','moderate','major'].includes(value.category))throw Error('Invalid river watch settings');
  return {gauge:gaugeId(value.gauge),category:value.category};
}
export function riverWatchOptions(product,now=Date.now()){
  const m=product?.metadata,checked=instant(product?.checked_at),f=sampleSeries(product?.series?.forecast);
  if(!m||!Number.isFinite(m.latitude)||!Number.isFinite(m.longitude)||Math.abs(m.latitude)>90||Math.abs(m.longitude)>180||product.stale||product.error||!Number.isFinite(checked)||checked>now+60000||now-checked>1350000)return [];
  return thresholds(product,f.kind).map(t=>({...t,unit:f.unit,kind:f.kind}));
}
function compact(product){
  if(!product)return null;const m=product.metadata;
  return {revision:product.revision||null,checked_at:product.checked_at,metadata:{lid:m.lid,name:m.name,latitude:m.latitude,longitude:m.longitude,datums:m.datums,flood:{stageUnits:m.flood?.stageUnits,flowUnits:m.flood?.flowUnits,categories:m.flood?.categories},status:{forecast:m.status?.forecast}},series:{forecast:product.series.forecast}};
}
const brief=s=>{const {comparison_product,...rest}=s;return rest;};
export function evaluateRiverWatch({setting,product,previous=null,now=Date.now()}){
  const selected=riverWatchSetting(setting),m=product?.metadata,f=sampleSeries(product?.series?.forecast),obs=sampleSeries(product?.series?.observed);
  const threshold=riverWatchOptions(product,now).find(t=>t.name===selected.category),fresh=!!threshold&&m?.lid===selected.gauge;
  const reference=fresh?JSON.stringify({gauge:m.lid,lat:m.latitude,lon:m.longitude,kind:f.kind,unit:f.unit,datum:f.kind==='stage'?datum(product):null,value:Math.round(threshold.value*1e6)/1e6}):null;
  const priorReference=previous?.reference||previous?.last_reference||null,referenceChanged=!!reference&&!!priorReference&&reference!==priorReference,comparable=!referenceChanged;
  const priorProduct=comparable?previous?.comparison_product:null,issue=instant(f.issued_at),priorIssue=instant(priorProduct?.series?.forecast?.issuedTime);
  const usable=fresh&&!f.duplicate&&!f.invalidTime&&f.points.length<=512&&Number.isFinite(issue)&&issue<=now+60000&&now-issue<=24*HOUR&&(!Number.isFinite(priorIssue)||issue>=priorIssue)&&m.status?.forecast?.floodCategory!=='fcst_not_current';
  const end=now+72*HOUR,within=f.points.filter(p=>instant(p.at)>=now&&instant(p.at)<=end),hit=usable?within.find(p=>p.value!==null&&p.value>=threshold.value):null;
  // Sampled coverage must bracket both window ends and contain no invalid or >12h gaps.
  const left=f.points.findLastIndex(p=>instant(p.at)<=now),right=f.points.findIndex(p=>instant(p.at)>=end),span=left>=0&&right>=left?f.points.slice(left,right+1):[];
  const complete=usable&&span.length>1&&span.every((p,i)=>p.value!==null&&(!i||instant(p.at)-instant(span[i-1].at)<=12*HOUR));
  const state=usable&&(hit||complete)?!!hit:null,hitIndex=hit?f.points.indexOf(hit):-1,before=hitIndex>0?f.points[hitIndex-1]:null;
  let reason=null;
  if(!fresh)reason='Gauge collection or compatible official threshold is unavailable or delayed.';
  else if(f.duplicate||f.invalidTime)reason='Duplicate or ambiguous forecast timestamps prevent evaluation.';
  else if(f.points.length>512)reason='Forecast exceeds the 512-sample evaluation limit.';
  else if(!usable)reason=Number.isFinite(priorIssue)&&issue<priorIssue?'Forecast issue precedes the last usable collected issue.':'Forecast issue is missing, delayed or marked not current.';
  else if(!complete)reason=hit?'A supplied forecast sample reaches the level, but full-window coverage is incomplete.':right<0?'Forecast ends before the full 72-hour window is covered.':left<0?'Forecast samples do not bracket the start of the 72-hour window.':'Missing values or gaps over 12 hours prevent a complete-window result.';
  const after=before?.value!==null&&before?.value<threshold?.value&&instant(before.at)>=now&&instant(hit?.at)-instant(before.at)<=12*HOUR?before.at:null;
  const latest=obs.points.filter(p=>instant(p.at)<=now+60000).at(-1),priorObservation=comparable?instant(previous?.observed?.last_observed_at):NaN,observationKnown=fresh&&!obs.duplicate&&!obs.invalidTime&&obs.kind===f.kind&&obs.unit===f.unit&&latest?.value!==null&&Number.isFinite(instant(latest?.at))&&now-instant(latest.at)<=6*HOUR&&(!Number.isFinite(priorObservation)||instant(latest.at)>=priorObservation);
  const observed=observationKnown?latest.value>=threshold.value:null;
  const snapshot={method_version:RIVER_WATCH_METHOD,gauge:selected.gauge,category:selected.category,name:m?.name||previous?.name||selected.gauge,unit:threshold?.unit||f.unit||null,threshold:threshold?.value??null,reference,last_reference:reference||priorReference,
    forecast:{state,complete_window:!!complete,reason,sample_count:within.length,available_from:within[0]?.at||null,available_until:within.at(-1)?.at||null,first_at:hit?.at||null,after,window_start:new Date(now).toISOString(),window_end:new Date(end).toISOString(),last_known:state??(comparable?previous?.forecast?.last_known:null)??null},
    observed:{state:observed,value:observationKnown?latest.value:null,at:latest?.at||null,last_observed_at:observationKnown?latest.at:(comparable?previous?.observed?.last_observed_at:null)??null,last_known:observed??(comparable?previous?.observed?.last_known:null)??null},
    source:{provider:'NOAA / NWPS',revision:product?.revision||null,checked_at:product?.checked_at||null,issued_at:f.issued_at,source_url:'https://api.water.noaa.gov/nwps/v1/gauges/'+selected.gauge,official_url:'https://water.noaa.gov/gauges/'+selected.gauge.toLowerCase()},
    comparison_product:usable?compact(product):priorProduct||null};
  const changes=[],prefix=selected.gauge+' '+selected.category+' threshold';
  if(previous){
    if(referenceChanged)changes.push({kind:'river_reference',title:prefix+': official threshold or gauge reference changed; new baseline',before:brief(previous),after:brief(snapshot)});
    for(const lane of ['forecast','observed']){
      const current=snapshot[lane].state,prior=comparable?previous[lane]?.last_known:null;
      if(current!==null&&prior!==undefined&&prior!==null&&current!==prior)changes.push({kind:'river_'+lane,title:prefix+': '+(lane==='observed'?(current?'latest observation is at or above':'latest observation is below'):(current?'a forecast sample now reaches the level within 72 hours':'no forecast sample reaches the level in the covered 72-hour window')),before:brief(previous),after:brief(snapshot)});
      else if(current!==null&&(prior===null||prior===undefined)&&!referenceChanged)changes.push({kind:'river_baseline',title:prefix+': first usable '+lane+' check recorded',after:brief(snapshot)});
      if((previous[lane]?.state!==null)!==(current!==null))changes.push({kind:'river_coverage',title:selected.gauge+' '+lane+' coverage '+(current===null?'unknown or delayed':'available again'),before:previous[lane]?.state!==null,after:current!==null});
    }
    if(usable&&priorProduct&&state===true&&previous.forecast?.last_known===true){
      const limited=p=>({...p,series:{forecast:{...p.series.forecast,data:p.series.forecast.data.filter(v=>instant(v.validTime)<=end)}}});
      const comparison=compareRiverForecasts(limited(product),limited(priorProduct),now),t=comparison.thresholds.find(t=>t.name===selected.category);
      if(comparison.status==='compared'&&t?.change==='still_reaches'&&t.before.after&&t.after.after&&(t.before.at!==t.after.at||t.before.after!==t.after.after))changes.push({kind:'river_timing',title:prefix+': forecast crossing window changed',before:t.before,after:t.after,timing:t.timing,horizon:comparison.horizon,unit:comparison.unit,previous_revision:comparison.previous_revision,current_revision:comparison.current_revision,comparison_method_version:comparison.method_version});
    }
  }
  return {snapshot,changes,covered:state!==null&&observed!==null};
}
