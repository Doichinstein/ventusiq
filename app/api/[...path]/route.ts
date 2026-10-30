import {archivedEventMap} from '../../../lib/event-map.mjs';
import {browserOwner} from '../../../lib/browser-owner.mjs';
import {ForecastStabilityService} from '../../../lib/forecast-stability-service.mjs';
import {mapAlerts} from '../../../lib/map-alerts.mjs';
import {mapZones} from '../../../lib/map-zones.mjs';
import {RoadworkService} from '../../../lib/roadwork-service.mjs';
import {FirmsService} from '../../../lib/firms-service.mjs';
import {StationAnalogsService} from '../../../lib/station-analogs-service.mjs';
import {UpkeepService} from '../../../lib/upkeep-service.mjs';
import {StationHistoryService} from '../../../lib/station-history-service.mjs';
import {OzoneService} from '../../../lib/ozone-service.mjs';
import {StormHistoryService} from '../../../lib/storm-history-service.mjs';
import {WebhookService} from '../../../lib/webhook-service.mjs';
import {webhookGet,webhookPost} from '../../../lib/webhook-http.mjs';
import {PMComparisonService} from '../../../lib/pm-comparison-service.mjs';
import {AirForecastService} from '../../../lib/air-forecast-service.mjs';
import {GeosCFService} from '../../../lib/geos-cf-service.mjs';
import {WatershedSitesService} from '../../../lib/watershed-sites-service.mjs';
import {GeocodeService,geocodePost} from '../../../lib/geocode-service.mjs';
import {WatershedService} from '../../../lib/watershed-service.mjs';
import {journeyStops} from '../../../public/journey-stops.mjs';
import {HrrrService} from '../../../lib/hrrr-service.mjs';
import {PlacesService} from '../../../lib/places-service.mjs';
import {placesGet,placesPost} from '../../../lib/places-http.mjs';
import {EnsembleService} from '../../../lib/ensemble-service.mjs';
import {EnsembleVerificationService} from '../../../lib/ensemble-verification-service.mjs';
import {HrrrVerificationService} from '../../../lib/hrrr-verification-service.mjs';
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
import { pinnedRouterConfig } from '../../../lib/pinned-route.mjs';
import { AnalogsService } from '../../../lib/analogs-service.mjs';
import { PlanningService } from '../../../lib/planning-service.mjs';
import { AirTrendsService } from '../../../lib/air-trends-service.mjs';
import { SmokeService } from '../../../lib/smoke-service.mjs';
import { EventReportsService } from '../../../lib/event-reports-service.mjs';
import { EventObservationsService } from '../../../lib/event-observations-service.mjs';
import { WatchService } from '../../../lib/watch-service.mjs';
import { PushService } from '../../../lib/push-service.mjs';
import { pushGet,pushPost,schedulePushDispatch } from '../../../lib/push-http.mjs';
import { watchGet,watchPost } from '../../../lib/watch-http.mjs';

