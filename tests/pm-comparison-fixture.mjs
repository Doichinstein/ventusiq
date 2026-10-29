import {airFixture} from './air-forecast-fixture.mjs';
export const HOUR=3600000,now=Date.parse('2026-10-29T06:30:00Z'),target=Date.parse('2026-10-29T06:00:00Z');
export const monitor={id:'110010043',geometry:{type:'Point',coordinates:[-77,39]},properties:{name:'Monitor'},distance_km:0};
export const reading=(at,pm25=10,id=at)=>({type:'Feature',id,geometry:structuredClone(monitor.geometry),properties:{ObjectId:id,AQSID:monitor.id,ValidTime:at,PM25:pm25,PM25_AQI:42,PM25_Measured:1,PM25_Unit:'UG/M3'}});
export const observations=(features=[reading(target)],checked=now)=>({type:'FeatureCollection',monitor_id:monitor.id,revision:'observations',checked_at:new Date(checked).toISOString(),features});
export function fixture(){const forecast=airFixture(target-24*HOUR),at=(target-2*HOUR)/1000;return {place:{lat:39,lon:-77},monitor,observations:observations(),checks:[{at,revision:'forecast-before'}],forecasts:new Map([['forecast-before',forecast]]),baselineEditions:new Map([[at,{...observations([reading(target-3*HOUR,12)],target-2.5*HOUR),revision:'baseline-before'}]]),now};}
