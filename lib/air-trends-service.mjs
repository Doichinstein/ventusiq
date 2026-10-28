import {HazardsService} from './hazards-service.mjs';
import {monitorId,loadAirHistory} from '../public/air-trends-core.mjs';
export class AirTrendsService{
  constructor(weather){this.weather=weather;}
  async history(value){
    const id=monitorId(value),key='hazards/air-history/'+id;
    const current=await new HazardsService(this.weather).get('air');
    if(!current.features.some(f=>String(f.id)===id))throw Error('Invalid air monitor: not listed in the current measured-monitor feed');
    if(!(await this.weather.state(key)).name){const count=await this.weather.statement("SELECT COUNT(*) AS n FROM datasets WHERE name LIKE 'hazards/air-history/%'").first();if(count.n>=500)throw Error('Shared air history cache is at capacity. Try a previously collected monitor.');}
    const result=await this.weather.collect(key,900,signal=>loadAirHistory(id,this.weather.fetcher,signal));
    return {...result.data,revision:result.revision,collected_at:result.collected_at,checked_at:result.checked_at,stale:result.stale||current.stale,error:result.error||current.error||null};
  }
}