function pushService(weather:WeatherService){let jwk=null;try{jwk=JSON.parse(env.VENTUSIQ_VAPID_PRIVATE_JWK||'null');}catch{}return new PushService(weather,{jwk});}
async function upkeep(weather:WeatherService,alerts:any){return new UpkeepService(weather,{
  watches:(value:any)=>new WatchService(weather).upkeep(value),
  push:()=>pushService(weather).dispatch(),webhooks:()=>new WebhookService(weather).dispatch(),
}).run(alerts);}
function json(value:unknown,status=200){return Response.json(value,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});}
function atTime(value:string|null){if(!value||!/(Z|[+-]\d\d:\d\d)$/.test(value)||!Number.isFinite(Date.parse(value)))throw new Error('Archive time requires a valid timezone');return Date.parse(value)/1000;}
export async function GET(request:Request){
  if(!env.DB)return json({error:'Shared database unavailable'},503);
  const url=new URL(request.url),path=url.pathname,service=new WeatherService(env.DB);
  try{
    if(path==='/api/places')return placesGet(new PlacesService(service),(await getChatGPTUser())?.userId||null);
    if(path==='/api/webhooks')return webhookGet(new WebhookService(service),await browserOwner(request));
    if(path==='/api/push')return pushGet(pushService(service),await browserOwner(request));
    if(path==='/api/watches')return watchGet(request,new WatchService(service),await browserOwner(request));
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
    if(path==='/api/air/ozone/near')return json(await new OzoneService(service).near(url.searchParams.get('lat'),url.searchParams.get('lon')));
    if(path==='/api/air/ozone/history')return json(await new OzoneService(service).history(url.searchParams.get('lat'),url.searchParams.get('lon'),url.searchParams.get('id'),url.searchParams.get('compare')==='1',url.searchParams.get('source')||'cams'));
    if(path==='/api/air/forecast')return json(await new AirForecastService(service).forecast(url.searchParams.get('lat'),url.searchParams.get('lon')));
    if(path==='/api/air/geos-cf')return json(await new GeosCFService(service).forecast(url.searchParams.get('lat'),url.searchParams.get('lon')));
    if(path==='/api/air/history')return json(await new AirTrendsService(service).history(url.searchParams.get('id')));
    if(path==='/api/ensemble')return json(await new EnsembleService(service).forecast(url.searchParams.get('lat'),url.searchParams.get('lon'),url.searchParams.get('source')||'latest'));
    if(path==='/api/smoke/hrrr')return json(await new HrrrService(service).forecast(url.searchParams.get('lat'),url.searchParams.get('lon')));
    if(path==='/api/forecast/hrrr-temperature')return json(await new HrrrService(service).forecast(url.searchParams.get('lat'),url.searchParams.get('lon'),'temperature'));
    if(path==='/api/forecast/hrrr-verification')return json(await new HrrrVerificationService(service).compare(url.searchParams.get('lat'),url.searchParams.get('lon'),url.searchParams.get('station')));
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
    if(path==='/api/history/stations/near')return json(await new StationHistoryService(service).near(url.searchParams.get('lat'),url.searchParams.get('lon'),url.searchParams.get('date')));
    if(path==='/api/history/stations/daily')return json(await new StationHistoryService(service).daily(url.searchParams.get('id'),url.searchParams.get('date')));
    if(path==='/api/history/stations/temperatures')return json(await new StationAnalogsService(service).history(url.searchParams.get('id')));
    if(path==='/api/journey/roadwork')return json(await new RoadworkService(service).feed(url.searchParams.get('feed')));
    if(path==='/api/journey/events'){
      let via=[],departures=[];try{const input=url.searchParams.get('via')||'[]',dates=url.searchParams.get('departures')||'[]';if(input.length>1000||dates.length>200)throw Error();via=journeyStops(JSON.parse(input));departures=JSON.parse(dates);}catch{return json({error:'Invalid road-event timing or via points'},400);}
      const {reviewedEvents}=await import('../../../lib/journey-events.mjs');
      return json(await reviewedEvents(new JourneyService(service,{pinnedRouter:pinnedRouterConfig(env)}),url.searchParams.get('fromLat'),url.searchParams.get('fromLon'),url.searchParams.get('toLat'),url.searchParams.get('toLon'),via,departures,url.searchParams.get('revision')));
    }
    if(path==='/api/journey/route'){
      let via=[];try{const input=url.searchParams.get('via')||'[]';if(input.length>1000)throw Error();via=journeyStops(JSON.parse(input));}catch{return json({error:'Invalid via points'},400);}
      return json(await new JourneyService(service,{pinnedRouter:pinnedRouterConfig(env)}).route(url.searchParams.get('fromLat'),url.searchParams.get('fromLon'),url.searchParams.get('toLat'),url.searchParams.get('toLon'),via));
    }
    if(path==='/api/observations/near')return json(await new ObservationsService(service).near(url.searchParams.get('lat'),url.searchParams.get('lon')));
    if(path==='/api/observations/station')return json(await new ObservationsService(service).station(url.searchParams.get('id')));
    if(path==='/api/forecast/stability')return json(await new ForecastStabilityService(service).compare(url.searchParams.get('lat'),url.searchParams.get('lon'),url.searchParams.get('hours')||24));
    if(path==='/api/ensemble/verification')return json(await new EnsembleVerificationService(service).compare(url.searchParams.get('lat'),url.searchParams.get('lon'),url.searchParams.get('station')));
    if(path==='/api/verification')return json(await new ObservationsService(service).verification(url.searchParams.get('lat'),url.searchParams.get('lon'),url.searchParams.get('station'),url.searchParams.get('at')));
    if(path==='/api/event-map'){const story=await new EventsService(service).story(url.searchParams.get('id'),url.searchParams.has('at')?atTime(url.searchParams.get('at')):service.eventClock()/1000);return story?json(await archivedEventMap(service,story)):json({error:'No collected event at this time'},404);}
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
    if(path==='/api/hazards/firms')return json(await new FirmsService(service).get(url.searchParams.get('region')));
    if(path.startsWith('/api/hazards/')){
      const kind=path.slice('/api/hazards/'.length);
      if(!['fires','air','aqi','satellite','perimeters'].includes(kind))return json({error:'Unknown hazard product'},404);
      return json(await new HazardsService(service).get(kind,url.searchParams.get('id')));
    }
    if(path==='/api/history/storms/catalog')return json(await new StormHistoryService(service).catalog());
    if(path==='/api/history/storms/counties')return json(await new StormHistoryService(service).counties(url.searchParams.get('state')));
    if(path==='/api/history/storms')return json(await new StormHistoryService(service).search(Object.fromEntries(url.searchParams)));
    if(path==='/api/health'){const [health,upkeep]=await Promise.all([service.health(),new UpkeepService(service).status()]);return json({...health,upkeep});}
    if(path==='/api/alerts'){
      if(url.searchParams.has('at')){const result=await service.read('alerts/us',atTime(url.searchParams.get('at')));return result?json({...result.data,collected_at:result.checked_at}):json({error:'No collected snapshot at that time'},404);}
      if(url.searchParams.get('view')==='map')return json(await mapAlerts(service,after,(result:any)=>upkeep(service,result)));
      let result;try{result=await service.alerts();}catch(error){after(()=>upkeep(service,null));throw error;}
      after(()=>upkeep(service,result));return json(result);
    }
    if(path==='/api/history')return json({snapshots:await service.history('alerts/us'),retention_hours:24});
    if(path==='/api/changes')return json({changes:await service.changes()});
    if(path==='/api/map/zones')return json(await mapZones(service,url.searchParams.get('ids')));
    if(path.startsWith('/api/zones/'))return json(await service.zone(path.slice(4)));
    if(path==='/api/forecast'||path==='/api/forecast/history'){
      let point;try{point=pointKey(url.searchParams.get('lat'),url.searchParams.get('lon'));}catch(error){return json({error:String((error as Error).message)},400);}
      if(path.endsWith('/history')){const rows=await service.statement('SELECT revision,first_seen,issued_at FROM revisions WHERE dataset=? ORDER BY first_seen DESC LIMIT 200','forecast/'+point).all();return json({revisions:rows.results.map((r:any)=>({revision:r.revision,collected_at:iso(r.first_seen),issued_at:r.issued_at}))});}
      if(url.searchParams.has('at')){const r=await service.read('forecast/'+point,atTime(url.searchParams.get('at')));return r?json({...r.data,point,revision:r.revision,collected_at:r.collected_at,checked_at:r.checked_at,issued_at:r.issued_at}):json({error:'No forecast collected by that time'},404);}
      return json(await service.forecast(...point.split(',')));
    }
    return json({error:'Unknown API route'},404);
  }catch(error){const message=String((error as Error).message);return json({error:message},(error as {status?:number}).status===400||/Invalid|Archive time/.test(message)?400:503);}
}
export async function POST(request:Request){
  if(!env.DB)return json({error:'Shared database unavailable'},503);
  if(new URL(request.url).pathname==='/api/geocode')return geocodePost(request,new GeocodeService(new WeatherService(env.DB)));
  if(new URL(request.url).pathname==='/api/places')return placesPost(request,new PlacesService(new WeatherService(env.DB)),(await getChatGPTUser())?.userId||null);
  if(new URL(request.url).pathname==='/api/webhooks'){const service=new WebhookService(new WeatherService(env.DB)),response=await webhookPost(request,service,await browserOwner(request));if(response.ok)after(()=>service.dispatch());return response;}
  if(new URL(request.url).pathname==='/api/push'){const service=pushService(new WeatherService(env.DB)),response=await pushPost(request,service,await browserOwner(request));await schedulePushDispatch(service,response,after);return response;}
  if(new URL(request.url).pathname!=='/api/watches')return json({error:'Unknown API route'},404);
  const service=new WeatherService(env.DB),watches=new WatchService(service);
  const response=await watchPost(request,watches,await browserOwner(request));
  if(response.ok)after(async()=>{
    // Enrollment must not spend the background execution window waiting for an unrelated national source.
    const cached=await service.read('alerts/us').catch(()=>null);
    await upkeep(service,cached?{...cached.data,collected_at:cached.checked_at,revision:cached.revision,error:cached.error}:null);
  });
  return response;
}
