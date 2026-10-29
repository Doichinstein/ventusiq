import {DAY,dayTime,dateString,seasonDistance,quantile} from './analogs-core.mjs';
import {analogDiagnostics} from './analog-diagnostics.mjs';
import {stationDistance} from './station-history-core.mjs';
export const STATION_ANALOG_METHOD='2026-10-29.1';
export const STATION_ANALOG_RULES=Object.freeze({minimum_observations:18,maximum_catalog_distance_km:1,season_days:30,maximum_difference_c:3,separation_days:7,max_matches:20,min_matches:10});
const finite=x=>typeof x==='number'&&Number.isFinite(x);
const numeric=x=>typeof x==='string'&&/^[+-]?\d+(\.\d+)?$/.test(x.trim())?Number(x):null;
export function stationTemperatures(raw,station,window){
  const start=dayTime(window.start),end=dayTime(window.end);
  if(!Array.isArray(raw)||raw.length>4200||!finite(start)||!finite(end)||end<start||end-start>3660*DAY)throw Error('Invalid station temperature history');
  const groups=new Map(),audit={returned:raw.length,foreign:0,conflicting:0,duplicates:0,missing:0,temperature:0,observations:0,location:0},rows=[];
  for(const r of raw){if(!r||typeof r!=='object'||Array.isArray(r))throw Error('Invalid station temperature row');const at=dayTime(r.DATE);if(r.STATION!==station.id||!finite(at)||at<start||at>end){audit.foreign++;continue;}const group=groups.get(r.DATE)||[];group.push(r);groups.set(r.DATE,group);}
  for(let at=start;at<=end;at+=DAY){const date=dateString(at),group=groups.get(date)||[],r=group[0];let reason=null,mean=null,count=null;
    if(!r){reason='missing';audit.missing++;}
    else if(group.some(x=>JSON.stringify(x)!==JSON.stringify(r))){reason='conflicting';audit.conflicting+=group.length;}
    else{audit.duplicates+=group.length-1;const f=numeric(r.TEMP),lat=numeric(r.LATITUDE),lon=numeric(r.LONGITUDE);count=numeric(r.TEMP_ATTRIBUTES);
      if(f===null||f===9999.9||f< -150||f>150)reason='temperature';
      else if(!Number.isInteger(count)||count<STATION_ANALOG_RULES.minimum_observations||count>999)reason='observations';
      else if(lat===null||lon===null||Math.abs(lat)>90||Math.abs(lon)>180||stationDistance(station,{lat,lon})>STATION_ANALOG_RULES.maximum_catalog_distance_km)reason='location';
      else mean=(f-32)*5/9;
      if(reason)audit[reason]++;
    }
    rows.push({date,mean_c:mean,observations:count,reason});
  }
  const years=[...new Set(rows.map(r=>r.date.slice(0,4)))].map(year=>{const subset=rows.filter(r=>r.date.startsWith(year));return {year,expected:subset.length,usable:subset.filter(r=>finite(r.mean_c)).length};});
  return {rows,audit,years,expected_days:rows.length,usable_days:rows.filter(r=>finite(r.mean_c)).length};
}
function distribution(values){const data=values.filter(finite);return {n:data.length,p10:quantile(data,.1),median:quantile(data,.5),p90:quantile(data,.9)};}
export function stationTemperatureMatches(rows,target,cutoff){
  const targetAt=dayTime(target?.date),cutoffAt=dayTime(cutoff);if(!finite(targetAt)||!finite(cutoffAt)||!finite(target?.mean_c))throw Error('Invalid temperature reference');
  const byDate=new Map(rows.map(r=>[r.date,r]));if(byDate.size!==rows.length)throw Error('Duplicate temperature dates');
  const pool=[],candidates=[];
  for(const row of rows){const at=dayTime(row.date);if(!finite(at)||at+2*DAY>cutoffAt||targetAt-at<7*DAY||!finite(row.mean_c)||seasonDistance(row.date,target.date)>30)continue;
    const outcome=byDate.get(dateString(at+DAY))||{date:dateString(at+DAY),mean_c:null},difference=row.mean_c-target.mean_c;pool.push(outcome.mean_c);
    if(Math.abs(difference)<=3)candidates.push({date:row.date,difference_c:difference,distance:Math.abs(difference)/3,conditions:row,outcome});
  }
  candidates.sort((a,b)=>a.distance-b.distance||a.date.localeCompare(b.date));const matches=[];
  for(const candidate of candidates){if(matches.every(m=>Math.abs(dayTime(m.date)-dayTime(candidate.date))>=7*DAY))matches.push(candidate);if(matches.length===20)break;}
  const outcome=distribution(matches.map(m=>m.outcome.mean_c)),seasonal=distribution(pool);
  return {target,cutoff,seasonal_candidates:pool.length,close_candidates:candidates.length,matches,outcome,seasonal,sufficient:matches.length>=10&&outcome.n>=10&&seasonal.n>=10};
}
export function stationTemperatureEvaluation(history){
  const cutoff=history.window.holdout_start,firstYear=Number(cutoff.slice(0,4)),byDate=new Map(history.rows.map(r=>[r.date,r])),trials=[],cases=[];
  for(let year=firstYear;year<=firstYear+1;year++)for(let month=1;month<=12;month++)for(const day of [7,21]){
    const date=`${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`,target=byDate.get(date),actual=byDate.get(dateString(dayTime(date)+DAY));
    if(!finite(target?.mean_c)||!finite(actual?.mean_c)){trials.push({date,status:'missing'});continue;}
    const r=stationTemperatureMatches(history.rows,target,cutoff);if(!r.sufficient){trials.push({date,status:'insufficient',match_count:r.matches.length});continue;}
    trials.push({date,status:'evaluated',match_count:r.matches.length});cases.push({date,actual,prediction:{mean_c:r.outcome},baseline:{mean_c:r.seasonal},persistence:target,match_dates:r.matches.map(m=>m.date)});
  }
  const diagnostics=analogDiagnostics(cases,trials,['mean_c'],10);
  diagnostics.grouping='Station-reported calendar dates; month groups and calendar years. No equivalence to a local civil day or NWS forecast day is assumed.';
  return {cutoff,trials,cases,diagnostics,attempted:trials.length,evaluated:cases.length,missing:trials.filter(t=>t.status==='missing').length,insufficient:trials.filter(t=>t.status==='insufficient').length};
}
export function stationTemperatureReport(history,date,now=Date.now()){
  const target=history.rows.find(r=>r.date===date),selected=finite(target?.mean_c)?stationTemperatureMatches(history.rows,target,date):null;
  return {method:STATION_ANALOG_METHOD,rules:STATION_ANALOG_RULES,evaluated_at:new Date(now).toISOString(),reference_date:date,history,selected,validation:stationTemperatureEvaluation(history),scope:'Retrospective station daily-mean temperature experiment. Histories were downloaded now, not known at historical decision times. Reporting-day and sampling differences prevent interpreting this as validation of current NWS forecast transfer, calibrated probability, station continuity or address-level accuracy.'};
}
