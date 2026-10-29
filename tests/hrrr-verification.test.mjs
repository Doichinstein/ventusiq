import {test} from 'node:test';
import assert from 'node:assert/strict';
import {hrrrChoices,compareHrrr,hrrrEvidence} from '../public/hrrr-verification-core.mjs';
import {verificationHours} from '../public/observations-core.mjs';
import {WeatherService} from '../lib/weather-service.mjs';
import {HrrrVerificationService} from '../lib/hrrr-verification-service.mjs';
import {database} from './fixtures/push.mjs';
const H=3600000,init=Date.parse('2026-10-29T00:00:00Z'),target=init+6*H,point={lat:39,lon:-77},station={id:'KAAA',...point},check={at:(init+2*H)/1000,revision:'r'};
function product(){return {method:'2026-10-29.1',model:'NOAA HRRR',point,cell:{...point,x:1400,y:600,chunk:'0.4.9',projection_distance_m:0},issued_at:new Date(init).toISOString(),raw_unit:'K',height_m:2,temporal_semantics:'instantaneous',source_url:'https://hrrrzarr.s3.amazonaws.com/sfc/20261029/20261029_00z_fcst.zarr/2m_above_ground/TMP/2m_above_ground/TMP/0.4.9',chunk_sha256:'a'.repeat(64),samples:Array.from({length:48},(_,i)=>({at:new Date(init+(i+1)*H).toISOString(),lead_hours:i+1,raw_kelvin:293.15}))};}
const reading={id:'o',at:target,temperature:64,temperature_qc:'V'};
const report=(p=product(),obs=[reading],c=check)=>compareHrrr([target],[{at:target,check:c}],new Map([['r',p]]),obs,point,station);
test('20 Celsius gives 68 F and a +4 F difference; capture and model leads remain separate',()=>{
  const r=report();assert.equal(r.sample_count,1);assert.equal(r.mae_f,4);assert.equal(r.bias_f,4);assert.equal(r.rmse_f,4);
  assert.equal(r.pairs[0].forecast_f,68);assert.equal(r.pairs[0].lead_hours,6);assert.equal(r.pairs[0].collection_lead_hours,4);assert.equal(r.pairs[0].grid_station_distance_km,0);
  assert.deepEqual(r.groups.map(g=>g.sample_count),[0,1,0,0]);assert.equal(r.days,1);assert.equal(r.runs,1);assert.equal(r.daily[0].mae_f,4);
});
test('only completed observation windows qualify; no evidence gives null errors and explicit denominator',()=>{
  assert.ok(verificationHours(target+H/2-1).at(-1)<target);assert.equal(verificationHours(target+H/2).at(-1),target);
  const r=compareHrrr([target],[],new Map(),[],point,station);assert.equal(r.mae_f,null);assert.equal(r.bias_f,null);assert.equal(r.rmse_f,null);assert.equal(r.skipped.no_archive,1);
});
test('late captures and future or stale-at-capture runs cannot become historical predictions',()=>{
  assert.equal(hrrrChoices([{...check,at:(target-H+1)/1000}],[target]).length,0);
  assert.equal(report(product(),[reading],{...check,at:target/1000}).sample_count,0);
  const p=product();p.issued_at=new Date(init+6*H).toISOString();assert.equal(report(p).sample_count,0);
  assert.throws(()=>hrrrEvidence(product(),point,{...check,at:(init+19*H)/1000}),/capture/);
});
test('conflicting latest checks and latest bad products never fall back to a favorable earlier edition',()=>{
  const choices=hrrrChoices([{...check,at:check.at-1,revision:'good'},check,{...check,revision:'conflict'}],[target]);assert.equal(choices[0].check.revision,null);
  assert.equal(compareHrrr([target],choices,new Map([['good',product()]]),[reading],point,station).skipped.forecast_unavailable,1);
  const p=product();p.samples[5].raw_kelvin=null;const chosen=hrrrChoices([{...check,at:check.at-1,revision:'good'},check],[target]);
  assert.equal(compareHrrr([target],chosen,new Map([['good',product()],['r',p]]),[reading],point,station).sample_count,0);
});
test('units, grid identity, chunk identity, duplicate samples and inconsistent leads remain unknown',()=>{
  for(const mutate of [p=>p.raw_unit='F',p=>p.point={lat:40,lon:-77},p=>p.cell.x=-1,p=>p.source_url+='wrong',p=>p.chunk_sha256='',p=>p.samples[5].lead_hours=7,p=>p.samples[5].raw_kelvin=400,p=>p.samples[5].raw_kelvin='293.15',p=>p.samples[8]={...p.samples[5]}]){const p=product();mutate(p);assert.equal(report(p).sample_count,0);}
});
test('nearest bad observation is not skipped; preliminary QC and reused observations are excluded',()=>{
  for(const temperature_qc of ['S','Z','X','Unknown'])assert.equal(report(product(),[{...reading,temperature_qc}]).skipped.quality_excluded,1);
  assert.equal(report(product(),[{...reading,temperature:null},{...reading,id:'good',at:target+60000}]).skipped.observation_unavailable,1);
  assert.equal(report(product(),[{...reading,at:target+31*60000}]).sample_count,0);
  const r=compareHrrr([target,target+H],[{at:target,check},{at:target+H,check}],new Map([['r',product()]]),[{...reading,at:target+H/2}],point,station);assert.equal(r.sample_count,1);
});
test('lead groups are disjoint at boundaries and 48-hour run horizon is inclusive',()=>{
  for(const [lead,index] of [[5,0],[6,1],[12,2],[24,3],[48,3]]){
    const at=init+lead*H,r=compareHrrr([at],[{at,check}],new Map([['r',product()]]),[{...reading,at}],point,station);
    assert.equal(r.sample_count,1);assert.equal(r.groups[index].sample_count,1);assert.equal(r.groups.reduce((s,g)=>s+g.sample_count,0),1);
  }
});
test('service uses captured products and later station QC without requesting an HRRR forecast',async()=>{
  const db=database();let time=check.at;const requests=[];
  const fetcher=async url=>{requests.push(url);assert.ok(url.startsWith('https://api.weather.gov/'));return {ok:true,json:async()=>url.includes('/points/')?{properties:{observationStations:'https://api.weather.gov/gridpoints/LWX/1,1/stations'}}:url.includes('/gridpoints/')?{type:'FeatureCollection',features:[{type:'Feature',geometry:{type:'Point',coordinates:[-77,39]},properties:{stationIdentifier:'KAAA',name:'Test'}}]}:{type:'FeatureCollection',features:[{type:'Feature',id:'obs',properties:{station:'https://api.weather.gov/stations/KAAA',timestamp:new Date(target).toISOString(),temperature:{value:(64-32)*5/9,unitCode:'wmoUnit:degC',qualityControl:'V'}}}]}};};
  const weather=new WeatherService(db,{clock:()=>time,fetcher});try{
    await weather.collect('hazards/hrrr-temperature/39,-77',3600,async()=>product());time=(target+H)/1000;
    const service=new HrrrVerificationService(weather),r=await service.compare(39,-77,'KAAA');assert.equal(r.sample_count,1);assert.equal(r.mae_f,4);
    assert.equal(r.archive.products.length,1);assert.deepEqual(r.archive.products[0].product,product());assert.equal(r.observation_evidence.features[0].id,'obs');assert.equal(r.archive.scanned_checks,1);
    assert.equal(r.archive.earliest_target_by_collection_rule,new Date(init+3*H).toISOString());assert.equal(r.archive.earliest_observation_window_end,new Date(init+3.5*H).toISOString());
    await assert.rejects(()=>service.compare(39,-77,'KBBB'),/Invalid station/);assert.ok(requests.length>=3);
  }finally{db.close();}
});
