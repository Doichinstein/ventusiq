import {createHash} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {ANALOG_METHOD,DAY,RULES,VARIABLES,dayTime,gridPoint,forecastDays,normalizeHistory,selectAnalogs} from '../public/analogs-core.mjs';

export const FORWARD_METHOD='2026-10-29.1';
export const POWER_OUTCOMES='https://power.larc.nasa.gov/api/temporal/daily/point';
export const AGGREGATION='Report all point predictions, plus an equal-weight mean over grid/outcome-day groups: first average paired absolute errors across eligible points within each group, then average groups. Compare analog and seasonal predictions on the identical point/variable subset. Report group and point counts separately, including missing outcomes and insufficient predictions. Shared outcomes are not independent replications; adjacent outcome days may also be correlated. No accuracy conclusion before outcomes arrive.';
export const sha=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const finite=v=>typeof v==='number'&&Number.isFinite(v);
const date=at=>new Date(at).toISOString().slice(0,10);
const requireThat=(condition,message)=>{if(!condition)throw Error(message);};
const groupKey=c=>`${c.grid.key}/${c.outcome_date}`;
const VERIFIED=Symbol('verified forward cohort');

export function verifyForwardCohort(bundle,plan){
  const d=bundle?.document,hash=sha(d);
  requireThat(d?.schema==='ventusiq-analog-forward-cohort/1'&&hash===bundle?.integrity?.sha256&&hash===plan?.cohort_sha256,'Cohort hash or schema mismatch');
  requireThat(d.analog_method===ANALOG_METHOD&&isDeepStrictEqual(d.rules,RULES),'Unsupported frozen analog method');
  requireThat(plan.aggregation===AGGREGATION,'Unsupported scoring plan');
  requireThat(Array.isArray(d.cases)&&d.cases.length>0&&d.cases.length<=1000,'Invalid cohort size');
  const registered=Date.parse(d.registered_at),recorded=Date.parse(plan.recorded_at);
  requireThat(Number.isFinite(registered)&&Number.isFinite(recorded)&&recorded>=registered,'Invalid registration times');
  requireThat(d.sources&&Object.keys(d.sources).length<=200,'Invalid source edition count');
  for(const [key,s] of Object.entries(d.sources)){
    requireThat(key===s.dataset+':'+s.revision&&sha(s.raw)===s.revision&&d.source_hashes?.[key]===s.revision,'Source revision mismatch');
  }
  const groups={},ids=new Set(),normalized=new Map();
  for(const c of d.cases){
    const decision=Date.parse(c.decision_time),fcheck=Date.parse(c.forecast_check),hcheck=Date.parse(c.history_check);
    const start=dayTime(c.outcome_date),targetAt=dayTime(c.target_date),end=Date.parse(c.outcome_ends_at);
    requireThat([decision,fcheck,hcheck,start,targetAt,end].every(Number.isFinite)&&end===start+DAY&&start===targetAt+DAY,'Invalid case calendar');
    requireThat(decision<=registered&&registered<start&&recorded<start&&targetAt>=decision&&fcheck<=decision&&hcheck<=decision&&decision-hcheck<=14*DAY,'Inputs or registration cross the outcome boundary');
    const f=d.sources[c.forecast_source],h=d.sources[c.history_source],grid=gridPoint(c.point?.lat,c.point?.lon);
    requireThat(f&&h&&grid.key===c.grid?.key&&grid.key===h.raw.grid?.key&&c.grid.lat===grid.lat&&c.grid.lon===grid.lon,'Case source/grid mismatch');
    const point=f.dataset.startsWith('forecast/')?f.dataset.slice(9).split(',').map(Number):[];
    requireThat(point.length===2&&point[0]===c.point.lat&&point[1]===c.point.lon,'Forecast point mismatch');
    requireThat(Date.parse(f.first_collected_at)<=fcheck&&Date.parse(h.first_collected_at)<=hcheck,'Case uses an unavailable source edition');
    requireThat(c.id===sha({dataset:f.dataset,date:c.target_date})&&!ids.has(c.id),'Duplicate or inconsistent case identifier');ids.add(c.id);
    const target=forecastDays({...f.raw,revision:f.revision,checked_at:c.forecast_check,issued_at:f.raw.forecast?.properties?.updateTime},decision).find(t=>t.date===c.target_date);
    requireThat(target&&isDeepStrictEqual(target,c.target),'Frozen forecast target cannot be reproduced');
    if(!normalized.has(c.history_source))normalized.set(c.history_source,normalizeHistory(h.raw.raw,h.raw.window,h.raw.grid));
    const cutoff=date(dayTime(h.raw.window.end)+DAY);
    requireThat(dayTime(cutoff)<=decision,'Historical retrieval includes unavailable outcome days');
    const prediction=selectAnalogs(normalized.get(c.history_source).rows,target,cutoff);
    requireThat(isDeepStrictEqual(prediction,c.prediction)&&c.status===(prediction.sufficient?'sufficient_matches':'insufficient_matches'),'Frozen prediction cannot be reproduced');
    (groups[groupKey(c)]??=[]).push(c.id);
  }
  const sorted=o=>Object.fromEntries(Object.entries(o).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>[k,[...v].sort()]));
  requireThat(plan.cases_verified===d.cases.length&&plan.unique_grid_outcome_days===Object.keys(groups).length&&isDeepStrictEqual(sorted(groups),sorted(plan.groups||{})),'Scoring groups do not match every frozen case');
  return {[VERIFIED]:true,document:d,plan,cohort_sha256:hash,plan_sha256:sha(plan),groups};
}

