import {roadStops} from './journey-roads.mjs';
export function journeyStops(value){
  if(!Array.isArray(value)||value.length>3)throw Error('Choose at most three via points.');
  return value.map((p,i)=>{
    if(!p||[p.lat,p.lon].some(v=>v===null||v===undefined||String(v).trim()===''))throw Error('Both coordinates are required for via point '+(i+1)+'.');
    const lat=Number(p.lat),lon=Number(p.lon),minutes=p.minutes===undefined||p.minutes===''?0:Number(p.minutes);
    if(!Number.isFinite(lat)||!Number.isFinite(lon)||Math.abs(lat)>90||Math.abs(lon)>180)throw Error('Invalid via point coordinates.');
    if(!Number.isFinite(minutes)||!Number.isInteger(minutes)||minutes<0||minutes>120)throw Error('Each stop must be 0 to 120 whole minutes.');
    return {lat,lon,minutes};
  });
}

export function applyJourneyStops(route,input){
  const requested=journeyStops(input);if(!requested.length)return {...route,driving_duration:route.duration,stop_duration:0,stops:[]};
  if(route.legs?.length!==requested.length+1||route.waypoints?.length!==requested.length+2)throw Error('Route legs do not match the requested via points.');
  let delay=0;const stops=requested.map((p,i)=>{
    const leg=route.legs[i],v=route.vertices[leg.end_vertex],point=route.waypoints[i+1];
    if(!v||!Number.isFinite(v.elapsed)||!point.coordinate)throw Error('Via point timing is unavailable.');
    const stop={index:i+1,requested:p,coordinate:point.coordinate,snap_distance:point.snap_distance,distance:v.distance,driving_elapsed:v.elapsed,arrival_elapsed:v.elapsed+delay,departure_elapsed:v.elapsed+delay+p.minutes*60,duration:p.minutes*60,end_vertex:leg.end_vertex};delay+=stop.duration;return stop;
  });
  if(route.duration+delay>86400)throw Error('Driving and stops together must fit within 24 hours.');
  const vertices=[];let accumulated=0,next=0;
  route.vertices.forEach((v,i)=>{vertices.push({...v,elapsed:v.elapsed+accumulated});if(stops[next]?.end_vertex===i){const stop=stops[next++];accumulated+=stop.duration;if(stop.duration)vertices.push({...v,elapsed:v.elapsed+accumulated});}});
  const samples=route.sampling.samples.map(s=>({...s,elapsed:s.elapsed+stops.filter(p=>p.driving_elapsed<s.elapsed-1e-6).reduce((sum,p)=>sum+p.duration,0)}));
  for(const stop of stops){
    for(let t=0;t<stop.duration;t+=1800)samples.push({lat:stop.coordinate[1],lon:stop.coordinate[0],elapsed:stop.arrival_elapsed+t,distance:stop.distance,stop_index:stop.index,stop_phase:t===0?'arrive':'during'});
    samples.push({lat:stop.coordinate[1],lon:stop.coordinate[0],elapsed:stop.departure_elapsed,distance:stop.distance,stop_index:stop.index,stop_phase:stop.duration?'depart':'via'});
  }
  // At identical time/position retain the explicit via/stop label.
  const unique=new Map();for(const s of samples)unique.set([s.elapsed.toFixed(4),s.lat.toFixed(6),s.lon.toFixed(6)].join('/'),s);
  const ordered=[...unique.values()].sort((a,b)=>a.elapsed-b.elapsed),gaps=ordered.slice(1).map((s,i)=>({km:(s.distance-ordered[i].distance)/1000,minutes:(s.elapsed-ordered[i].elapsed)/60}));
  const maxKm=Math.max(0,...gaps.map(g=>g.km)),maxMinutes=Math.max(0,...gaps.map(g=>g.minutes));
  return {...route,vertices,road_context:roadStops(route.road_context,stops),driving_duration:route.duration,stop_duration:delay,duration:route.duration+delay,stops,sampling:{samples:ordered,max_gap_km:maxKm,max_gap_minutes:maxMinutes,coarse:maxKm>50.01||maxMinutes>30.01},timing_method:route.timing_method+'; user stop durations added at snapped via points'};
}
export function journeySampleLabel(row,i,length){return row.stop_index?'Via '+row.stop_index+' · '+({arrive:'stop arrival',during:'during stop',depart:'stop departure',via:'pass through'})[row.stop_phase]:i===0?'Start':i===length-1?'Arrival':'Sample '+i;}
