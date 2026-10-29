import {ensemblePoint,ensembleURL,validateEnsemble,ENSEMBLE_METHOD,ENSEMBLE_MODEL} from '../public/ensemble-core.mjs';
export class EnsembleService{
  constructor(weather){this.weather=weather;}
  async forecast(lat,lon){const point=ensemblePoint(lat,lon),name='hazards/ensemble/gfs025/'+point.key;
    await this.weather.statement("INSERT OR IGNORE INTO datasets(name,next_fetch,lease_until) SELECT ?,0,0 WHERE (SELECT COUNT(*) FROM datasets WHERE name LIKE 'hazards/ensemble/gfs025/%')<200",name).run();
    if(!(await this.weather.state(name)).name)throw Error('Shared ensemble cache is at capacity. Try a previously collected cell.');
    const result=await this.weather.collect(name,6*3600,async signal=>{
      const now=this.weather.clock(),day=new Date(now*1000).toISOString().slice(0,10),gate=await this.weather.statement("INSERT INTO datasets(name,next_fetch,lease_until) VALUES ('limits/ensemble/request',?,0) ON CONFLICT(name) DO UPDATE SET next_fetch=excluded.next_fetch WHERE datasets.next_fetch<=? RETURNING name",now+10,now).first();if(!gate)throw Error('Ensemble collection is busy. Retry in two minutes.');
      const budget=await this.weather.statement('INSERT INTO datasets(name,next_fetch,lease_until) VALUES (?,1,0) ON CONFLICT(name) DO UPDATE SET next_fetch=datasets.next_fetch+1 WHERE datasets.next_fetch<400 RETURNING next_fetch','limits/ensemble/day/'+day).first();if(!budget)throw Error('The public ensemble collection budget is used for today. Existing cached cells remain available.');
      await this.weather.statement("DELETE FROM datasets WHERE name LIKE 'limits/ensemble/day/%' AND name<?",'limits/ensemble/day/'+new Date((now-30*86400)*1000).toISOString().slice(0,10)).run();
      const source_url=ensembleURL(point),response=await this.weather.fetcher(source_url,{signal,redirect:'manual',headers:{Accept:'application/json'}});if(!response.ok)throw Error('Ensemble provider returned HTTP '+response.status);
      const reader=response.body?.getReader();if(!reader)throw Error('Ensemble response is empty');const decoder=new TextDecoder();let text='',length=0;for(;;){const {done,value}=await reader.read();if(done)break;length+=value.length;if(length>2000000){await reader.cancel();throw Error('Ensemble response exceeds the size limit');}text+=decoder.decode(value,{stream:true});}text+=decoder.decode();const raw=JSON.parse(text);validateEnsemble(raw,point);
      return {method:ENSEMBLE_METHOD,model:ENSEMBLE_MODEL,point,raw,source_url,provider:'NOAA GEFS via Open-Meteo',issued_at:null,expected_members:31,attribution:{provider:'https://open-meteo.com/',license:'https://creativecommons.org/licenses/by/4.0/',changes:'Grid selection, three-hour sampling, empirical quantiles and threshold member counts'},processing:'Provider hourly interpolation; elevation downscaling disabled; nearest grid cell requested. No model initialization timestamp is supplied.'};
    });return {...result.data,revision:result.revision,checked_at:result.checked_at,collected_at:result.collected_at,stale:result.stale,error:result.error};
  }
}
