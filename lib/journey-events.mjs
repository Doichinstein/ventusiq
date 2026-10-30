import {EVENT_LABELS,eventDepartures} from '../public/journey-events.mjs';
import {journeyStops} from '../public/journey-stops.mjs';
import {readRouteResponse} from './journey-service.mjs';
const hash=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
export function validateReviewedEvents(raw,{request_id,route,departures,stop_minutes,graph},now){
  const bad=()=>{throw Error('Reviewed-event response does not match the requested route, timing or evidence contract.');};
  if(raw?.schema!=='ventusiq-reviewed-events-result/1'||raw.request_id!==request_id||raw.graph_sha256!==graph||!hash(raw.bundle_sha256)||
      raw.field_closure_verified!==false||raw.driving_access_established!==false||
      !Number.isFinite(Date.parse(raw.evaluated_at))||Date.parse(raw.evaluated_at)<now-60000||Date.parse(raw.evaluated_at)>now+60000||
      JSON.stringify(raw.stop_minutes)!==JSON.stringify(stop_minutes)||!Array.isArray(raw.departures)||raw.departures.length!==departures.length)bad();
  const duration=route.duration+stop_minutes.reduce((a,b)=>a+b*60,0);
  for(const [i,d] of raw.departures.entries()){
    if(Date.parse(d.departure)!==Date.parse(departures[i])||!Array.isArray(d.results)||d.results.length<1||d.results.length>16)bad();
    const ids=new Set();
    for(const r of d.results){
      if(r?.schema!=='ventusiq-route-event-trip-result/1'||!Object.hasOwn(EVENT_LABELS,r.status)||typeof r.event_id!=='string'||!r.event_id||ids.has(r.event_id)||
          Date.parse(r.departure)!==Date.parse(d.departure)||!Number.isFinite(Date.parse(r.arrival))||Math.abs((Date.parse(r.arrival)-Date.parse(d.departure))/1000-duration)>.05||
          r.field_closure_verified!==false||r.driving_access_established!==false||!Array.isArray(r.blocks)||r.blocks.some(b=>typeof b!=='string')||
          !Array.isArray(r.passages)||r.passages.length>50000||!Array.isArray(r.legs)||r.legs.length!==route.legs.length||
          !Array.isArray(r.inputs)||r.inputs.length!==4||r.inputs.some(p=>!hash(p.sha256))||
          ['association','crosswalk','agency_source','event_source'].some(role=>r.inputs.filter(p=>p.role===role).length!==1)||
          ['association','crosswalk'].some(role=>!r.reviews?.[role]||!Array.isArray(r.reviews[role].evidence)))bad();
      ids.add(r.event_id);
      if((r.status==='blocked'&&(!r.blocks.length||r.passages.length))||(r.status!=='blocked'&&r.blocks.length)||
          (r.status==='no_reviewed_time_overlap'&&r.passages.length)||
          (!['blocked','no_reviewed_time_overlap'].includes(r.status)&&!r.passages.length))bad();
      for(const p of r.passages)if(!Number.isInteger(p.leg_index)||p.leg_index<0||p.leg_index>=route.legs.length||
          !Array.isArray(p.estimated_passage)||p.estimated_passage.length!==2||p.estimated_passage.some(t=>!Number.isFinite(Date.parse(t)))||
          Date.parse(p.estimated_passage[0])<Date.parse(d.departure)||Date.parse(p.estimated_passage[1])<Date.parse(p.estimated_passage[0])||Date.parse(p.estimated_passage[1])>Date.parse(r.arrival))bad();
    }
  }
  return raw;
}
export async function reviewedEvents(service,fromLat,fromLon,toLat,toLon,via,departureValues,revision){
  const now=service.weather.clock(),departures=eventDepartures(departureValues,now*1000),stops=journeyStops(via);
  if(!service.pinnedRouter)return {status:'unavailable',reason:'This deployment has no routing graph with reviewed agency-event coverage.'};
  if(typeof revision!=='string'||revision.length>128||!revision)throw Error('A retained route revision is required.');
  const route=await service.route(fromLat,fromLon,toLat,toLon,stops);
  if(route.revision!==revision||route.stale||route.error)throw Error('The retained route changed or could not be refreshed. Compare the journey again.');
  const config=service.pinnedRouter,stop_minutes=stops.map(s=>s.minutes);
  if(route.duration+stop_minutes.reduce((a,b)=>a+b*60,0)>86400)throw Error('Driving and stops together must fit within 24 hours.');
  const admitted=await service.weather.statement("INSERT INTO datasets(name,next_fetch,lease_until) VALUES ('routing/events-limit',?,0) ON CONFLICT(name) DO UPDATE SET next_fetch=excluded.next_fetch WHERE datasets.next_fetch<=? RETURNING name",now+2,now).first();
  if(!admitted)throw Error('Road-event assessment is busy. Please retry shortly.');
  const request_id=crypto.randomUUID(),body={request_id,route:{schema:'ventusiq-pinned-route/1',graph_sha256:config.graph,
    engine_version:route.network_references.engine_version,checked_at:route.checked_at,
    requested_waypoints:route.network_references.legs.flatMap((l,i)=>l.probe.requests.route.locations.filter((_,j)=>i===0||j===1).map(p=>[p.lon,p.lat])),
    legs:route.network_references.legs.map(l=>l.probe)},departures,stop_minutes};
  const encoded=JSON.stringify(body);if(new TextEncoder().encode(encoded).length>8*1024*1024)throw Error('Retained route exceeds event-assessment capacity.');
  // Evaluations are fresh snapshots, never put in the 24-hour route cache or silently reused after failure.
  const response=await service.weather.fetcher(new URL('/route-events',config.url).href,{method:'POST',signal:AbortSignal.timeout(25000),redirect:'manual',
    headers:{'Content-Type':'application/json',Accept:'application/json',Authorization:'Bearer '+config.token},body:encoded});
  const raw=validateReviewedEvents(await readRouteResponse(response),{request_id,route,departures,stop_minutes,graph:config.graph},service.weather.clock()*1000);
  const {request_id:ignored,...result}=raw;return {...result,status:'evaluated',route_revision:route.revision};
}
