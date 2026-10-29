import {historyWindow} from '../public/analogs-core.mjs';
import {stationTemperatures,STATION_ANALOG_METHOD} from '../public/station-analogs-core.mjs';
import {STATION_DATA,StationInputError,catalogStations,stationText} from '../public/station-history-core.mjs';
import {StationHistoryService} from './station-history-service.mjs';
export class StationAnalogsService{
  constructor(weather){this.weather=weather;}
  async history(id){
    const w=this.weather;if(typeof id!=='string'||!/^\d{11}$/.test(id))throw new StationInputError('Choose a listed US station');
    const catalog=await new StationHistoryService(w).catalog(),station=catalogStations(catalog.raw_us_rows).stations.find(s=>s.id===id),window=historyWindow(w.clock()*1000);
    if(!station)throw new StationInputError('Choose a listed US station');if(station.end<window.start||station.begin>window.end)throw new StationInputError('Station catalog does not overlap the history window');
    const key=`hazards/station-temperature/${id}/${window.start}/${window.end}`;
    await w.statement("INSERT OR IGNORE INTO datasets(name,next_fetch,lease_until) SELECT ?,0,0 WHERE (SELECT COUNT(*) FROM datasets WHERE name LIKE 'hazards/station-temperature/%')<128",key).run();if(!(await w.state(key)).name)throw Error('Station temperature archive is full; existing stations remain available');
    const r=await w.collect(key,14*86400,async signal=>{
      const now=w.clock(),day=new Date(now*1000).toISOString().slice(0,10);
      const gate=await w.statement("INSERT INTO datasets(name,next_fetch,lease_until) VALUES ('limits/station-history/request',?,0) ON CONFLICT(name) DO UPDATE SET next_fetch=excluded.next_fetch WHERE datasets.next_fetch<=? RETURNING name",now+2,now).first();if(!gate)throw Error('Station archive is busy; retry in two minutes');
      const budget=await w.statement('INSERT INTO datasets(name,next_fetch,lease_until) VALUES (?,1,0) ON CONFLICT(name) DO UPDATE SET next_fetch=datasets.next_fetch+1 WHERE datasets.next_fetch<50 RETURNING name','limits/station-temperature/day/'+day).first();if(!budget)throw Error('Daily station-temperature request budget is used');
      await w.statement("DELETE FROM datasets WHERE name LIKE 'limits/station-temperature/day/%' AND name<?",'limits/station-temperature/day/'+new Date((now-30*86400)*1000).toISOString().slice(0,10)).run();
      const url=STATION_DATA+'?'+new URLSearchParams({dataset:'global-summary-of-the-day',stations:id,startDate:window.start,endDate:window.end,dataTypes:'TEMP',format:'json',includeAttributes:'true',includeStationLocation:'true'}),raw=JSON.parse(await stationText(url,2*1024*1024,w.fetcher,signal));
      return {method:STATION_ANALOG_METHOD,station,window,raw,...stationTemperatures(raw,station,window),source_url:url,issued_at:null,raw_units:'degrees Fahrenheit',normalized_units:'degrees Celsius'};
    });return {...r.data,revision:r.revision,collected_at:r.collected_at,checked_at:r.checked_at,stale:r.stale,error:r.error,catalog:{revision:catalog.revision,checked_at:catalog.checked_at,stale:catalog.stale,error:catalog.error,source_url:catalog.source_url}};
  }
}
