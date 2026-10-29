import {unpack} from './archive-codec.mjs';
import {persistenceReading,PERSISTENCE_MAX_AGE} from '../public/verification-persistence.mjs';
import {OBSERVATION_RETENTION_DAYS} from '../public/verification-window.mjs';

export async function persistenceEvidence(weather,station,pairs){
  const times=[...new Set(pairs.map(p=>Date.parse(p.forecast_checked_at)).filter(Number.isFinite))].sort((a,b)=>a-b),byCheck=new Map(),archive={retention_days:OBSERVATION_RETENTION_DAYS,scan_limit:2000,scanned_checks:0,selected_editions:0,source_projection:'Selected baseline records only; complete original editions remain in the shared archive while retained'};
  if(!times.length)return {byCheck,archive};
  const name='observations/station/'+station;
  const checks=(await weather.statement('SELECT at,revision FROM checks WHERE dataset=? AND at>=? AND at<? ORDER BY at LIMIT 2001',name,Math.ceil((times[0]-PERSISTENCE_MAX_AGE)/1000),Math.ceil(times.at(-1)/1000)).all()).results;archive.scanned_checks=checks.length;
  if(checks.length>2000)return {byCheck,archive,error:'Persistence archive exceeds the 2,000-check limit; forecast comparisons remain available'};
  let index=-1;const needed=new Map();
  for(const time of times){while(index+1<checks.length&&checks[index+1].at*1000<time)index++;const check=checks[index],key=new Date(time).toISOString();if(!check||time-check.at*1000>PERSISTENCE_MAX_AGE){byCheck.set(key,persistenceReading(null,key,station));continue;}if(!needed.has(check.revision))needed.set(check.revision,[]);needed.get(check.revision).push({at:check.at,key});}
  const ids=[...needed.keys()];archive.selected_editions=ids.length;
  // Expand only eight compressed editions at a time; retain selected baseline records.
  for(let i=0;i<ids.length;i+=8){const rows=(await weather.statement('SELECT revision,payload FROM revisions WHERE dataset=? AND revision IN (SELECT value FROM json_each(?))',name,JSON.stringify(ids.slice(i,i+8))).all()).results;for(const row of rows){const raw=await unpack(row.payload);for(const choice of needed.get(row.revision))byCheck.set(choice.key,persistenceReading({...raw,revision:row.revision,checked_at:new Date(choice.at*1000).toISOString()},choice.key,station));}}
  return {byCheck,archive};
}