const PARAMETERS={high_c:['T2M_MAX','C',-100,80],low_c:['T2M_MIN','C',-100,80],wind_ms:['WS10M','m/s',0,150],rain_mm:['PRECTOTCORR','mm/day',0,3000]};
export function outcomeRows(raw,grid,window){
  requireThat(raw?.type==='Feature'&&raw.header?.time_standard==='UTC'&&raw.header?.sources?.includes('MERRA2'),'Invalid outcome provider or time standard');
  const xy=raw.geometry?.coordinates;
  requireThat(Array.isArray(xy)&&finite(xy[0])&&finite(xy[1])&&Math.abs(xy[0]-grid.lon)<=.001&&Math.abs(xy[1]-grid.lat)<=.001,'Outcome coordinates mismatch');
  const start=dayTime(window.start),end=dayTime(window.end);
  requireThat(Number.isFinite(start)&&Number.isFinite(end)&&end>=start&&end-start<=31*DAY,'Invalid outcome range');
  for(const [key,unit] of Object.values(PARAMETERS))requireThat(raw.parameters?.[key]?.units===unit&&raw.properties?.parameter?.[key]&&typeof raw.properties.parameter[key]==='object','Invalid outcome units or parameters');
  const rows=[];
  for(let at=start;at<=end;at+=DAY){
    const day=date(at),key=day.replaceAll('-',''),row={date:day};
    for(const [name,[parameter,,min,max]] of Object.entries(PARAMETERS)){
      const value=raw.properties.parameter[parameter][key];row[name]=finite(value)&&value!==raw.header.fill_value&&value>=min&&value<=max?value:null;
    }
    if(row.high_c!==null&&row.low_c!==null&&row.high_c<row.low_c)row.high_c=row.low_c=null;
    rows.push(row);
  }
  return rows;
}
function verified(value){
  requireThat(value?.[VERIFIED],'Verify the frozen cohort before scoring or collection');
  requireThat(sha(value.document)===value.cohort_sha256&&sha(value.plan)===value.plan_sha256,'Verified cohort or plan changed after verification');
}
export function outcomeRequests(cohort,now=Date.now()){
  verified(cohort);requireThat(finite(now)&&now>=Date.parse(cohort.plan.recorded_at),'Invalid evaluation time');const grids=new Map();
  for(const c of cohort.document.cases){if(Date.parse(c.outcome_ends_at)>now)continue;
    const g=grids.get(c.grid.key)||{grid:c.grid,days:new Set()};g.days.add(c.outcome_date);grids.set(c.grid.key,g);
  }
  requireThat(grids.size<=32,'Outcome grid request limit exceeded');
  return [...grids.values()].sort((a,b)=>a.grid.key.localeCompare(b.grid.key)).map(({grid,days})=>{
    const dates=[...days].sort(),window={start:dates[0],end:dates.at(-1)};
    requireThat(dayTime(window.end)-dayTime(window.start)<=31*DAY,'Outcome request range exceeds 32 days');
    const source_url=POWER_OUTCOMES+'?'+new URLSearchParams({parameters:'T2M_MAX,T2M_MIN,WS10M,PRECTOTCORR',community:'RE',latitude:String(grid.lat),longitude:String(grid.lon),start:window.start.replaceAll('-',''),end:window.end.replaceAll('-',''),'time-standard':'UTC',format:'JSON'});
    return {grid,window,source_url};
  });
}
export async function collectForwardOutcomes(cohort,{clock=Date.now,fetcher=fetch,pause=ms=>new Promise(resolve=>setTimeout(resolve,ms))}={}){
  const started=clock(),requested_at=new Date(started).toISOString(),requests=outcomeRequests(cohort,started),editions=[],errors=[];
  for(const [index,request] of requests.entries()){
    if(index)await pause(6000);
    try{
      const response=await fetcher(request.source_url,{redirect:'manual',signal:AbortSignal.timeout(25000),headers:{Accept:'application/json','User-Agent':'VentusIQ-OpenWeather (https://github.com/Doichinstein/ventusiq)'}});
      if(!response.ok)throw Error('NASA outcomes returned HTTP '+response.status);
      const text=await response.text();if(text.length>2000000)throw Error('Outcome response exceeds size limit');
      const raw=JSON.parse(text);outcomeRows(raw,request.grid,request.window);
      editions.push({...request,fetched_at:new Date(clock()).toISOString(),sha256:sha(raw),raw});
    }catch(error){errors.push({grid:request.grid.key,window:request.window,source_url:request.source_url,error:String(error.message).slice(0,300)});}
  }
  return {schema:'ventusiq-analog-outcomes/1',cohort_sha256:cohort.cohort_sha256,requested_at,editions,errors};
}

