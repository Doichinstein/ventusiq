import {pointKey} from './weather-service.mjs';
import {normalizeRoute,sampleRoute} from '../public/journey-core.mjs';
export const ROUTER='https://router.project-osrm.org';
export class JourneyService{
  constructor(weather){this.weather=weather;}
  async route(fromLat,fromLon,toLat,toLon){
    const from=pointKey(fromLat,fromLon),to=pointKey(toLat,toLon);if(from===to)throw Error('Invalid route: choose distinct endpoints');const name='routes/'+from+';'+to;
    if(!(await this.weather.state(name)).name){const count=await this.weather.statement("SELECT COUNT(*) AS n FROM datasets WHERE name LIKE 'routes/%'").first();if(count.n>=500)throw Error('Shared route cache is at capacity. Try an existing route.');}
    const result=await this.weather.collect(name,86400,async signal=>{
      const now=this.weather.clock();
      // Shared atomic rate gate: two integer clock seconds guarantee at least one real second.
      const admitted=await this.weather.statement("INSERT INTO datasets(name,next_fetch,lease_until) VALUES ('routing/osrm-limit',?,0) ON CONFLICT(name) DO UPDATE SET next_fetch=excluded.next_fetch WHERE datasets.next_fetch<=? RETURNING name",now+2,now).first();
      if(!admitted)throw Error('Routing is busy. Please retry in two minutes.');
      const coordinate=point=>point.split(',').reverse().join(','),url=ROUTER+'/route/v1/driving/'+coordinate(from)+';'+coordinate(to)+'?overview=full&geometries=geojson&annotations=duration,distance&steps=false&alternatives=false&generate_hints=false&radiuses=1000;1000';
      const response=await this.weather.fetcher(url,{signal,headers:{Accept:'application/json','User-Agent':'VentusIQ-OpenWeather/0.2 (https://github.com/Doichinstein/weather-commons)'}});if(!response.ok)throw Error('Routing returned HTTP '+response.status);const raw=await response.json();if(raw.code!=='Ok')throw Error('No road route was returned for these endpoints');const route=normalizeRoute(raw);
      return {...route,sampling:sampleRoute(route),source_url:url,provider:'OSRM / FOSSGIS',data_source:'OpenStreetMap',raw};
    });
    const {raw,...route}=result.data;return {...route,revision:result.revision,checked_at:result.checked_at,stale:result.stale,error:result.error};
  }
}
