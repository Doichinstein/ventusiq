import {inReportArea} from '../public/event-reports-core.mjs';
export async function eventAreas(weather,windows,{historical=false,cutoff,deadline=AbortSignal.timeout(40000)}={}){
    const zoneCache=new Map(),areas=[];let zoneCount=0;
    for(const w of windows){const geometries=[],missing=[];let kind='Alert polygon';
      if(w.feature.geometry){if(inReportArea(w.feature.geometry,{longitude:0,latitude:0})===null)missing.push('Invalid alert polygon');else geometries.push({geometry:w.feature.geometry,source_url:w.feature.id,revision:w.revision,checked_at:w.collected_at});}
      else{kind='Official zone coverage';const zones=w.feature.properties.affectedZones||[];if(!zones.length)missing.push('No source geometry or zones');
        for(const url of zones){if(!/^https:\/\/api\.weather\.gov\/zones\/(county|forecast|fire|coastal|offshore)\/\w{6}$/.test(url)){missing.push('Invalid zone URL');continue;}
          if(!zoneCache.has(url)){if(zoneCount>=30){missing.push('Zone lookup limit');continue;}zoneCount++;const key=url.slice('https://api.weather.gov'.length);try{let data;if(historical)data=await weather.read(key,Math.floor(cutoff/1000)-1);else data=await weather.collect(key,30*86400,async signal=>{const raw=await weather.source(url,AbortSignal.any([signal,deadline]));if(!raw.geometry)throw Error('No official geometry');return raw;});zoneCache.set(url,data);}catch{zoneCache.set(url,null);}}
          const data=zoneCache.get(url);if(!data||data.error||inReportArea(data.data.geometry,{longitude:0,latitude:0})===null){missing.push(url);continue;}geometries.push({geometry:data.data.geometry,source_url:url,revision:data.revision,checked_at:data.checked_at});
        }
      }areas.push({message_id:w.message_id,revision:w.revision,kind,geometries,missing,complete:missing.length===0});
    }
  return areas;
}
