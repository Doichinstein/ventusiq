import {gridPoint,historyWindow,normalizeHistory} from '../public/analogs-core.mjs';
export const POWER='https://power.larc.nasa.gov/api/temporal/daily/point';
export class AnalogsService{
  constructor(weather){this.weather=weather;}
  async history(lat,lon){
    const grid=gridPoint(lat,lon),window=historyWindow(this.weather.clock()*1000),name=`history/power/${grid.key}/${window.start}/${window.end}`;
    if(!(await this.weather.state(name)).name){const count=await this.weather.statement("SELECT COUNT(*) AS n FROM datasets WHERE name LIKE 'history/power/%'").first();if(count.n>=250)throw Error('Shared history cache is at capacity. Try an existing location.');}
    const result=await this.weather.collect(name,14*86400,async signal=>{
      const now=this.weather.clock();const admitted=await this.weather.statement("INSERT INTO datasets(name,next_fetch,lease_until) VALUES ('history/power-limit',?,0) ON CONFLICT(name) DO UPDATE SET next_fetch=excluded.next_fetch WHERE datasets.next_fetch<=? RETURNING name",now+6,now).first();
      if(!admitted)throw Error('History collection is busy. Please retry in two minutes.');
      const url=POWER+'?'+new URLSearchParams({parameters:'T2M_MAX,T2M_MIN,WS10M,PRECTOTCORR',community:'RE',latitude:String(grid.lat),longitude:String(grid.lon),start:window.start.replaceAll('-',''),end:window.end.replaceAll('-',''),'time-standard':'UTC',format:'JSON'});
      const response=await this.weather.fetcher(url,{signal,redirect:'manual',headers:{Accept:'application/json','User-Agent':'VentusIQ-OpenWeather (https://github.com/Doichinstein/ventusiq)'}});if(!response.ok)throw Error('NASA history returned HTTP '+response.status);
      const text=await response.text();if(text.length>2000000)throw Error('NASA history response exceeds size limit');const raw=JSON.parse(text);normalizeHistory(raw,window,grid);
      return {raw,grid,window,source_url:url,provider:'NASA POWER / MERRA-2',kind:'reanalysis'};
    });
    return {...normalizeHistory(result.data.raw,result.data.window,result.data.grid),provider:result.data.provider,kind:result.data.kind,source_url:result.data.source_url,revision:result.revision,collected_at:result.collected_at,checked_at:result.checked_at,issued_at:null,stale:result.stale,error:result.error};
  }
}
