import {ANALOG_METHOD,DAY,RULES,gridPoint,forecastDays,normalizeHistory,selectAnalogs,dayTime} from '../public/analogs-core.mjs';
import {AGGREGATION,sha,outcomeRequests} from '../lib/analog-forward.mjs';
export const decision=Date.parse('2026-10-28T20:00:00Z'),registered=Date.parse('2026-10-29T09:00:00Z'),evaluation=Date.parse('2026-11-01T01:00:00Z');
export function powerRaw(grid,start,end,values=()=>[20,10,1,0]){
  const parameters={T2M_MAX:{units:'C'},T2M_MIN:{units:'C'},WS10M:{units:'m/s'},PRECTOTCORR:{units:'mm/day'}},parameter=Object.fromEntries(Object.keys(parameters).map(key=>[key,{}]));
  for(let t=dayTime(start);t<=dayTime(end);t+=DAY){const day=new Date(t).toISOString().slice(0,10),key=day.replaceAll('-','');Object.keys(parameters).forEach((name,i)=>parameter[name][key]=values(day)[i]);}
  return {type:'Feature',geometry:{type:'Point',coordinates:[grid.lon,grid.lat]},header:{time_standard:'UTC',sources:['MERRA2'],fill_value:-999},parameters,properties:{parameter}};
}
export function cohortFixture({peak=20}={}){
  const grid=gridPoint(39,-77),window={start:'2019-01-01',end:'2020-12-31'},raw=powerRaw(grid,window.start,window.end),history={raw,grid,window},historyRevision=sha(history),historyDataset='history/power/'+grid.key+'/'+window.start+'/'+window.end;
  const historySource=historyDataset+':'+historyRevision,sources={[historySource]:{dataset:historyDataset,revision:historyRevision,raw:history,first_collected_at:new Date(decision).toISOString()}},cases=[];
  for(const [index,target_date] of ['2026-10-29','2026-10-29','2026-10-30'].entries()){
    const point={lat:Number((39+index*.01).toFixed(2)),lon:-77},dataset=`forecast/${point.lat.toFixed(2)},-77.00`;
    const forecast={source_url:'https://api.weather.gov/gridpoints/TEST/1,1/forecast/hourly',forecast:{properties:{updateTime:new Date(decision).toISOString(),periods:Array.from({length:24},(_,h)=>({startTime:new Date(dayTime(target_date)+h*3600000).toISOString(),endTime:new Date(dayTime(target_date)+(h+1)*3600000).toISOString(),temperature:h===0?10:peak,temperatureUnit:'C',windSpeed:'3.6 km/h'}))}}};
    const revision=sha(forecast),key=dataset+':'+revision;
    sources[key]={dataset,revision,raw:forecast,first_collected_at:new Date(decision).toISOString()};
    const target=forecastDays({...forecast,checked_at:new Date(decision).toISOString(),revision},decision)[0],prediction=selectAnalogs(normalizeHistory(raw,window,grid).rows,target,'2021-01-01');
    cases.push({id:sha({dataset,date:target_date}),point,grid,target_date,outcome_date:new Date(dayTime(target_date)+DAY).toISOString().slice(0,10),outcome_ends_at:new Date(dayTime(target_date)+2*DAY).toISOString(),decision_time:new Date(decision).toISOString(),forecast_check:new Date(decision).toISOString(),history_check:new Date(decision).toISOString(),forecast_source:key,history_source:historySource,target,prediction,status:prediction.sufficient?'sufficient_matches':'insufficient_matches'});
  }
  const document={schema:'ventusiq-analog-forward-cohort/1',registered_at:new Date(registered).toISOString(),analog_method:ANALOG_METHOD,rules:RULES,cases,sources,source_hashes:Object.fromEntries(Object.entries(sources).map(([key,s])=>[key,s.revision]))};
  const bundle={document,integrity:{sha256:sha(document)}},groups={};for(const c of cases)(groups[c.grid.key+'/'+c.outcome_date]??=[]).push(c.id);
  const plan={cohort_sha256:bundle.integrity.sha256,recorded_at:new Date(registered+60000).toISOString(),aggregation:AGGREGATION,cases_verified:cases.length,unique_grid_outcome_days:Object.keys(groups).length,groups};
  return {bundle,plan};
}
export function outcomeFixture(cohort,{now=evaluation,values=day=>[day==='2026-10-30'?10:40,0,0,0]}={}){
  const editions=outcomeRequests(cohort,now).map(request=>{const raw=powerRaw(request.grid,request.window.start,request.window.end,values);return {...request,fetched_at:new Date(now).toISOString(),raw,sha256:sha(raw)};});
  return {schema:'ventusiq-analog-outcomes/1',cohort_sha256:cohort.cohort_sha256,requested_at:new Date(now).toISOString(),editions,errors:[]};
}
