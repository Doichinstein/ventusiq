#!/usr/bin/env node
// Offline reproduction of retained station experiments. No source requests or writes.
import {readFile,stat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {gunzipSync} from 'node:zlib';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {stationTemperatures,stationTemperatureEvaluation,STATION_ANALOG_METHOD} from '../public/station-analogs-core.mjs';

const sha=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const equal=(a,b,label)=>{if(JSON.stringify(a)!==JSON.stringify(b))throw Error(label+' does not reproduce');};
const time=value=>typeof value==='string'?Date.parse(value):NaN;
export function verifyStationCohort(bundle){
  if(bundle?.schema!=='ventusiq-station-regional-evaluation/1'||bundle.plan?.schema!=='ventusiq-station-regional-plan/1'||bundle.plan.method!==STATION_ANALOG_METHOD)throw Error('Unsupported station cohort or method');
  const {plan,selections,results}=bundle;
  if(!Array.isArray(plan.targets)||!plan.targets.length||plan.targets.length>32||!Array.isArray(selections)||!Array.isArray(results)||selections.length!==plan.targets.length||results.length!==plan.targets.length)throw Error('Missing or oversized cohort membership');
  if(!Number.isFinite(time(plan.registered_at))||!Number.isFinite(time(bundle.completed_at))||time(bundle.completed_at)<time(plan.registered_at))throw Error('Invalid cohort timestamps');
  const start=Number(plan.history_window?.start?.slice(0,4));
  if(!Number.isInteger(start)||start<1900||start>2100)throw Error('Invalid fixed history window');
  equal(plan.history_window,{start:start+'-01-01',end:(start+9)+'-12-31',holdout_start:(start+8)+'-01-01'},'Fixed history window');
  const ids=new Set(),cities=new Set(),stations=[];
  for(let i=0;i<plan.targets.length;i++){
    const target=plan.targets[i],selected=selections[i],result=results[i];
    if(!target||typeof target.city!=='string'||!target.city||cities.has(target.city)||!Number.isFinite(target.lat)||Math.abs(target.lat)>90||!Number.isFinite(target.lon)||Math.abs(target.lon)>180)throw Error('Invalid or duplicate target');
    cities.add(target.city);equal(selected.target,target,'Target selection');
    const id=selected.station?.id;
    if(!/^\d{11}$/.test(id||'')||ids.has(id)||result.id!==id||result.city!==target.city)throw Error('Invalid or duplicate station membership');
    ids.add(id);
    if(!Number.isFinite(time(selected.captured_at))||time(selected.captured_at)<time(plan.registered_at)||!Number.isFinite(time(result.retrieved_at))||time(result.retrieved_at)<time(selected.captured_at)||time(result.retrieved_at)>time(bundle.completed_at))throw Error('Invalid station capture order');
    if(typeof result.error==='string'&&!result.history){stations.push({city:target.city,id,error:result.error,attempted:48,evaluated:0});continue;}
    const h=result.history;
    if(!h||h.method!==plan.method||sha(h.raw)!==result.raw_sha256)throw Error('Station source hash or method mismatch');
    for(const key of ['id','lat','lon'])equal(h.station?.[key],selected.station[key],'Station '+key);
    for(const [key,value] of Object.entries(plan.history_window))equal(h.window?.[key],value,'History '+key);
    equal(h.window.training_end,(start+7)+'-12-31','Training boundary');
    const normalized=stationTemperatures(h.raw,h.station,h.window);
    for(const key of ['rows','audit','years','expected_days','usable_days'])equal(h[key],normalized[key],'Normalized '+key);
    const validation=stationTemperatureEvaluation({...h,...normalized});
    equal(result.validation,validation,'Held-out results');
    const metrics=validation.diagnostics.cohorts[0].metrics.mean_c;
    const {pairs,...compact}=metrics;
    stations.push({city:target.city,id,name:h.station.name,usable_days:normalized.usable_days,expected_days:normalized.expected_days,
      attempted:validation.attempted,evaluated:validation.evaluated,missing:validation.missing,insufficient:validation.insufficient,
      last_raw_date:h.raw.map(r=>r.DATE).filter(d=>/^\d{4}-\d{2}-\d{2}$/.test(d)).sort().at(-1)||null,
      checked_at:h.checked_at,stale:!!h.stale,source_error:h.error||null,metrics:compact,
      groups:validation.diagnostics.cohorts.slice(1).map(c=>({id:c.id,kind:c.kind,attempted:c.attempted,evaluated:c.evaluated,missing:c.missing,insufficient:c.insufficient,n:c.metrics.mean_c.n,analog_mae:c.metrics.mean_c.analog_mae,seasonal_mae:c.metrics.mean_c.seasonal_mae,persistence_mae:c.metrics.mean_c.persistence_mae}))});
  }
  const eligible=stations.filter(s=>s.metrics?.n>0),mean=key=>eligible.length?eligible.reduce((sum,s)=>sum+s.metrics[key],0)/eligible.length:null;
  return {schema:'ventusiq-station-regional-summary/1',method:plan.method,window:plan.history_window,stations,
    aggregate:{scheduled_stations:stations.length,paired_stations:eligible.length,scheduled_cases:stations.length*48,paired_cases:eligible.reduce((n,s)=>n+s.evaluated,0),
      weighting:'Equal station weight after computing each station MAE on identical cases for all methods.',
      analog_mae:mean('analog_mae'),seasonal_mae:mean('seasonal_mae'),persistence_mae:mean('persistence_mae'),
      analog_lower_than_seasonal:eligible.filter(s=>s.metrics.analog_mae<s.metrics.seasonal_mae).length,
      analog_lower_than_persistence:eligible.filter(s=>s.metrics.analog_mae<s.metrics.persistence_mae).length},
    units:'degrees Celsius',scope:'Descriptive retrospective daily-mean station temperature experiment. Station/day results are correlated. This does not establish regional skill, current forecast transfer, calibrated probabilities or homogeneous climate records. Checksums and local timestamps are not signatures or independent registration evidence.'};
}
export async function readStationCohort(path){
  const info=await stat(path);if(!info.isFile()||info.size>32*1024*1024)throw Error('Cohort must be a file of at most 32 MiB');
  const bytes=await readFile(path),text=path.endsWith('.gz')?gunzipSync(bytes,{maxOutputLength:32*1024*1024}):bytes;
  return JSON.parse(text.toString('utf8'));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  try{
    if(process.argv.length!==3)throw Error('Usage: node scripts/verify-station-cohort.mjs COHORT.json[.gz]');
    console.log(JSON.stringify(verifyStationCohort(await readStationCohort(process.argv[2])),null,2));
  }catch(error){console.error(error.message);process.exitCode=1;}
}
