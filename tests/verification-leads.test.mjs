import {test} from 'node:test';import assert from 'node:assert/strict';
import {forecastChoices,compareTemperatures,HOUR} from '../public/observations-core.mjs';
import {leadChoices,compareLeadGroups,verificationObservations} from '../public/verification-leads.mjs';
import {ObservationsService} from '../lib/observations-service.mjs';import {WeatherService} from '../lib/weather-service.mjs';import {database} from './fixtures/push.mjs';
const now=Date.parse('2026-10-29T04:00:00Z'),stamp=h=>new Date(now+h*HOUR).toISOString();
const forecast=(lead,temp=70,targets=[0])=>({forecast:{properties:{updateTime:stamp(-lead),periods:targets.map(h=>({startTime:stamp(h),endTime:stamp(h+1),temperature:temp,temperatureUnit:'F'}))}}});
const measured=h=>({id:'obs'+h,at:now+h*HOUR,temperature:68,temperature_qc:'V'});
test('lead groups select actual pre-cutoff checks and keep source-lead boundaries disjoint',()=>{
  const checks=[6,12,24,48,72].map(lead=>({at:now/1000-lead*3600,revision:String(lead)})),forecasts=new Map(checks.map(c=>[c.revision,forecast(Number(c.revision))]));const r=compareLeadGroups([now],leadChoices(checks,[now]),forecasts,[measured(0)]);assert.deepEqual(r.groups.map(g=>g.pairs[0].lead_hours),[6,12,24,48]);assert.ok(r.groups.every(g=>g.sample_count===1));assert.ok(r.shared.every(g=>g.sample_count===1));
  const exact=compareLeadGroups([now],leadChoices([{at:now/1000-12*3600,revision:'12'}],[now]),forecasts,[measured(0)]);assert.equal(exact.groups[0].sample_count,0);assert.equal(exact.groups[1].sample_count,1);assert.equal(exact.groups[0].skipped.forecast_unavailable,1);
});
test('late-collected old issues cannot leak into a lead group and the latest rollback is not replaced with a favorable older revision',()=>{
  const checks=[{at:now/1000-13*3600,revision:'good'},{at:now/1000-12*3600,revision:'rollback'},{at:now/1000-2*3600,revision:'late'}],sources=new Map([['good',forecast(14)],['rollback',forecast(40)],['late',forecast(18)]]),r=compareLeadGroups([now],leadChoices(checks,[now]),sources,[measured(0)]);assert.equal(r.groups[1].sample_count,0);assert.equal(r.groups[1].skipped.forecast_unavailable,1);assert.equal(r.groups[2].sample_count,0);
});
test('common-hour errors exclude unmatched dates and different verifying observations',()=>{
  const selections=[{group:{id:'6-12',label:'short',minLead:6,maxLead:12,maxExclusive:true},choices:[0,1].map(h=>({at:now+h*HOUR,check:{at:now/1000-6*3600,revision:'short'}}))},{group:{id:'24-48',label:'long',minLead:24,maxLead:48,maxExclusive:true},choices:[{at:now,check:{at:now/1000-25*3600,revision:'long'}}]}];const forecasts=new Map([['short',forecast(6,70,[0,1])],['long',forecast(25,73)]]);const r=compareLeadGroups([now,now+HOUR],selections,forecasts,[measured(0),measured(1)]);assert.equal(r.groups[0].sample_count,2);assert.equal(r.shared[0].sample_count,1);assert.equal(r.shared[0].shorter_mae_f,2);assert.equal(r.shared[0].longer_mae_f,5);assert.equal(r.shared[0].difference_f,3);assert.equal(r.shared[0].pairs[0].observation_id,'obs0');assert.equal(r.groups[0].daily[0].sample_count,2);
});
test('timezone-free and duplicate valid-hour forecast periods are ineligible',()=>{
  const choices=forecastChoices([{at:now/1000-7*3600,revision:'r'}],[now]);for(const mutate of [p=>p.forecast.properties.updateTime=stamp(-8).slice(0,-1),p=>p.forecast.properties.periods[0].startTime=stamp(0).slice(0,-1),p=>p.forecast.properties.periods.push({...p.forecast.properties.periods[0]})]){const p=forecast(8);mutate(p);assert.equal(compareTemperatures([now],choices,new Map([['r',p]]),[measured(0)]).sample_count,0);}
});
test('conflicting measurements and timezone-free observations are audited without choosing a favorable value',()=>{
  const f=(id,value,timestamp=stamp(0))=>({id,properties:{timestamp,temperature:{value,unitCode:'wmoUnit:degF',qualityControl:'V'}}});const report=verificationObservations({features:[f('b',68),f('a',70),f('c',60,stamp(-1).slice(0,-1))]},now);assert.equal(report.conflicting_timestamps,1);assert.equal(report.time_excluded,1);assert.equal(report.rows[0].temperature,null);const identical=verificationObservations({features:[f('b',68),f('a',68)]},now);assert.equal(identical.conflicting_timestamps,0);assert.equal(identical.rows[0].id,'a');
});
test('empty evidence yields missing groups and null common-hour errors, never zero error',()=>{const r=compareLeadGroups([now],leadChoices([],[now]),new Map(),[]);assert.equal(r.groups.length,4);assert.ok(r.groups.every(g=>g.mae_f===null&&g.skipped.no_archive===1));assert.ok(r.shared.every(g=>g.difference_f===null&&g.pairs.length===0));});
test('service includes forecasts collected more than eight days ago for long-lead comparisons at the start of the seven-day window',async()=>{
  const db=database();let time=now/1000-227*3600;const target=-167;
  const fetcher=async url=>({ok:true,json:async()=>url.includes('/points/')?{properties:{observationStations:'https://api.weather.gov/gridpoints/LWX/1,1/stations'}}:url.includes('/gridpoints/')?{type:'FeatureCollection',features:[{type:'Feature',geometry:{type:'Point',coordinates:[-77,39]},properties:{stationIdentifier:'KAAA',name:'Test'}}]}:{type:'FeatureCollection',features:[{type:'Feature',id:'obs',properties:{station:'https://api.weather.gov/stations/KAAA',timestamp:stamp(target),temperature:{value:68,unitCode:'wmoUnit:degF',qualityControl:'V'}}}]}});
  const weather=new WeatherService(db,{clock:()=>time,fetcher});try{await weather.collect('forecast/39.0000,-77.0000',600,async()=>forecast(227,72,[target]));time=now/1000;const r=await new ObservationsService(weather).verification(39,-77,'KAAA');assert.equal(r.sample_count,0);const group=r.lead_analysis.groups.find(g=>g.id==='48-72');assert.equal(group.sample_count,1);assert.equal(group.pairs[0].lead_hours,60);assert.equal(group.mae_f,4);assert.equal(r.observation_audit.conflicting_timestamps,0);}finally{db.close();}
});


test('shared comparison excludes an hour when a boundary reading was allocated differently',()=>{
  const short={id:'6-12',label:'short',minLead:6,maxLead:12,maxExclusive:true},long={id:'24-48',label:'long',minLead:24,maxLead:48,maxExclusive:true};const selections=[{group:short,choices:[-1,0].map(h=>({at:now+h*HOUR,check:{at:now/1000-8*3600,revision:'short'}}))},{group:long,choices:[{at:now,check:{at:now/1000-25*3600,revision:'long'}}]}],sources=new Map([['short',forecast(8,70,[-1,0])],['long',forecast(25,73)]]),rows=[{...measured(-.5),id:'earlier'},{...measured(.5),id:'later'}];const r=compareLeadGroups([now-HOUR,now],selections,sources,rows);assert.equal(r.groups[0].pairs[1].observation_id,'later');assert.equal(r.groups[1].pairs[0].observation_id,'earlier');assert.equal(r.shared[0].sample_count,0);assert.equal(r.shared[0].difference_f,null);
});
