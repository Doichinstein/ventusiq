import {geosCell} from '../public/geos-cf-core.mjs';
import {loadGeosCF} from './geos-cf-reader.mjs';
export class GeosCFService{
  constructor(weather){this.weather=weather;}
  async forecast(lat,lon){
    const w=this.weather,{point}=geosCell(lat,lon),prefix='hazards/air-forecast/geos-cf/',name=prefix+point.key;
    await w.statement("INSERT OR IGNORE INTO datasets(name,next_fetch,lease_until) SELECT ?,0,0 WHERE (SELECT COUNT(*) FROM datasets WHERE name LIKE ?)<200",name,prefix+'%').run();if(!(await w.state(name)).name)throw Error('Shared NASA forecast cache is at capacity');
    const result=await w.collect(name,3600,async signal=>{
      const now=w.clock(),gate='limits/geos-cf/request',day=new Date(now*1000).toISOString().slice(0,10);
      const claim=await w.statement('INSERT INTO datasets(name,next_fetch,lease_until) VALUES (?,?,0) ON CONFLICT(name) DO UPDATE SET next_fetch=excluded.next_fetch,error=NULL WHERE datasets.next_fetch<=? RETURNING name',gate,now+45,now).first();
      if(!claim)throw Error((await w.state(gate)).error||'NASA forecast collection is busy. Retry in two minutes.');
      const budget=await w.statement('INSERT INTO datasets(name,next_fetch,lease_until) VALUES (?,1,0) ON CONFLICT(name) DO UPDATE SET next_fetch=datasets.next_fetch+1 WHERE datasets.next_fetch<100 RETURNING name','limits/geos-cf/day/'+day).first();if(!budget)throw Error('Public NASA forecast budget used for today. Cached points remain available.');
      await w.statement("DELETE FROM datasets WHERE name LIKE 'limits/geos-cf/day/%' AND name<?",'limits/geos-cf/day/'+new Date((now-30*86400)*1000).toISOString().slice(0,10)).run();
      try{return await loadGeosCF(point.lat,point.lon,w.fetcher,signal,now*1000);}catch(error){if([429,503].includes(error.status)){const retry=String(error.retryAfter||''),at=/^\d+$/.test(retry)?w.clock()+Number(retry):Date.parse(retry)/1000,until=Math.max(w.clock()+900,Number.isFinite(at)&&Number.isFinite(new Date(at*1000).getTime())?at:0);await w.statement('UPDATE datasets SET next_fetch=MAX(next_fetch,?),error=? WHERE name=? AND next_fetch<=?',until,'NASA forecast provider is limiting requests; shared collection is paused until '+new Date(until*1000).toISOString(),gate,until).run();}throw error;}
    });return {...result.data,revision:result.revision,checked_at:result.checked_at,collected_at:result.collected_at,stale:result.stale,error:result.error};
  }
}
