import {pointKey} from './weather-service.mjs';
import {forecastStability,PREVIOUS_VERSION_DAYS} from '../public/forecast-stability-core.mjs';
export class ForecastStabilityService{
  constructor(weather){this.weather=weather;}
  /** @param {number|string} hours Fixed lookback hours, or 'previous'. */
  async compare(lat,lon,hours=24){
    const point=pointKey(lat,lon),previous=hours==='previous';hours=previous?null:Number(hours);if(!previous&&![6,12,24].includes(hours))throw Error('Invalid forecast comparison window');
    const w=this.weather,now=Math.floor(w.clock())*1000,key='forecast/'+point;
    // Read-only: pin both selections to collection cutoffs; never backfill a missing edition.
    const [current,state]=await Promise.all([w.read(key,now/1000),w.state(key)]);
    let earlier=null;
    if(previous&&current){
      // A repeated check of the current body is not a different archived version.
      // Select by collection order, including genuine upstream rollbacks.
      const row=await w.statement('SELECT c.at,c.revision FROM checks c JOIN revisions r ON r.dataset=c.dataset AND r.revision=c.revision WHERE c.dataset=? AND c.at<? AND c.at>=? AND c.revision<>? ORDER BY c.at DESC LIMIT 1',key,Date.parse(current.checked_at)/1000,now/1000-PREVIOUS_VERSION_DAYS*86400,current.revision).first();
      if(row){const selected=await w.read(key,row.at);if(selected?.revision===row.revision)earlier=selected;}
    }else if(!previous)earlier=await w.read(key,now/1000-hours*3600);
    return forecastStability({point,now,lookback_hours:hours,comparison_mode:previous?'previous_version':'cutoff',current:current?{...current,error:state.error||null}:null,earlier});
  }
}