export function scoreForwardOutcomes(cohort,outcomes,now=Date.now()){
  verified(cohort);requireThat(finite(now),'Invalid evaluation time');
  requireThat(now>=Date.parse(cohort.plan.recorded_at),'Evaluation predates registration');
  requireThat(outcomes?.schema==='ventusiq-analog-outcomes/1'&&outcomes.cohort_sha256===cohort.cohort_sha256&&Array.isArray(outcomes.editions)&&outcomes.editions.length<=32,'Invalid outcome bundle');
  const requested=Date.parse(outcomes.requested_at);
  requireThat(Number.isFinite(requested)&&requested<=now&&requested>=Date.parse(cohort.plan.recorded_at),'Invalid collection planning time');
  const observations=new Map(),sources=[];
  for(const edition of outcomes.editions){
    const fetched=Date.parse(edition.fetched_at);
    requireThat(Number.isFinite(fetched)&&fetched>=requested&&fetched<=now&&sha(edition.raw)===edition.sha256,'Outcome edition time or hash mismatch');
    const grid=gridPoint(edition.grid?.lat,edition.grid?.lon);
    requireThat(grid.key===edition.grid.key&&Object.keys(cohort.groups).some(k=>k.startsWith(grid.key+'/')),'Unexpected outcome grid');
    // Freeze the requested date window at collection start, even across UTC midnight.
    const request=outcomeRequests(cohort,requested).find(r=>r.grid.key===grid.key);
    requireThat(request&&edition.source_url===request.source_url&&isDeepStrictEqual(edition.window,request.window),'Outcome request differs from the mature cohort window');
    for(const row of outcomeRows(edition.raw,grid,edition.window)){
      const key=grid.key+'/'+row.date;if(!cohort.groups[key])continue;
      requireThat(fetched>=dayTime(row.date)+DAY,'Outcome captured before its complete UTC day');
      requireThat(!observations.has(key),'Ambiguous repeated outcome edition; select one explicit capture');
      observations.set(key,{row,sha256:edition.sha256,fetched_at:edition.fetched_at,source_url:edition.source_url});
    }
    sources.push({grid:grid.key,window:edition.window,fetched_at:edition.fetched_at,sha256:edition.sha256,source_url:edition.source_url});
  }
  const cases=cohort.document.cases.map(c=>{
    const key=groupKey(c),due=Date.parse(c.outcome_ends_at)<=now,observation=observations.get(key);
    const variables=Object.fromEntries(VARIABLES.map(variable=>{
      const a=c.prediction.outcomes[variable],b=c.prediction.seasonal[variable],actual=due?observation?.row[variable]??null:null;
      const sufficient=c.prediction.sufficient&&a.n>=RULES.min_matches&&b.n>=RULES.min_matches&&finite(a.median)&&finite(b.median);
      const status=!due?'pending_day':!sufficient?'insufficient_prediction':!finite(actual)?'missing_outcome':'scored';
      return [variable,{status,actual,analog:a.median,seasonal:b.median,analog_n:a.n,seasonal_n:b.n,
        analog_absolute_error:status==='scored'?Math.abs(a.median-actual):null,seasonal_absolute_error:status==='scored'?Math.abs(b.median-actual):null}];
    }));
    return {id:c.id,point:c.point,grid:c.grid.key,target_date:c.target_date,outcome_date:c.outcome_date,group:key,decision_time:c.decision_time,forecast_source:c.forecast_source,history_source:c.history_source,outcome_sha256:observation?.sha256||null,variables};
  });
  const mean=values=>values.length?values.reduce((a,b)=>a+b,0)/values.length:null;
  const metrics=Object.fromEntries(VARIABLES.map(variable=>{
    const grouped=Object.keys(cohort.groups).sort().map(key=>{
      const all=cases.filter(c=>c.group===key),paired=all.filter(c=>c.variables[variable].status==='scored');
      return {group:key,scheduled_points:all.length,paired_points:paired.length,analog_mae:mean(paired.map(c=>c.variables[variable].analog_absolute_error)),seasonal_mae:mean(paired.map(c=>c.variables[variable].seasonal_absolute_error))};
    });
    const paired=cases.filter(c=>c.variables[variable].status==='scored'),eligible=grouped.filter(g=>g.paired_points>0);
    return [variable,{paired_points:paired.length,paired_groups:eligible.length,analog_mae:mean(eligible.map(g=>g.analog_mae)),seasonal_mae:mean(eligible.map(g=>g.seasonal_mae)),difference_seasonal:mean(eligible.map(g=>g.analog_mae-g.seasonal_mae)),
      pending_points:cases.filter(c=>c.variables[variable].status==='pending_day').length,missing_outcome_points:cases.filter(c=>c.variables[variable].status==='missing_outcome').length,insufficient_prediction_points:cases.filter(c=>c.variables[variable].status==='insufficient_prediction').length,groups:grouped}];
  }));
  return {schema:'ventusiq-analog-forward-score/1',method:FORWARD_METHOD,evaluated_at:new Date(now).toISOString(),cohort_sha256:cohort.cohort_sha256,plan_sha256:cohort.plan_sha256,scheduled_points:cases.length,scheduled_grid_days:Object.keys(cohort.groups).length,unique_grids:new Set(cases.map(c=>c.grid)).size,aggregation:AGGREGATION,metrics,cases,outcome_sources:sources,collection_errors:outcomes.errors||[],
    scope:'Frozen forecast-input analogs evaluated against later NASA POWER/MERRA-2 regional reanalysis, not station measurements or address-level impacts. Equal weighting of grid/outcome-day groups avoids counting a shared outcome as independent repetitions. Adjacent days remain correlated. A small convenience cohort cannot establish general operational skill or calibrated probabilities.'};
}
