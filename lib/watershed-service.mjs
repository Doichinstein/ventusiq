import {watershedPoint,loadWatershed} from '../public/watershed-core.mjs';
export class WatershedService{
  constructor(weather){this.weather=weather;}
  async basin(lat,lon){const point=watershedPoint(lat,lon),name='hazards/watersheds/v1/'+point.key;
    await this.weather.statement("INSERT OR IGNORE INTO datasets(name,next_fetch,lease_until) SELECT ?,0,0 WHERE (SELECT COUNT(*) FROM datasets WHERE name LIKE 'hazards/watersheds/v1/%')<200",name).run();
    if(!(await this.weather.state(name)).name)throw Error('Shared watershed cache is at capacity. Try an existing point.');
    const result=await this.weather.collect(name,86400,async signal=>{
      const now=this.weather.clock(),day=new Date(now*1000).toISOString().slice(0,10),gate=await this.weather.statement("INSERT INTO datasets(name,next_fetch,lease_until) VALUES ('limits/watershed/request',?,0) ON CONFLICT(name) DO UPDATE SET next_fetch=excluded.next_fetch WHERE datasets.next_fetch<=? RETURNING name",now+10,now).first();if(!gate)throw Error('Watershed processing is busy. Retry in two minutes.');
      const budget=await this.weather.statement('INSERT INTO datasets(name,next_fetch,lease_until) VALUES (?,1,0) ON CONFLICT(name) DO UPDATE SET next_fetch=datasets.next_fetch+1 WHERE datasets.next_fetch<100 RETURNING next_fetch','limits/watershed/day/'+day).first();if(!budget)throw Error('Today’s public watershed processing budget is used. Cached points remain available.');
      await this.weather.statement("DELETE FROM datasets WHERE name LIKE 'limits/watershed/day/%' AND name<?",'limits/watershed/day/'+new Date((now-30*86400)*1000).toISOString().slice(0,10)).run();
      return loadWatershed(point,this.weather.fetcher,signal);
    });return {...result.data,revision:result.revision,checked_at:result.checked_at,collected_at:result.collected_at,stale:result.stale,error:result.error};
  }
}
