import {airPoint,loadAirForecast,AIR_FORECAST_METHOD} from '../public/air-forecast-core.mjs';
const GATE='limits/air-forecast/request';
function retryTime(value,now){
  const header=typeof value==='string'?value.trim():'';
  const at=/^\d+$/.test(header)?now+Number(header):/[A-Za-z]{3}/.test(header)?Date.parse(header)/1000:NaN;
  return Number.isFinite(at)&&Number.isFinite(new Date(at*1000).getTime())?Math.max(now+120,Math.ceil(at)):now+900;
}
const cooldownMessage=at=>'Air forecast provider is temporarily limiting requests. Shared collection is paused until '+new Date(at*1000).toISOString()+'. Cached forecasts remain available; freshness is shown separately.';
export class AirForecastService{
  constructor(weather){this.weather=weather;}
  async forecast(lat,lon){
    const point=airPoint(lat,lon),w=this.weather,name='hazards/air-forecast/cams-global/'+point.key;
    await w.statement("INSERT OR IGNORE INTO datasets(name,next_fetch,lease_until) SELECT ?,0,0 WHERE (SELECT COUNT(*) FROM datasets WHERE name LIKE 'hazards/air-forecast/cams-global/%')<200",name).run();
    if(!(await w.state(name)).name)throw Error('Shared air forecast cache is at capacity. Try a previously collected point.');
    const cached=await w.read(name);
    if(cached&&cached.data.method!==AIR_FORECAST_METHOD&&!cached.error)await w.statement('UPDATE datasets SET next_fetch=MIN(next_fetch,?) WHERE name=? AND revision=? AND error IS NULL',w.clock(),name,cached.revision).run();
    const result=await w.collect(name,3600,async signal=>{
      const now=w.clock(),day=new Date(now*1000).toISOString().slice(0,10);
      const gate=await w.statement('INSERT INTO datasets(name,next_fetch,lease_until) VALUES (?, ?,0) ON CONFLICT(name) DO UPDATE SET next_fetch=excluded.next_fetch,error=NULL WHERE datasets.next_fetch<=? RETURNING name',GATE,now+5,now).first();
      if(!gate){const state=await w.state(GATE);throw Error(state.error||'Air forecast collection is busy. Retry in two minutes.');}
      const budget=await w.statement('INSERT INTO datasets(name,next_fetch,lease_until) VALUES (?,1,0) ON CONFLICT(name) DO UPDATE SET next_fetch=datasets.next_fetch+1 WHERE datasets.next_fetch<1000 RETURNING next_fetch','limits/air-forecast/day/'+day).first();
      if(!budget)throw Error('Today’s public air forecast budget is used. Cached points remain available.');
      await w.statement("DELETE FROM datasets WHERE name LIKE 'limits/air-forecast/day/%' AND name<?",'limits/air-forecast/day/'+new Date((now-30*86400)*1000).toISOString().slice(0,10)).run();
      try{return await loadAirForecast(point,w.fetcher,signal);}
      catch(error){
        if(error.status===429){
          const until=retryTime(error.retryAfter,w.clock());
          // An older in-flight failure must never shorten a newer shared cooldown.
          await w.statement('UPDATE datasets SET next_fetch=MAX(next_fetch,?),error=? WHERE name=? AND next_fetch<=?',until,cooldownMessage(until),GATE,until).run();
          const state=await w.state(GATE);
          throw Error(state.error||cooldownMessage(until));
        }
        throw error;
      }
    });
    return {...result.data,revision:result.revision,checked_at:result.checked_at,collected_at:result.collected_at,stale:result.stale,error:result.error};
  }
}
