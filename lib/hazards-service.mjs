import {loadFires,loadAir,loadAqiContours,loadPerimeters,loadSatellite,incidentId} from '../public/hazards-core.mjs';
export class HazardsService{
  constructor(weather){this.weather=weather;}
  /** @param {string} kind @param {string|null} [id] */
  async get(kind,id=null){
    const providers={fires:[loadFires,900,'hazards/fires'],air:[loadAir,900,'hazards/air'],aqi:[loadAqiContours,900,'hazards/aqi-contours'],satellite:[loadSatellite,3600,'hazards/satellite']};
    let loader,interval,key;
    if(kind==='perimeters'){id=incidentId(id);loader=(fetcher,signal)=>loadPerimeters(id,fetcher,signal);interval=1800;key='hazards/perimeter/'+id;}
    else if(providers[kind]) [loader,interval,key]=providers[kind];
    else throw new Error('Unknown hazard product');
    const result=await this.weather.collect(key,interval,signal=>loader(this.weather.fetcher,signal));
    return {...result.data,collected_at:result.collected_at,checked_at:result.checked_at,stale:result.stale,error:result.error,revision:result.revision};
  }
}
