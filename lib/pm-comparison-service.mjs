import {HazardsService} from './hazards-service.mjs';
import {AirTrendsService} from './air-trends-service.mjs';
import {AirForecastService} from './air-forecast-service.mjs';
import {airPoint} from '../public/air-forecast-core.mjs';
import {monitorId} from '../public/air-trends-core.mjs';
import {nearest} from '../public/hazards-core.mjs';
import {comparisonTargets,pendingComparisonTargets,comparisonChoices,comparePM} from '../public/pm-comparison-core.mjs';
import {unpack} from './archive-codec.mjs';
export class PMComparisonService{
  constructor(weather){this.weather=weather;}
  async comparison(lat,lon,value){const point=airPoint(lat,lon),place={lat:Number(lat),lon:Number(lon)},id=monitorId(value),w=this.weather,discovery=await new HazardsService(w).get('air'),monitor=nearest(discovery.features.filter(f=>String(f.id)===id),place,{limit:1,maxKm:50})[0];if(!monitor)throw Error('Invalid monitor for this place: select a listed site within 50 km');
    const observations=await new AirTrendsService(w).history(id);let latest=null,collectionError=null;try{latest=await new AirForecastService(w).forecast(lat,lon);}catch(e){collectionError=e.message;}
    const now=w.clock()*1000,targets=comparisonTargets(now),name='hazards/air-forecast/cams-global/'+point.key,rows=await w.statement('SELECT at,revision FROM checks WHERE dataset=? AND at>=? AND at<=? ORDER BY at LIMIT 2001',name,Math.floor((targets[0]-24*3600000)/1000),Math.floor(now/1000)).all();if(rows.results.length>2000)throw Error('Particulate archive exceeds the comparison scan limit');
    const choices=comparisonChoices(rows.results,targets),pending=comparisonChoices(rows.results,pendingComparisonTargets(now)),ids=[...new Set([...choices,...pending].filter(c=>c.check).map(c=>c.check.revision))],forecasts=new Map();if(ids.length){const sourceRows=await w.statement('SELECT revision,payload FROM revisions WHERE dataset=? AND revision IN (SELECT value FROM json_each(?))',name,JSON.stringify(ids)).all();for(const r of sourceRows.results)forecasts.set(r.revision,await unpack(r.payload));}
    const baselineEditions=new Map();for(const at of [...new Set(choices.filter(c=>c.check).map(c=>c.check.at))]){const r=await w.read('hazards/air-history/'+id,at-1);if(r)baselineEditions.set(at,{...r.data,revision:r.revision,checked_at:r.checked_at,collected_at:r.collected_at});}
    const result=comparePM({place,monitor,observations,checks:rows.results,forecasts,baselineEditions,now});return {...result,discovery:{revision:discovery.revision,checked_at:discovery.checked_at,stale:discovery.stale,error:discovery.error,source_url:discovery.source_url,selected_feature:monitor},collection:{forecast_revision:latest?.revision||null,forecast_checked_at:latest?.checked_at||null,forecast_error:collectionError||latest?.error||null,observations_delayed:observations.stale||!!observations.error,observations_error:observations.error||null},archive:{retention_days:7,scanned_checks:rows.results.length,scan_limit:2000}};
  }
}
