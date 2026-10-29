import {leadChoices,compareLeadGroups,verificationObservations} from '../public/verification-leads.mjs';
import {NWS,pointKey,iso} from './weather-service.mjs';
import {unpack} from './archive-codec.mjs';
import {stationId,nearbyStations,verificationHours,forecastChoices,compareTemperatures} from '../public/observations-core.mjs';
function collection(data){if(data?.type!=='FeatureCollection'||!Array.isArray(data.features))throw Error('Invalid station collection');return data;}
export class ObservationsService{
  constructor(weather){this.weather=weather;}
  async near(lat,lon){
    const point=pointKey(lat,lon),result=await this.weather.collect('observations/near/'+point,86400,async signal=>{
      const metadata=await this.weather.source(NWS+'/points/'+point,signal),url=metadata.properties?.observationStations;
      if(!/^https:\/\/api\.weather\.gov\/gridpoints\/[^/]+\/[^/]+\/stations$/.test(url||''))throw Error('Observation stations unavailable for this point');
      // NWS supplies candidates for the forecast grid. Re-sort by the actual saved point.
      const raw=collection(await this.weather.source(url+'?limit=500',signal));
      return {stations:nearbyStations(raw,Number(lat),Number(lon)),source_url:url,raw,coverage:'Up to ten NWS-listed stations within 50 km; not a complete station inventory'};
    });
    const {raw,...data}=result.data;return {...data,point,checked_at:result.checked_at,revision:result.revision,stale:result.stale,error:result.error};
  }
  async station(value,deadline=null){
    const id=stationId(value),result=await this.weather.collect('observations/station/'+id,1800,async signal=>{
      const now=this.weather.clock(),start=iso(now-7*86400),end=iso(now),base=NWS+'/stations/'+id+'/observations';
      let url=base+'?limit=500&start='+encodeURIComponent(start)+'&end='+encodeURIComponent(end),pages=0,truncated=false;
      const seen=new Set(),features=new Map();
      while(url){
        const parsed=new URL(url);if(parsed.origin!==NWS||parsed.pathname!=='/stations/'+id+'/observations'||seen.has(url))throw Error('Invalid observation pagination');
        seen.add(url);parsed.searchParams.set('start',start);parsed.searchParams.set('end',end);parsed.searchParams.set('limit','500');const data=collection(await this.weather.source(parsed.href,deadline?AbortSignal.any([signal,deadline]):signal));pages++;
        for(const f of data.features){const p=f.properties,at=Date.parse(p?.timestamp);if(f?.type!=='Feature'||typeof f.id!=='string'||p?.station!==NWS+'/stations/'+id||!Number.isFinite(at))throw Error('Invalid observation record');if(at>=Date.parse(start)&&at<=now*1000)features.set(f.id,f);}
        url=data.pagination?.next||null;
        if(!data.features.length)url=null;
        if(pages>=6&&url){truncated=true;break;}
      }
      return {type:'FeatureCollection',features:[...features.values()],station:id,source_url:base,window_start:start,window_end:end,truncated};
    });
    return {...result.data,revision:result.revision,collected_at:result.collected_at,checked_at:result.checked_at,stale:result.stale,error:result.error};
  }
  async verification(lat,lon,value){
    const point=pointKey(lat,lon),id=stationId(value),near=await this.near(lat,lon),station=near.stations.find(s=>s.id===id);
    if(!station)throw Error('Invalid station for this location');
    const sample=await this.station(id),now=this.weather.clock()*1000,targets=verificationHours(now);
    const checks=await this.weather.statement('SELECT at,revision FROM checks WHERE dataset=? AND at>=? ORDER BY at LIMIT 2001','forecast/'+point,Math.floor(now/1000)-10*86400).all();
    if(checks.results.length>2000)throw Error('Forecast history exceeds the comparison limit');
    const choices=forecastChoices(checks.results,targets),selections=leadChoices(checks.results,targets),ids=[...new Set([...choices,...selections.flatMap(s=>s.choices)].map(c=>c.check.revision))],forecasts=new Map();
    const needed=new Map();for(const choice of [...choices,...selections.flatMap(s=>s.choices)]){if(!needed.has(choice.check.revision))needed.set(choice.check.revision,new Set());needed.get(choice.check.revision).add(choice.at);}
    // Expand archives in bounded batches and retain only periods used by this evaluation.
    for(let i=0;i<ids.length;i+=32){const rows=await this.weather.statement('SELECT revision,payload FROM revisions WHERE dataset=? AND revision IN (SELECT value FROM json_each(?))','forecast/'+point,JSON.stringify(ids.slice(i,i+32))).all();for(const row of rows.results){const raw=await unpack(row.payload),p=raw.forecast?.properties;forecasts.set(row.revision,{forecast:{properties:{updateTime:p?.updateTime,periods:(p?.periods||[]).filter(period=>needed.get(row.revision).has(Date.parse(period.startTime))).map(period=>({startTime:period.startTime,endTime:period.endTime,temperature:period.temperature,temperatureUnit:period.temperatureUnit}))}}});}}
    const observationAudit=verificationObservations(sample,now),measured=observationAudit.rows;
    return {observation_audit:{time_excluded:observationAudit.time_excluded,conflicting_timestamps:observationAudit.conflicting_timestamps},lead_analysis:compareLeadGroups(targets,selections,forecasts,measured),point,station,generated_at:iso(this.weather.clock()),observation_revision:sample.revision,observation_checked_at:sample.checked_at,stale:sample.stale||near.stale,error:sample.error||near.error,observations_truncated:sample.truncated,...compareTemperatures(targets,choices,forecasts,measured),method:'Latest forecast collected at least 6 hours before each UTC valid hour, with source lead 6–24 hours; closest station temperature within 30 minutes, QC V or G only. Positive bias means forecast warmer than observed. Descriptive sample; no calibrated confidence probability.'};
  }
}
