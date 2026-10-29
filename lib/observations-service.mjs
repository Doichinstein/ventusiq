import {NWS,pointKey,iso} from './weather-service.mjs';
import {unpack} from './archive-codec.mjs';
import {stationId,nearbyStations,observations,verificationHours,forecastChoices,compareTemperatures} from '../public/observations-core.mjs';
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
    const checks=await this.weather.statement('SELECT at,revision FROM checks WHERE dataset=? AND at>=? ORDER BY at LIMIT 2001','forecast/'+point,Math.floor(now/1000)-8*86400).all();
    if(checks.results.length>2000)throw Error('Forecast history exceeds the comparison limit');
    const choices=forecastChoices(checks.results,targets),ids=[...new Set(choices.map(c=>c.check.revision))],forecasts=new Map();
    if(ids.length){const rows=await this.weather.statement('SELECT revision,payload FROM revisions WHERE dataset=? AND revision IN (SELECT value FROM json_each(?))','forecast/'+point,JSON.stringify(ids)).all();for(const row of rows.results)forecasts.set(row.revision,await unpack(row.payload));}
    return {point,station,generated_at:iso(this.weather.clock()),observation_revision:sample.revision,observation_checked_at:sample.checked_at,stale:sample.stale||near.stale,error:sample.error||near.error,observations_truncated:sample.truncated,...compareTemperatures(targets,choices,forecasts,observations(sample,now)),method:'Latest forecast collected at least 6 hours before each UTC valid hour, with source lead 6–24 hours; closest station temperature within 30 minutes, QC V or G only. Positive bias means forecast warmer than observed. Descriptive sample; no calibrated confidence probability.'};
  }
}
