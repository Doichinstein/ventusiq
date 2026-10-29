import {PMComparisonService} from '../../../lib/pm-comparison-service.mjs';
import {AirForecastService} from '../../../lib/air-forecast-service.mjs';
import {WatershedSitesService} from '../../../lib/watershed-sites-service.mjs';
import {GeocodeService,geocodePost} from '../../../lib/geocode-service.mjs';
import {WatershedService} from '../../../lib/watershed-service.mjs';
import {journeyStops} from '../../../public/journey-stops.mjs';
import {HrrrService} from '../../../lib/hrrr-service.mjs';
import {PlacesService} from '../../../lib/places-service.mjs';
import {placesGet,placesPost} from '../../../lib/places-http.mjs';
import {EnsembleService} from '../../../lib/ensemble-service.mjs';
import {EventGaugesService} from '../../../lib/event-gauges-service.mjs';
import { env } from 'cloudflare:workers';
import { after } from 'next/server';
import { getChatGPTUser } from '../../chatgpt-auth';
import { WeatherService, pointKey, iso } from '../../../lib/weather-service.mjs';
import { HazardsService } from '../../../lib/hazards-service.mjs';
import { RiversService } from '../../../lib/rivers-service.mjs';
import { EventsService } from '../../../lib/events-service.mjs';
import { ObservationsService } from '../../../lib/observations-service.mjs';
import { JourneyService } from '../../../lib/journey-service.mjs';
import { AnalogsService } from '../../../lib/analogs-service.mjs';
import { PlanningService } from '../../../lib/planning-service.mjs';
import { AirTrendsService } from '../../../lib/air-trends-service.mjs';
import { SmokeService } from '../../../lib/smoke-service.mjs';
import { EventReportsService } from '../../../lib/event-reports-service.mjs';
import { EventObservationsService } from '../../../lib/event-observations-service.mjs';
import { WatchService } from '../../../lib/watch-service.mjs';
import { PushService } from '../../../lib/push-service.mjs';
import { pushGet,pushPost } from '../../../lib/push-http.mjs';
import { watchGet,watchPost } from '../../../lib/watch-http.mjs';

