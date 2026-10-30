import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {stopWeather,journeyStopWeather,renderStopWeather} from '../public/journey-stop-weather.mjs';
import {evaluateJourney} from '../public/journey-core.mjs';
const now=Date.parse('2026-11-01T05:00:00Z'),H=3600000,iso=t=>new Date(t).toISOString(),url='https://api.weather.gov/gridpoints/LWX/1,2';
const stop={index:1,coordinate:[-77,39],arrival_elapsed:900,departure_elapsed:4500,duration:3600};
function fixture(){
  const forecast={point:'39.0000,-77.0000',revision:'hourly-edition',checked_at:iso(now),issued_at:iso(now),source_url:url+'/forecast/hourly',metadata:{properties:{timeZone:'America/New_York',forecastHourly:url+'/forecast/hourly',forecastGridData:url}},forecast:{properties:{periods:[
    {startTime:'2026-11-01T01:00:00-04:00',endTime:'2026-11-01T01:00:00-05:00',temperature:50,temperatureUnit:'F',windSpeed:'5 to 10 mph',probabilityOfPrecipitation:{value:0}},
    {startTime:'2026-11-01T01:00:00-05:00',endTime:'2026-11-01T02:00:00-05:00',temperature:20,temperatureUnit:'C',windSpeed:{value:32.18688,unitCode:'wmoUnit:km_h-1'},probabilityOfPrecipitation:{value:70}}
  ]}}};
  const grid={revision:'gust-edition',checked_at:iso(now),issued_at:iso(now),source_url:url,grid:{id:url,properties:{gridId:'LWX',gridX:1,gridY:2,updateTime:iso(now),windGust:{uom:'wmoUnit:mi_h-1',values:[{validTime:iso(now)+'/PT1H',value:15},{validTime:iso(now+H)+'/PT1H',value:30}]}}}};
  return {forecast,grid};
}
const run=(f=fixture(),s=stop,departure=now)=>stopWeather(f.forecast,f.grid,s,departure,now);
test('whole-stop weather clips intervals, converts units, preserves zero and handles repeated DST hours',()=>{
  const r=run();assert.equal(r.complete,true);assert.deepEqual(r.segments.map(s=>s.minutes),[45,15]);
  assert.equal(r.metrics.temperature.minimum,50);assert.equal(r.metrics.temperature.maximum,68);assert.equal(r.metrics.wind.maximum,20);
  assert.equal(r.metrics.rain.minimum,0);assert.equal(r.metrics.rain.maximum,70);assert.equal(r.metrics.gust.maximum,30);
  assert.equal(r.source.revision,'hourly-edition');assert.equal(r.segments[1].gust_evidence.revision,'gust-edition');assert.equal(r.segments[1].gust_evidence.interval.raw.value,30);
});
test('a short forecast gap between half-hour samples withholds whole-stop values',()=>{
  const f=fixture();f.forecast.forecast.properties.periods[0].endTime=iso(now+40*60000);
  const r=run(f);assert.equal(r.metrics.temperature.covered_minutes,40);assert.equal(r.metrics.temperature.unknown_minutes,20);assert.equal(r.metrics.temperature.maximum,null);
  assert.equal(r.metrics.gust.complete,true);assert.equal(r.metrics.gust.maximum,30);assert.equal(r.complete,false);
});
test('overlapping periods are ambiguous even with identical values; overlap is not double-counted',()=>{
  const f=fixture();f.forecast.forecast.properties.periods.push({...f.forecast.forecast.properties.periods[0],startTime:iso(now+30*60000),endTime:iso(now+40*60000)});
  const r=run(f);assert.equal(r.metrics.wind.unknown_minutes,10);assert.equal(r.metrics.wind.covered_minutes,50);assert.equal(r.metrics.wind.maximum,null);assert.match(r.segments[1].hourly_reason,/ambiguous/);
});
test('only the affected metric loses its full-stop range when one field is invalid',()=>{
  for(const mutation of [p=>p.windSpeed='-10 mph',p=>p.windSpeed='20 to 10 mph',p=>p.windSpeed='10 mph uncertain',p=>p.windSpeed={value:10,unitCode:'invalid'}]){
    const f=fixture();mutation(f.forecast.forecast.properties.periods[1]);const r=run(f);assert.equal(r.metrics.wind.unknown_minutes,15);assert.equal(r.metrics.wind.maximum,null);assert.equal(r.metrics.temperature.maximum,68);
  }
  const f=fixture();f.forecast.forecast.properties.periods[1].probabilityOfPrecipitation.value=101;assert.equal(run(f).metrics.rain.maximum,null);
});
test('stale, erroneous, future, wrong-point and wrong-source hourly inputs cannot yield full-stop ranges',()=>{
  for(const mutate of [f=>f.stale=true,f=>f.error='source outage',f=>f.checked_at=iso(now-900001),f=>f.checked_at=iso(now+60001),f=>f.issued_at=iso(now-24*H-1),f=>f.issued_at='2026-11-01T05:00:00',f=>f.point='40.0000,-77.0000',f=>f.source_url=url+'/forecast',f=>f.forecast.properties.periods[0].endTime='bad']){
    const f=fixture();mutate(f.forecast);const r=run(f);assert.equal(r.metrics.temperature.covered_minutes,0);assert.equal(r.metrics.temperature.maximum,null);assert.equal(r.complete,false);
  }
});
test('gust gaps, conflicting intervals and wrong grid identity withhold gust maxima independently',()=>{
  for(const mutate of [g=>g.grid.properties.windGust.values.pop(),g=>g.grid.properties.windGust.values.push({...g.grid.properties.windGust.values[1],value:0}),g=>g.grid.properties.gridY=3,g=>g.stale=true]){
    const f=fixture();mutate(f.grid);const r=run(f);assert.equal(r.metrics.gust.maximum,null);assert.equal(r.metrics.gust.complete,false);assert.equal(r.metrics.temperature.complete,true);
  }
});
test('stop end is exclusive, later departures use later periods, and missing horizon remains unknown',()=>{
  const endAtHour={...stop,departure_elapsed:3600,duration:2700};assert.equal(run(fixture(),endAtHour).metrics.gust.maximum,15);
  const later=run(fixture(),{...stop,arrival_elapsed:0,departure_elapsed:3600},now+H);assert.equal(later.metrics.gust.maximum,30);assert.equal(later.metrics.temperature.minimum,68);
  const missing=run(fixture(),stop,now+2*H);assert.equal(missing.metrics.temperature.covered_minutes,0);assert.equal(missing.metrics.gust.maximum,null);
});
test('zero-minute via points are excluded, absent stop samples stay unknown, and each stop gets its own source',()=>{
  const f=fixture(),s2={...stop,index:2},samples=[{stop_index:2}],route={stops:[stop,s2,{...stop,index:3,duration:0}]};
  const r=journeyStopWeather(route,samples,[f.forecast],[f.grid],now,now);assert.equal(r.length,2);assert.equal(r[0].complete,false);assert.equal(r[1].complete,true);
  assert.match(run(fixture(),{...stop,departure_elapsed:10000}).reason,/duration/);
});
test('Journey departure evidence exports the full-stop analysis and keeps raw gust provenance',()=>{
  const f=fixture(),r=evaluateJourney({duration:4500,stops:[stop]},[{stop_index:1,lat:39,lon:-77,elapsed:900}],[f.forecast],{entries:[],unknown_geometry:0},now,{now,grids:[f.grid]});
  const saved=JSON.parse(JSON.stringify(r));assert.equal(saved.weather_stops[0].metrics.gust.maximum,30);assert.equal(saved.max_gust,15);assert.equal(saved.weather_stops[0].source.revision,'hourly-edition');
});
test('rendered summary updates for new departures, marks gaps, escapes source errors and clears no-stop journeys',()=>{
  const {document}=parseHTML('<div id="journey-stop-weather"></div>'),target=document.getElementById('journey-stop-weather');
  renderStopWeather(document,{weather_stops:[run()]},String);assert.match(target.textContent,/50–68°F/);assert.match(target.textContent,/Gust: up to 30 mph/);assert.equal(target.hidden,false);
  const f=fixture();f.forecast.error='<img src=x onerror=alert(1)>';
  renderStopWeather(document,{weather_stops:[run(f)]},String);assert.match(target.textContent,/Temperature: Unknown/);assert.equal(target.querySelectorAll('img').length,0);assert.match(target.textContent,/0\/60 minutes/);
  renderStopWeather(document,{weather_stops:[]},String);assert.equal(target.hidden,true);assert.equal(target.textContent,'');
});
