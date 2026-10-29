import {smokePoint,loadSmokeCatalog,loadSmokePoint} from '../public/smoke-core.mjs';
export class SmokeService{
  constructor(weather){this.weather=weather;}
  async catalog(){const result=await this.weather.collect('hazards/smoke-catalog',3600,s=>loadSmokeCatalog(this.weather.fetcher,s));return {...result.data,revision:result.revision,checked_at:result.checked_at,collected_at:result.collected_at,stale:result.stale,error:result.error};}
  async forecast(lat,lon){
    const point=smokePoint(lat,lon),key=`hazards/smoke-point/${point.lat},${point.lon}`;
    if(!(await this.weather.state(key)).name){await this.weather.statement("INSERT INTO datasets(name) SELECT ? WHERE (SELECT COUNT(*) FROM datasets WHERE name LIKE 'hazards/smoke-point/%')<500 ON CONFLICT(name) DO NOTHING",key).run();if(!(await this.weather.state(key)).name)throw Error('Shared smoke cache is at capacity. Try a previously collected place.');}
    const result=await this.weather.collect(key,3600,async signal=>{
      const catalog=await this.weather.collect('hazards/smoke-catalog',3600,s=>loadSmokeCatalog(this.weather.fetcher,s));
      if(catalog.stale||catalog.error)throw Error(catalog.error||'Smoke catalog updates are delayed');
      return loadSmokePoint(point,catalog.data,this.weather.fetcher,signal,this.weather.clock()*1000);
    });
    return {...result.data,revision:result.revision,checked_at:result.checked_at,collected_at:result.collected_at,stale:result.stale,error:result.error};
  }
}
