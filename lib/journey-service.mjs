import {journeyStops} from '../public/journey-stops.mjs';
import {pointKey} from './weather-service.mjs';
import {normalizeRoute,sampleRoute} from '../public/journey-core.mjs';
export const ROUTER='https://router.project-osrm.org';
export class JourneyService{
  constructor(weather){this.weather=weather;}
  async route(fromLat,fromLon,toLat,toLon,via=[]){
    const from=pointKey(fromLat,fromLon),to=pointKey(toLat,toLon),points=[from,...journeyStops(via).map(p=>pointKey(p.lat,p.lon)),to];if(points.some((p,i)=>i&&p===points[i-1]))throw Error('Invalid route: consecutive waypoints must be distinct');const name='routes/'+(via.length?'via-v1/':'')+points.join(';');
    if(!(await this.weather.state(name)).name){const count=await this.weather.statement("SELECT COUNT(*) AS n FROM datasets WHERE name LIKE 'routes/%'").first();if(count.n>=500)throw Error('Shared route cache is at capacity. Try an existing route.');}
    const result=await this.weather.collect(name,86400,async signal=>{
      const now=this.weather.clock();
      // Shared atomic rate gate: two integer clock seconds guarantee at least one real second.
      const admitted=await this.weather.statement("INSERT INTO datasets(name,next_fetch,lease_until) VALUES ('routing/osrm-limit',?,0) ON CONFLICT(name) DO UPDATE SET next_fetch=excluded.next_fetch WHERE datasets.next_fetch<=? RETURNING name",now+2,now).first();
      if(!admitted)throw Error('Routing is busy. Please retry in two minutes.');
      const coordinate=point=>point.split(',').reverse().join(','),url=ROUTER+'/route/v1/driving/'+points.map(coordinate).join(';')+'?overview=full&geometries=geojson&annotations=duration,distance&steps=false&alternatives=false&generate_hints=false&radiuses='+points.map(()=>'1000').join(';');
      const response=await this.weather.fetcher(url,{signal,headers:{Accept:'application/json','User-Agent':'VentusIQ-OpenWeather/0.2 (https://github.com/Doichinstein/ventusiq)'}});if(!response.ok)throw Error('Routing returned HTTP '+response.status);const raw=await response.json();if(raw.code!=='Ok')throw Error('No road route was returned for these endpoints');const route=normalizeRoute(raw);if(route.waypoints.length!==points.length)throw Error('Route waypoint count does not match request');
      return {...route,sampling:sampleRoute(route),source_url:url,provider:'OSRM / FOSSGIS',data_source:'OpenStreetMap',raw};
    });
    const {raw,...route}=result.data;return {...route,revision:result.revision,checked_at:result.checked_at,stale:result.stale,error:result.error};
  }
}
