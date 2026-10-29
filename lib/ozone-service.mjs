import {GeosCFService} from './geos-cf-service.mjs';
import {geosCell} from '../public/geos-cf-core.mjs';
import {compareGeosOzone} from '../public/geos-ozone-comparison.mjs';
import {loadOzone,ozoneMonitors,ozoneHistory,ozoneForecastContext} from '../public/ozone-core.mjs';
import {monitorId,HOUR} from '../public/air-trends-core.mjs';
import {airPoint} from '../public/air-forecast-core.mjs';
import {AirForecastService} from './air-forecast-service.mjs';
import {comparisonChoices} from '../public/pm-comparison-core.mjs';
import {unpack} from './archive-codec.mjs';
const envelope=r=>({...r.data,revision:r.revision,checked_at:r.checked_at,collected_at:r.collected_at,stale:r.stale,error:r.error});
export class OzoneService{
  constructor(weather){this.weather=weather;}
  async nasaComparison(trend){
    const w=this.weather,coordinates=trend.monitor.geometry.coordinates,{point}=geosCell(coordinates[1],coordinates[0]);
    let latest=null,error=null;try{latest=await new GeosCFService(w).forecast(coordinates[1],coordinates[0]);}catch(e){error=e.message;}
    const name='hazards/air-forecast/geos-cf/'+point.key,targets=trend.rows.map(r=>Date.parse(r.at));
    const checks=(await w.statement('SELECT at,revision FROM checks WHERE dataset=? AND at>=? AND at<=? ORDER BY at LIMIT 2001',name,Math.floor((targets[0]-24*HOUR)/1000),Math.floor(targets.at(-1)/1000)).all()).results;
    if(checks.length>2000)throw Error('NASA ozone comparison exceeds archive scan limit');
    const ids=[...new Set(comparisonChoices(checks,targets).filter(c=>c.check).map(c=>c.check.revision))],forecasts=new Map();
    if(ids.length){const records=(await w.statement('SELECT revision,payload FROM revisions WHERE dataset=? AND revision IN (SELECT value FROM json_each(?))',name,JSON.stringify(ids)).all()).results;for(const record of records)forecasts.set(record.revision,await unpack(record.payload));}
    return {...compareGeosOzone({trend,checks,forecasts}),collection:{revision:latest?.revision||null,checked_at:latest?.checked_at||null,error:error||latest?.error||null,point,initialized_at:latest?.initialized_at||null,source_url:latest?.source_url||null,earliest_eligible_hour:latest?.checked_at?new Date(Math.ceil((Date.parse(latest.checked_at)+HOUR)/HOUR)*HOUR).toISOString():null},scanned_checks:checks.length,retention_days:7};
  }
  async current(){return envelope(await this.weather.collect('hazards/ozone/current',900,signal=>loadOzone(null,this.weather.fetcher,signal)));}
  async near(lat,lon){airPoint(lat,lon);const place={lat:+lat,lon:+lon},current=await this.current();return {place,monitors:ozoneMonitors(current,place),discovery:{revision:current.revision,checked_at:current.checked_at,stale:current.stale,error:current.error,source_url:current.source_url,updated:current.updated}};}
  async history(lat,lon,value,compare=false,source='cams'){if(!['cams','geos'].includes(source))throw Error('Unsupported ozone comparison source');const id=monitorId(value),w=this.weather,discovery=await this.near(lat,lon),monitor=discovery.monitors.find(m=>m.id===id);if(!monitor)throw Error('Invalid ozone monitor for this place; choose a listed station within 50 km');const key='hazards/ozone/history/'+id;
    await w.statement("INSERT OR IGNORE INTO datasets(name,next_fetch,lease_until) SELECT ?,0,0 WHERE (SELECT COUNT(*) FROM datasets WHERE name LIKE 'hazards/ozone/history/%')<200",key).run();if(!(await w.state(key)).name)throw Error('Shared ozone history cache is full; existing monitors remain available');
    const observations=envelope(await w.collect(key,900,async signal=>{const now=w.clock(),day=new Date(now*1000).toISOString().slice(0,10),gate=await w.statement("INSERT INTO datasets(name,next_fetch,lease_until) VALUES ('limits/ozone/request',?,0) ON CONFLICT(name) DO UPDATE SET next_fetch=excluded.next_fetch WHERE datasets.next_fetch<=? RETURNING name",now+2,now).first();if(!gate)throw Error('Ozone history collection busy; retry in two minutes');const budget=await w.statement('INSERT INTO datasets(name,next_fetch,lease_until) VALUES (?,1,0) ON CONFLICT(name) DO UPDATE SET next_fetch=datasets.next_fetch+1 WHERE datasets.next_fetch<1000 RETURNING name','limits/ozone/day/'+day).first();if(!budget)throw Error('Daily ozone history budget used');await w.statement("DELETE FROM datasets WHERE name LIKE 'limits/ozone/day/%' AND name<?",'limits/ozone/day/'+new Date((now-30*86400)*1000).toISOString().slice(0,10)).run();return loadOzone(id,w.fetcher,signal);}));
    const now=w.clock()*1000,trend=ozoneHistory(observations,monitor,now),result={place:discovery.place,discovery:discovery.discovery,trend,comparison:null};if(!compare)return result;
    if(source==='geos')return {...result,comparison:await this.nasaComparison(trend)};
    let latest=null,error=null;try{latest=await new AirForecastService(w).forecast(lat,lon);}catch(e){error=e.message;}
    const point=airPoint(lat,lon),name='hazards/air-forecast/cams-global/'+point.key,targets=trend.rows.map(r=>Date.parse(r.at)),checks=(await w.statement('SELECT at,revision FROM checks WHERE dataset=? AND at>=? AND at<=? ORDER BY at LIMIT 2001',name,Math.floor((targets[0]-24*HOUR)/1000),Math.floor(targets.at(-1)/1000)).all()).results;if(checks.length>2000)throw Error('Ozone comparison exceeds archive scan limit');const ids=[...new Set(comparisonChoices(checks,targets).filter(c=>c.check).map(c=>c.check.revision))],forecasts=new Map();if(ids.length){const rows=(await w.statement('SELECT revision,payload FROM revisions WHERE dataset=? AND revision IN (SELECT value FROM json_each(?))',name,JSON.stringify(ids)).all()).results;for(const r of rows)forecasts.set(r.revision,await unpack(r.payload));}
    return {...result,comparison:{...ozoneForecastContext({place:discovery.place,trend,checks,forecasts}),collection:{revision:latest?.revision||null,checked_at:latest?.checked_at||null,error:error||latest?.error||null},scanned_checks:checks.length,retention_days:7}};
  }
}
