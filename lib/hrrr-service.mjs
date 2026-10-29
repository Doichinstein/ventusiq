import {smokePoint} from '../public/smoke-core.mjs';
import {loadHrrrCatalog,loadHrrrPoint} from './hrrr-reader.mjs';
export class HrrrService{
  constructor(weather){this.weather=weather;}
  async forecast(lat,lon){const point=smokePoint(lat,lon),name=`hazards/hrrr-point/${point.lat},${point.lon}`;
    await this.weather.statement("INSERT OR IGNORE INTO datasets(name,next_fetch,lease_until) SELECT ?,0,0 WHERE (SELECT COUNT(*) FROM datasets WHERE name LIKE 'hazards/hrrr-point/%')<200",name).run();if(!(await this.weather.state(name)).name)throw Error('Shared HRRR point cache is at capacity');
    const r=await this.weather.collect(name,3600,async signal=>{const now=this.weather.clock(),gate=await this.weather.statement("INSERT INTO datasets(name,next_fetch,lease_until) VALUES ('limits/hrrr/request',?,0) ON CONFLICT(name) DO UPDATE SET next_fetch=excluded.next_fetch WHERE datasets.next_fetch<=? RETURNING name",now+10,now).first();if(!gate)throw Error('HRRR collection is busy. Retry in two minutes.');
      const day=new Date(now*1000).toISOString().slice(0,10),budget=await this.weather.statement('INSERT INTO datasets(name,next_fetch,lease_until) VALUES (?,1,0) ON CONFLICT(name) DO UPDATE SET next_fetch=datasets.next_fetch+1 WHERE datasets.next_fetch<100 RETURNING name','limits/hrrr/day/'+day).first();if(!budget)throw Error('Public HRRR collection budget used for today. Cached points remain available.');await this.weather.statement("DELETE FROM datasets WHERE name LIKE 'limits/hrrr/day/%' AND name<?",'limits/hrrr/day/'+new Date((now-30*86400)*1000).toISOString().slice(0,10)).run();
      const catalog=await this.weather.collect('hazards/hrrr-catalog',3600,s=>loadHrrrCatalog(this.weather.fetcher,s,now*1000));if(catalog.stale||catalog.error)throw Error(catalog.error||'HRRR catalog delayed');return loadHrrrPoint(point,catalog.data,this.weather.fetcher,signal);
    });return {...r.data,revision:r.revision,checked_at:r.checked_at,collected_at:r.collected_at,stale:r.stale,error:r.error};
  }
}
