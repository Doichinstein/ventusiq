import {pointKey} from './weather-service.mjs';
import {forecastStability} from '../public/forecast-stability-core.mjs';
export class ForecastStabilityService{
  constructor(weather){this.weather=weather;}
  async compare(lat,lon,hours=24){
    const point=pointKey(lat,lon);hours=Number(hours);if(![6,12,24].includes(hours))throw Error('Invalid forecast comparison window');
    const w=this.weather,now=Math.floor(w.clock())*1000,key='forecast/'+point;
    // Read-only: pin both selections to collection cutoffs; never backfill a missing edition.
    const [current,earlier,state]=await Promise.all([w.read(key,now/1000),w.read(key,now/1000-hours*3600),w.state(key)]);
    return forecastStability({point,now,lookback_hours:hours,current:current?{...current,error:state.error||null}:null,earlier});
  }
}
