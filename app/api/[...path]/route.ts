import { env } from 'cloudflare:workers';
import { WeatherService, pointKey, iso } from '../../../lib/weather-service.mjs';
import { HazardsService } from '../../../lib/hazards-service.mjs';
import { RiversService } from '../../../lib/rivers-service.mjs';

function json(value:unknown,status=200){return Response.json(value,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});}
function atTime(value:string|null){if(!value||!/(Z|[+-]\d\d:\d\d)$/.test(value)||!Number.isFinite(Date.parse(value)))throw new Error('Archive time requires a valid timezone');return Date.parse(value)/1000;}
export async function GET(request:Request){
  if(!env.DB)return json({error:'Shared database unavailable'},503);
  const url=new URL(request.url),path=url.pathname,service=new WeatherService(env.DB);
  try{
    if(path==='/api/rivers/near')return json(await new RiversService(service).near(url.searchParams.get('lat'),url.searchParams.get('lon')));
    if(path==='/api/rivers/gauge')return json(await new RiversService(service).gauge(url.searchParams.get('id')));
    if(path.startsWith('/api/hazards/')){
      const kind=path.slice('/api/hazards/'.length);
      if(!['fires','air','satellite','perimeters'].includes(kind))return json({error:'Unknown hazard product'},404);
      return json(await new HazardsService(service).get(kind,url.searchParams.get('id')));
    }
    if(path==='/api/health')return json(await service.health());
    if(path==='/api/alerts'){
      if(url.searchParams.has('at')){const result=await service.read('alerts/us',atTime(url.searchParams.get('at')));return result?json({...result.data,collected_at:result.checked_at}):json({error:'No collected snapshot at that time'},404);}
      return json(await service.alerts());
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
