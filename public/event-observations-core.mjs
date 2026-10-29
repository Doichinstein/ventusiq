import {stationId,quantity} from './observations-core.mjs';
import {validPoint} from './hazards-core.mjs';
import {inReportArea} from './event-reports-core.mjs';
export const EVENT_OBSERVATION_METHOD='2026-10-28.1';
const instant=v=>typeof v==='string'&&/(Z|[+-]\d\d:\d\d)$/.test(v)?Date.parse(v):NaN;
const metrics=[['temperature','temperature','temperature','°F'],['wind','windSpeed','wind','mph'],['gust','windGust','wind','mph']];
export function eventStates(windows){return [...new Set(windows.flatMap(w=>w.feature.properties.geocode?.UGC||[]).filter(v=>/^[A-Z]{2}[CZ]\d{3}$/.test(v)).map(v=>v.slice(0,2)))].sort();}
export function eventStationCandidates(products,areas){const found=new Map();let invalid=0;
  for(const product of products)for(const f of product.features||[]){let id;try{id=stationId(f.properties?.stationIdentifier);}catch{invalid++;continue;}if(!validPoint(f.geometry)){invalid++;continue;}const [longitude,latitude]=f.geometry.coordinates;
    const matches=areas.filter(a=>a.geometries.some(g=>inReportArea(g.geometry,{latitude,longitude})===true));if(!matches.length)continue;
    found.set(id,{id,name:String(f.properties.name||id),latitude,longitude,matching_messages:matches.map(a=>({message_id:a.message_id,revision:a.revision,coverage:a.kind})),inventory_revision:product.revision,inventory_checked_at:product.checked_at});
  }const rank=id=>/^[A-Z]{4}$/.test(id)?0:1,sorted=[...found.values()].sort((a,b)=>rank(a.id)-rank(b.id)||a.id.localeCompare(b.id));return {stations:sorted.slice(0,25),stations_omitted:Math.max(0,sorted.length-25),invalid_station_records:invalid};
}
export function matchEventObservations({scope,areas,collection,station,asOf}){
  station=stationId(station);const groups=new Map(),excluded={invalid_record:0,future:0,outside_time:0,outside_area:0,unknown_geometry:0,conflicting_location:0},rows=[];
  for(const f of collection.features||[]){const p=f?.properties,at=instant(p?.timestamp);if(f?.type!=='Feature'||typeof f.id!=='string'||p?.station!=='https://api.weather.gov/stations/'+station||!Number.isFinite(at)){excluded.invalid_record++;continue;}if(at>asOf){excluded.future++;continue;}
    if(!groups.has(at))groups.set(at,[]);groups.get(at).push(f);
  }
  for(const [at,features] of groups){const windows=scope.windows.filter(w=>at>=instant(w.start)&&at<instant(w.end));if(!windows.length){excluded.outside_time++;continue;}
    if(features.some(f=>!validPoint(f.geometry))){excluded.unknown_geometry++;continue;}
    const locations=new Set(features.map(f=>JSON.stringify(f.geometry.coordinates.slice(0,2))));if(locations.size!==1){excluded.conflicting_location++;continue;}
    const [longitude,latitude]=features[0].geometry.coordinates,links=[];let unknown=false;
    for(const w of windows){const area=areas.find(a=>a.message_id===w.message_id&&a.revision===w.revision);if(!area||!area.complete)unknown=true;const boundaries=area?.geometries.filter(g=>inReportArea(g.geometry,{latitude,longitude})===true)||[];if(boundaries.length)links.push({message_id:w.message_id,revision:w.revision,event:w.event,start:w.start,end:w.end,coverage:area.kind,boundaries:boundaries.map(({geometry,...provenance})=>provenance)});}
    if(!links.length){excluded[unknown?'unknown_geometry':'outside_area']++;continue;}
    const values={};for(const [key,field,kind,unit] of metrics){const eligible=features.map(f=>({id:f.id,value:quantity(f.properties[field],kind),qc:f.properties[field]?.qualityControl})).filter(v=>v.value!==null&&['V','G'].includes(v.qc)),distinct=new Set(eligible.map(v=>Math.round(v.value*1e6)/1e6));
      values[key]={value:distinct.size===1?eligible[0].value:null,unit,quality:[...new Set(eligible.map(v=>v.qc))],source_ids:eligible.map(v=>v.id),excluded:distinct.size>1?'Conflicting readings at this timestamp':!eligible.length?'Missing, unsupported units or quality not V/G':null};
    }
    rows.push({at:new Date(at).toISOString(),station,latitude,longitude,source_ids:features.map(f=>f.id),values,links});
  }
  rows.sort((a,b)=>a.at.localeCompare(b.at));const summary={};for(const [key,,,unit] of metrics){const good=rows.filter(r=>r.values[key].value!==null);summary[key]={unit,count:good.length,min:good.length?Math.min(...good.map(r=>r.values[key].value)):null,max:good.length?Math.max(...good.map(r=>r.values[key].value)):null,max_at:good.length?good.reduce((a,b)=>b.values[key].value>a.values[key].value?b:a).at:null,min_at:good.length?good.reduce((a,b)=>b.values[key].value<a.values[key].value?b:a).at:null,first_at:good[0]?.at||null,last_at:good.at(-1)?.at||null};}
  return {rows:rows.slice(0,600),rows_omitted:Math.max(0,rows.length-600),matched_timestamps:rows.length,usable_timestamps:rows.filter(r=>Object.values(r.values).some(v=>v.value!==null)).length,summary,excluded};
}