function pushService(weather:WeatherService){let jwk=null;try{jwk=JSON.parse(env.VENTUSIQ_VAPID_PRIVATE_JWK||'null');}catch{}return new PushService(weather,{jwk});}
async function upkeep(weather:WeatherService,alerts:any){await new WatchService(weather).upkeep(alerts);await pushService(weather).dispatch();}
function json(value:unknown,status=200){return Response.json(value,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});}
function atTime(value:string|null){if(!value||!/(Z|[+-]\d\d:\d\d)$/.test(value)||!Number.isFinite(Date.parse(value)))throw new Error('Archive time requires a valid timezone');return Date.parse(value)/1000;}
export async function GET(request:Request){
  if(!env.DB)return json({error:'Shared database unavailable'},503);
  const url=new URL(request.url),path=url.pathname,service=new WeatherService(env.DB);
  try{
    if(path==='/api/places')return placesGet(new PlacesService(service),(await getChatGPTUser())?.userId||null);
    if(path==='/api/push')return pushGet(pushService(service),(await getChatGPTUser())?.userId||null);
    if(path==='/api/watches')return watchGet(request,new WatchService(service),(await getChatGPTUser())?.userId||null);
    if(path.startsWith('/api/watch-feed/'))return watchGet(request,new WatchService(service),null);
    if(path==='/api/event-gauges'){
      const result=await new EventGaugesService(service).forEvent(url.searchParams.get('id'),url.searchParams.get('gauge'),url.searchParams.has('at')?atTime(url.searchParams.get('at'))*1000:null,url.searchParams.has('alertAt')?atTime(url.searchParams.get('alertAt'))*1000:null);
      return result?json(result):json({error:'No collected event at this time'},404);
    }
    if(path==='/api/event-observations'){
      const result=await new EventObservationsService(service).forEvent(url.searchParams.get('id'),url.searchParams.get('station'),url.searchParams.has('at')?atTime(url.searchParams.get('at'))*1000:null,url.searchParams.has('alertAt')?atTime(url.searchParams.get('alertAt'))*1000:null);
      return result?json(result):json({error:'No collected event at this time'},404);
    }
    if(path==='/api/event-reports'){
      const result=await new EventReportsService(service).forEvent(url.searchParams.get('id'),url.searchParams.has('at')?atTime(url.searchParams.get('at'))*1000:null,url.searchParams.has('alertAt')?atTime(url.searchParams.get('alertAt'))*1000:null);
      return result?json(result):json({error:'No collected event at this time'},404);
    }
    if(path==='/api/air/comparison')return json(await new PMComparisonService(service).comparison(url.searchParams.get('lat'),url.searchParams.get('lon'),url.searchParams.get('id')));
    if(path==='/api/air/forecast')return json(await new AirForecastService(service).forecast(url.searchParams.get('lat'),url.searchParams.get('lon')));
    if(path==='/api/air/history')return json(await new AirTrendsService(service).history(url.searchParams.get('id')));
    if(path==='/api/ensemble')return json(await new EnsembleService(service).forecast(url.searchParams.get('lat'),url.searchParams.get('lon')));
    if(path==='/api/smoke/hrrr')return json(await new HrrrService(service).forecast(url.searchParams.get('lat'),url.searchParams.get('lon')));
    if(path==='/api/smoke/catalog')return json(await new SmokeService(service).catalog());
    if(path==='/api/smoke/forecast')return json(await new SmokeService(service).forecast(url.searchParams.get('lat'),url.searchParams.get('lon')));
    if(path==='/api/planning/grid'){
      try{return json(await new PlanningService(service).grid(url.searchParams.get('lat'),url.searchParams.get('lon')));}
      catch(error){const message=String((error as Error).message);return json({error:message},['Invalid coordinates','Coordinates are required'].includes(message)?400:503);}
    }
    if(path==='/api/history/local'){
      try{return json(await new AnalogsService(service).history(url.searchParams.get('lat'),url.searchParams.get('lon')));}
      catch(error){const message=String((error as Error).message);return json({error:message},message==='Invalid coordinates'?400:503);}
    }
    if(path==='/api/journey/route'){
      let via=[];try{const input=url.searchParams.get('via')||'[]';if(input.length>1000)throw Error();via=journeyStops(JSON.parse(input));}catch{return json({error:'Invalid via points'},400);}
      return json(await new JourneyService(service).route(url.searchParams.get('fromLat'),url.searchParams.get('fromLon'),url.searchParams.get('toLat'),url.searchParams.get('toLon'),via));
    }
    if(path==='/api/observations/near')return json(await new ObservationsService(service).near(url.searchParams.get('lat'),url.searchParams.get('lon')));
    if(path==='/api/observations/station')return json(await new ObservationsService(service).station(url.searchParams.get('id')));
    if(path==='/api/verification')return json(await new ObservationsService(service).verification(url.searchParams.get('lat'),url.searchParams.get('lon'),url.searchParams.get('station'),url.searchParams.get('at')));
    if(path==='/api/events')return json(await new EventsService(service).list(url.searchParams.get('q')||'',url.searchParams.get('cursor')||''));
    if(path.startsWith('/api/events/')){
      if(url.searchParams.get('resolve')==='1'&&url.searchParams.has('at'))return json({error:'Invalid request: retrieve references from the latest view'},400);
      const events=new EventsService(service),id=path.slice('/api/events/'.length);
      const resolution=url.searchParams.get('resolve')==='1'?await events.resolve(id):null;
      const story=await events.story(id,url.searchParams.has('at')?atTime(url.searchParams.get('at')):undefined);
      return story?json({...story,resolution}):json({error:'No collected event at this time'},404);
    }
    if(path==='/api/rivers/watershed-sites')return json(await new WatershedSitesService(service).network(url.searchParams.get('comid')));
    if(path==='/api/rivers/usgs-site')return json(await new WatershedSitesService(service).gauge(url.searchParams.get('id')));
    if(path==='/api/rivers/watershed')return json(await new WatershedService(service).basin(url.searchParams.get('lat'),url.searchParams.get('lon')));
    if(path==='/api/rivers/near')return json(await new RiversService(service).near(url.searchParams.get('lat'),url.searchParams.get('lon')));
    if(path==='/api/rivers/gauge')return json(await new RiversService(service).gauge(url.searchParams.get('id')));
    if(path==='/api/rivers/network')return json(await new RiversService(service).network(url.searchParams.get('id')));
    if(path==='/api/rivers/changes')return json(await new RiversService(service).changes(url.searchParams.get('id')));
    if(path.startsWith('/api/hazards/')){
      const kind=path.slice('/api/hazards/'.length);
      if(!['fires','air','satellite','perimeters'].includes(kind))return json({error:'Unknown hazard product'},404);
      return json(await new HazardsService(service).get(kind,url.searchParams.get('id')));
    }
    if(path==='/api/health')return json(await service.health());
    if(path==='/api/alerts'){
      if(url.searchParams.has('at')){const result=await service.read('alerts/us',atTime(url.searchParams.get('at')));return result?json({...result.data,collected_at:result.checked_at}):json({error:'No collected snapshot at that time'},404);}
      let result;try{result=await service.alerts();}catch(error){after(()=>upkeep(service,null));throw error;}
      after(()=>upkeep(service,result));return json(result);
    }
    if(path==='/api/history')return json({snapshots:await service.history('alerts/us'),retention_hours:24});
    if(path==='/api/changes')return json({changes:await service.changes()});
    if(path.startsWith('/api/zones/'))return json(await service.zone(path.slice(4)));
    if(path==='/api/forecast'||path==='/api/forecast/history'){
      let point;try{point=pointKey(url.searchParams.get('lat'),url.searchParams.get('lon'));}catch(error){return json({error:String((error as Error).message)},400);}
      if(path.endsWith('/history')){const rows=await service.statement('SELECT revision,first_seen,issued_at FROM revisions WHERE dataset=? ORDER BY first_seen DESC LIMIT 200','forecast/'+point).all();return json({revisions:rows.results.map((r:any)=>({revision:r.revision,collected_at:iso(r.first_seen),issued_at:r.issued_at}))});}
      if(url.searchParams.has('at')){const r=await service.read('forecast/'+point,atTime(url.searchParams.get('at')));return r?json({...r.data,point,revision:r.revision,collected_at:r.collected_at,checked_at:r.checked_at,issued_at:r.issued_at}):json({error:'No forecast collected by that time'},404);}
      return json(await service.forecast(...point.split(',')));
    }
    return json({error:'Unknown API route'},404);
  }catch(error){const message=String((error as Error).message);return json({error:message},/Invalid|Archive time/.test(message)?400:503);}
}
export async function POST(request:Request){
  if(!env.DB)return json({error:'Shared database unavailable'},503);
  if(new URL(request.url).pathname==='/api/geocode')return geocodePost(request,new GeocodeService(new WeatherService(env.DB)));
  if(new URL(request.url).pathname==='/api/places')return placesPost(request,new PlacesService(new WeatherService(env.DB)),(await getChatGPTUser())?.userId||null);
  if(new URL(request.url).pathname==='/api/push'){const service=pushService(new WeatherService(env.DB)),response=await pushPost(request,service,(await getChatGPTUser())?.userId||null);if(response.ok)after(()=>service.dispatch());return response;}
  if(new URL(request.url).pathname!=='/api/watches')return json({error:'Unknown API route'},404);
  const service=new WeatherService(env.DB),watches=new WatchService(service),user=await getChatGPTUser();
  const response=await watchPost(request,watches,user?.userId||null);
  if(response.ok)after(async()=>{
    // Enrollment must not spend the background execution window waiting for an unrelated national source.
    const cached=await service.read('alerts/us').catch(()=>null);
    await upkeep(service,cached?{...cached.data,collected_at:cached.checked_at,revision:cached.revision,error:cached.error}:null);
  });
  return response;
}
