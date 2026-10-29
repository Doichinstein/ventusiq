import {DAY,dayTime,dateString,historyWindow} from '../public/analogs-core.mjs';
export const stationNow=Date.parse('2026-10-29T08:00:00Z');
export const temperatureStation={id:'72405013743',name:'Reagan',lat:38.848,lon:-77.034,begin:'1945-01-01',end:'2025-08-24'};
export const temperatureWindow=historyWindow(stationNow);
export function temperatureRow(date='2024-06-05',overrides={}){return {DATE:date,STATION:temperatureStation.id,TEMP:' 68.0',TEMP_ATTRIBUTES:'24',LATITUDE:'38.84721',LONGITUDE:'-77.03454',...overrides};}
export function temperatureHistory(){const rows=[];for(let at=dayTime(temperatureWindow.start);at<=dayTime(temperatureWindow.end);at+=DAY){const date=dateString(at),phase=(at-dayTime(date.slice(0,4)+'-01-01'))/DAY,mean=15+10*Math.sin(phase/365.25*2*Math.PI)+Math.sin(at/DAY)*2;rows.push({date,mean_c:mean,observations:24,reason:null});}return {station:temperatureStation,window:temperatureWindow,rows,years:[],usable_days:rows.length,expected_days:rows.length,revision:'test1',checked_at:'2026-10-29T08:00:00Z',catalog:{}};}
