import {journeyGust,gustLimit,JOURNEY_METHOD} from './journey-gust.mjs';
/* Route timing and explainable weather exposure. Apache-2.0. */
const valid=p=>Array.isArray(p)&&p.length>=2&&Number.isFinite(p[0])&&Number.isFinite(p[1])&&Math.abs(p[0])<=180&&Math.abs(p[1])<=90;
const finite=n=>typeof n==='number'&&Number.isFinite(n);
const wrap=(x,ref)=>ref+((x-ref+540)%360)-180;
export function departureTime(value,now=Date.now()){
  if(typeof value!=='string'||!/(Z|[+-]\d{2}:\d{2})$/.test(value))throw Error('Departure needs an ISO date and timezone, such as 2026-10-28T17:00-07:00.');
  const at=Date.parse(value);if(!Number.isFinite(at)||at<now||at>now+48*3600000)throw Error('Choose a departure between now and 48 hours ahead.');return at;
}
export function normalizeRoute(data){
  const r=data?.routes?.[0],coords=r?.geometry?.coordinates,annotation=r?.legs?.[0]?.annotation;
  if(data?.code!=='Ok'||r?.geometry?.type!=='LineString'||!Array.isArray(coords)||coords.length<2||coords.length>50000||!coords.every(valid)||r.legs.length!==1)throw Error('Invalid or unsupported route geometry');
  if(!finite(r.distance)||r.distance<=0||r.distance>2000000||!finite(r.duration)||r.duration<=0||r.duration>86400)throw Error('Routes must be shorter than 2,000 km and 24 hours.');
  const durations=annotation?.duration,distances=annotation?.distance;
  if(!Array.isArray(durations)||!Array.isArray(distances)||durations.length!==coords.length-1||distances.length!==durations.length||![...durations,...distances].every(n=>finite(n)&&n>=0))throw Error('Route segment timing is unavailable');
  const total=durations.reduce((a,b)=>a+b,0),metres=distances.reduce((a,b)=>a+b,0);if(total<=0||metres<=0)throw Error('Route segment timing is unavailable');
  if(!Array.isArray(data.waypoints)||data.waypoints.length!==2||data.waypoints.some(p=>!valid(p.location)||!finite(p.distance)||p.distance>1000))throw Error('An endpoint is more than 1 km from a routed road');
  let elapsed=0,distance=0;const vertices=coords.map((coordinate,i)=>{if(i){elapsed+=durations[i-1]/total*r.duration;distance+=distances[i-1]/metres*r.distance;}return {coordinate,elapsed,distance};});
  return {vertices,duration:r.duration,distance:r.distance,waypoints:data.waypoints.map(p=>({coordinate:p.location,snap_distance:p.distance,name:p.name||''})),timing_method:'Road-segment durations scaled to the route total, including estimated turn time; no live traffic or stops'};
}
export function sampleRoute(route){
  const v=route.vertices,cost=[0];for(let i=1;i<v.length;i++)cost.push(cost.at(-1)+Math.max((v[i].distance-v[i-1].distance)/50000,(v[i].elapsed-v[i-1].elapsed)/1800));
  const count=Math.max(1,Math.min(24,Math.ceil(cost.at(-1)))),samples=[];let i=1;
  for(let n=0;n<=count;n++){const target=cost.at(-1)*n/count;while(i<cost.length-1&&cost[i]<target)i++;const a=v[i-1],b=v[i],fraction=cost[i]===cost[i-1]?0:(target-cost[i-1])/(cost[i]-cost[i-1]);const lon=a.coordinate[0]+(wrap(b.coordinate[0],a.coordinate[0])-a.coordinate[0])*fraction;
    samples.push({lat:a.coordinate[1]+(b.coordinate[1]-a.coordinate[1])*fraction,lon:((lon+540)%360)-180,elapsed:a.elapsed+(b.elapsed-a.elapsed)*fraction,distance:a.distance+(b.distance-a.distance)*fraction});}
  const maxGapKm=Math.max(...samples.slice(1).map((s,j)=>(s.distance-samples[j].distance)/1000)),maxGapMinutes=Math.max(...samples.slice(1).map((s,j)=>(s.elapsed-samples[j].elapsed)/60));
  return {samples,max_gap_km:maxGapKm,max_gap_minutes:maxGapMinutes,coarse:maxGapKm>50.01||maxGapMinutes>30.01};
}
function ringInside(ring,x,y){let inside=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++){
  const [a,b]=ring[i],[c,d]=ring[j],cross=(x-a)*(d-b)-(y-b)*(c-a);if(Math.abs(cross)<1e-9&&x>=Math.min(a,c)&&x<=Math.max(a,c)&&y>=Math.min(b,d)&&y<=Math.max(b,d))return true;
  if((b>y)!==(d>y)&&x<(c-a)*(y-b)/(d-b)+a)inside=!inside;
}return inside;}
function polygons(g){if(g?.type==='Polygon')return [g.coordinates];if(g?.type==='MultiPolygon')return g.coordinates;if(g?.type==='GeometryCollection'&&Array.isArray(g.geometries)){const children=g.geometries.map(polygons);return children.some(p=>!Array.isArray(p))?null:children.flat();}return null;}
function boundsFor(ring){return ring.reduce((b,p)=>[Math.min(b[0],p[0]),Math.max(b[1],p[0]),Math.min(b[2],p[1]),Math.max(b[3],p[1])],[Infinity,-Infinity,Infinity,-Infinity]);}
function segmentIntervals(a,b,polygon){
  const x=a[0],y=a[1],dx=wrap(b[0],x)-x,dy=b[1]-y,rings=polygon.map(r=>r.map(p=>[wrap(p[0],x),p[1]]));
  const [west,east,south,north]=boundsFor(rings[0]);if(Math.max(x,x+dx)<west||Math.min(x,x+dx)>east||Math.max(y,y+dy)<south||Math.min(y,y+dy)>north)return [];
  const cuts=[0,1];for(const ring of rings)for(let j=1;j<ring.length;j++){
    const [px,py]=ring[j-1],ex=ring[j][0]-px,ey=ring[j][1]-py,det=dx*ey-dy*ex;
    if(Math.abs(det)<1e-12){if(Math.abs((px-x)*dy-(py-y)*dx)<1e-10){for(const p of [ring[j-1],ring[j]]){const t=Math.abs(dx)>Math.abs(dy)?(p[0]-x)/dx:dy?(p[1]-y)/dy:0;if(t>=0&&t<=1)cuts.push(t);}}continue;}
    const t=((px-x)*ey-(py-y)*ex)/det,u=((px-x)*dy-(py-y)*dx)/det;if(t>=0&&t<=1&&u>=0&&u<=1)cuts.push(t);
  }
  const sorted=[...new Set(cuts)].sort((a,b)=>a-b),inside=t=>ringInside(rings[0],x+dx*t,y+dy*t)&&!rings.slice(1).some(r=>ringInside(r,x+dx*t,y+dy*t)),intervals=[];
  for(let j=1;j<sorted.length;j++){const left=sorted[j-1],right=sorted[j];if(inside((left+right)/2))intervals.push([left,right]);}
  // A tangent boundary touch still merits explicit alert context.
  for(const t of sorted)if(inside(t)&&!intervals.some(([a,b])=>t>=a&&t<=b))intervals.push([t,t]);return intervals;
}
export function routePassages(route,geometry){
  const polys=polygons(geometry);if(!Array.isArray(polys)||!polys.length||!polys.every(p=>Array.isArray(p)&&p.length&&p.every(r=>Array.isArray(r)&&r.length>=4&&r.every(valid)&&r[0][0]===r.at(-1)[0]&&r[0][1]===r.at(-1)[1])))return null;
  const bounds=polys.map(p=>boundsFor(p[0]));
  const intervals=[];for(let i=1;i<route.vertices.length;i++){const a=route.vertices[i-1],b=route.vertices[i];for(let j=0;j<polys.length;j++){
    const [west,east,south,north]=bounds[j],aLon=a.coordinate[0],bLon=b.coordinate[0];
    if(Math.max(a.coordinate[1],b.coordinate[1])<south||Math.min(a.coordinate[1],b.coordinate[1])>north)continue;
    if(east-west<180&&Math.abs(aLon-bLon)<180&&(Math.max(aLon,bLon)<west||Math.min(aLon,bLon)>east))continue;
    for(const [left,right] of segmentIntervals(a.coordinate,b.coordinate,polys[j]))intervals.push([a.elapsed+(b.elapsed-a.elapsed)*left,a.elapsed+(b.elapsed-a.elapsed)*right]);}}
  const merged=[];for(const span of intervals.sort((a,b)=>a[0]-b[0])){const last=merged.at(-1);if(last&&span[0]<=last[1]+0.001)last[1]=Math.max(last[1],span[1]);else merged.push(span.slice());}return merged;
}
export function prepareRouteAlerts(route,features){
  const entries=[];let unknownGeometry=0;for(const f of features){if(f.properties?.status!=='Actual'||f.properties.messageType==='Cancel')continue;const spans=routePassages(route,f.geometry);if(spans===null||f.coverage_complete===false)unknownGeometry++;if(!spans?.length)continue;
    const p=f.properties,start=Date.parse(p.onset||p.effective||p.sent),end=Date.parse(p.ends||p.expires);entries.push({id:f.id,event:p.event,severity:p.severity,coverage:f.coverage||'Alert polygon',start,end,spans,instruction:p.instruction||'',time_unknown:!Number.isFinite(start)||!Number.isFinite(end)||end<start});}
  return {entries,unknown_geometry:unknownGeometry};
}
export function evaluateJourney(route,samples,forecasts,prepared,departure,{now=Date.now(),alertCheckedAt=null,grids=[],gustCeiling=null}={}){
  const ceiling=gustLimit(gustCeiling);
  const rows=samples.map((s,i)=>{const data=forecasts[i],at=departure+s.elapsed*1000,old=!data||data.stale||!Number.isFinite(Date.parse(data.checked_at))||now-Date.parse(data.checked_at)>900000;
    const p=data?.forecast?.properties?.periods?.find(p=>Date.parse(p.startTime)<=at&&Date.parse(p.endTime)>at);
    let temperature=null,wind=null,rain=null;if(!old&&p){const t=p.temperature;if(finite(t))temperature=p.temperatureUnit==='F'?t:p.temperatureUnit==='C'?t*1.8+32:null;else if(finite(t?.value))temperature=t.unitCode==='wmoUnit:degC'?t.value*1.8+32:t.unitCode==='wmoUnit:degF'?t.value:null;
      const w=p.windSpeed;if(typeof w==='string'){const values=w.match(/\d+(?:\.\d+)?/g)?.map(Number);wind=/^calm$/i.test(w.trim())?0:values&&/mph/i.test(w)?Math.max(...values):values&&/km\/h/i.test(w)?Math.max(...values)/1.609344:null;}else if(finite(w?.value))wind=w.unitCode==='wmoUnit:km_h-1'?w.value/1.609344:w.unitCode==='wmoUnit:m_s-1'?w.value*2.236936:w.unitCode==='wmoUnit:mi_h-1'?w.value:null;
      const q=p.probabilityOfPrecipitation?.value;if(finite(q)&&q>=0&&q<=100)rain=q;
    }
    if(wind!==null&&wind<0)wind=null;
    const gust=journeyGust(grids[i],data,at,now),hourlyMissing=old||!p||temperature===null||wind===null||rain===null;
    return {...s,at:new Date(at).toISOString(),temperature,wind,rain,gust:gust.value,gust_evidence:gust,gust_exceeds:ceiling===null||gust.value===null?null:gust.value>ceiling,hourly_missing:hourlyMissing,summary:old?(data?.forecast?'Forecast collection delayed':'Forecast unavailable'):!p?'No forecast for this arrival hour':p.shortForecast||'',missing:hourlyMissing||gust.value===null,error:data?.error||null,time_zone:data?.metadata?.properties?.timeZone||null,forecast_revision:data?.revision||null,forecast_checked_at:data?.checked_at||null,forecast_issued_at:data?.issued_at||null,source_url:data?.source_url||null};
  });
  const alerts=[];for(const entry of prepared.entries){const spans=entry.spans.map(([a,b])=>[departure+a*1000,departure+b*1000]).map(([a,b])=>entry.time_unknown?[a,b]:[Math.max(a,entry.start),Math.min(b,entry.end)]).filter(([a,b])=>b>a||(b===a&&(entry.time_unknown||a>=entry.start&&a<entry.end)));if(spans.length)alerts.push({...entry,spans:spans.map(([a,b])=>[new Date(a).toISOString(),new Date(b).toISOString()])});}
  const max=key=>{const values=rows.map(r=>r[key]).filter(finite);return values.length?Math.max(...values):null;};
  return {method_version:JOURNEY_METHOD,gust_limit_mph:ceiling,covered_gust_samples:rows.filter(r=>r.gust!==null).length,gust_exceedance_samples:ceiling===null?null:rows.filter(r=>r.gust_exceeds===true).length,max_gust:max('gust'),departure:new Date(departure).toISOString(),arrival:new Date(departure+route.duration*1000).toISOString(),rows,alerts,covered_samples:rows.filter(r=>!r.hourly_missing).length,total_samples:rows.length,max_wind:max('wind'),max_rain:max('rain'),unknown_geometry:prepared.unknown_geometry,alert_collection_stale:!Number.isFinite(Date.parse(alertCheckedAt))||now-Date.parse(alertCheckedAt)>240000,alert_checked_at:alertCheckedAt};
}
