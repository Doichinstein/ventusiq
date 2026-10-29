/* NOAA recorded impact context. Apache-2.0. */
export const STORM_HISTORY_METHOD='2026-10-29.1';
export const STORM_BASE='https://www.ncei.noaa.gov/access/storm-events-database';
const DAY=86400000;
export class StormInputError extends Error{constructor(message){super(message);this.status=400;}}
export function stormDate(value){if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))throw new StormInputError('Use a valid YYYY-MM-DD date');const t=Date.parse(value+'T00:00:00Z');if(!Number.isFinite(t)||new Date(t).toISOString().slice(0,10)!==value)throw new StormInputError('Use a valid YYYY-MM-DD date');return t;}
export const stormDay=t=>new Date(t).toISOString().slice(0,10);
export function stormQuery(input,now=Date.now()){
  const start=stormDate(input.start),end=stormDate(input.end);
  if(start<Date.UTC(1950,0,1)||end<start||end-start>6*DAY||end>now)throw new StormInputError('Choose one to seven past UTC dates, from 1950 onward');
  const state=String(input.state||'').trim(),county=String(input.county||'').trim();if(!state||state.length>80||county.length>100)throw new StormInputError('Choose a NOAA state/area and optional county');
  return {state,county,start:input.start,end:input.end,source_start:stormDay(Math.max(Date.UTC(1950,0,1),start-DAY)),source_end:stormDay(end+DAY)};
}
export function stormTime(value){
  // NOAA explicitly supplies a fixed numeric offset, e.g. EST-5. Do not infer DST.
  if(typeof value!=='string')return null;const m=value.match(/^(\d{2})\/(\d{2})\/(\d{4}) (\d{2}):(\d{2}) [A-Z]{2,5}([+-]\d{1,2})(?::([0-5]\d))?$/);if(!m)return null;
  let date;try{date=stormDate(`${m[3]}-${m[1]}-${m[2]}`);}catch{return null;}const hour=+m[4],minute=+m[5],offset=+m[6],offsetMinutes=+(m[7]||0);if(hour>23||minute>59||Math.abs(offset)>14||(Math.abs(offset)===14&&offsetMinutes))return null;
  const sign=m[6].startsWith('-')?-1:1;return date+(hour*60+minute-offset*60-sign*offsetMinutes)*60000;
}
const count=v=>Number.isInteger(v)&&v>=0?v:null;
const field=v=>typeof v==='string'&&v.trim()?v:null;
export function stormRecords(raw,query){
  if(raw?.error||!Array.isArray(raw?.data)||raw.data.length>2000)throw Error('NOAA storm response is unavailable or exceeds the record limit');
  const audit={returned:raw.data.length,duplicate:0,conflicting:0,invalid:0,foreign_state:0,unknown_time:0,outside_dates:0},groups=new Map();
  for(const row of raw.data){if(!row||!Number.isSafeInteger(row.event_id)||row.event_id<=0){audit.invalid++;continue;}const group=groups.get(row.event_id)||[];group.push(row);groups.set(row.event_id,group);}
  const records=[];for(const rows of groups.values()){
    if(rows.some(r=>JSON.stringify(r)!==JSON.stringify(rows[0]))){audit.conflicting+=rows.length;continue;}audit.duplicate+=rows.length-1;const r=rows[0];
    if(typeof r.state!=='string'||r.state.toLowerCase()!==query.state.toLowerCase()){audit.foreign_state++;continue;}
    if(!field(r.event_type)||!field(r.cz_name)){audit.invalid++;continue;}const start=stormTime(r.begin_date_time_formatted),end=stormTime(r.end_date_time_formatted);
    if(start===null){audit.unknown_time++;continue;}if(start<stormDate(query.start)||start>=stormDate(query.end)+DAY){audit.outside_dates++;continue;}
    records.push({id:r.event_id,episode_id:Number.isSafeInteger(r.episode_id)?r.episode_id:null,type:r.event_type,area:r.cz_name,state:r.state,location:field(r.begin_location_for_results),start_utc:new Date(start).toISOString(),end_utc:end!==null&&end>=start?new Date(end).toISOString():null,start_source:r.begin_date_time_formatted,end_source:field(r.end_date_time_formatted),magnitude:field(r.magnitude),deaths_direct:count(r.deaths_direct),injuries_direct:count(r.injuries_direct),damage_property:field(r.damage_property),damage_crops:field(r.damage_crops),source_url:STORM_BASE+'/event-details/'+r.event_id});
  }
  records.sort((a,b)=>a.start_utc.localeCompare(b.start_utc)||a.id-b.id);return {records,audit,complete:false};
}
export async function stormJSON(path,body,fetcher=fetch,signal){
  if(!['min-max-dates','state-list','state-counties','search-events'].includes(path))throw Error('Unsupported NOAA storm operation');
  const response=await fetcher(STORM_BASE+'/api/'+path,{method:body?'POST':'GET',headers:{Accept:'application/json',...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),redirect:'manual',signal});
  if(!response.ok)throw Error('NOAA Storm Events returned HTTP '+response.status);const reader=response.body?.getReader();if(!reader)throw Error('Missing NOAA storm response');const chunks=[];let size=0;
  for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>2*1024*1024){await reader.cancel();throw Error('NOAA storm response exceeds 2 MiB; narrow the county or dates');}chunks.push(value);}const bytes=new Uint8Array(size);let offset=0;for(const c of chunks){bytes.set(c,offset);offset+=c.length;}return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
}
