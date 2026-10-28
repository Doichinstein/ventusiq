import {riverRegion,loadRiverRegion,gaugeId,loadGauge} from '../public/rivers-core.mjs';
export class RiversService{
  constructor(weather){this.weather=weather;}
  async near(lat,lon){const region=riverRegion(lat,lon);return this.collect('hazards/rivers/near/'+region.key,signal=>loadRiverRegion(region,this.weather.fetcher,signal));}
  async gauge(id){id=gaugeId(id);return this.collect('hazards/rivers/gauge/'+id,signal=>loadGauge(id,this.weather.fetcher,signal));}
  async collect(key,loader){const result=await this.weather.collect(key,900,loader);return {...result.data,collected_at:result.collected_at,checked_at:result.checked_at,stale:result.stale,error:result.error,revision:result.revision};}
}
