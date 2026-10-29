/* Source road labels aligned to the exact routed geometry. Apache-2.0. */
export const ROAD_CONTEXT_METHOD='2026-10-29.1';
const same=(a,b)=>Array.isArray(a)&&Array.isArray(b)&&a.length>=2&&b.length>=2&&a[0]===b[0]&&a[1]===b[1];
const label=value=>typeof value==='string'&&value.length<=500?value:null;
export function routeRoads(raw,route){
  const result={method:ROAD_CONTEXT_METHOD,status:'unavailable',segments:[],unavailable_legs:[],data_version:label(raw?.data_version),direction_verified:false};
  for(const [legIndex,leg] of route.legs.entries()){
    const steps=raw.routes[0].legs[legIndex].steps,segments=[];let cursor=leg.start_vertex,reason=null;
    if(!Array.isArray(steps)||!steps.length||steps.length>2000)reason='Road steps missing or beyond capacity';
    else for(const [stepIndex,step] of steps.entries()){
      const points=step?.geometry?.coordinates,name=label(step?.name),ref=step?.ref===undefined?'':label(step.ref);
      if(step?.geometry?.type!=='LineString'||!Array.isArray(points)||points.length<2||points.length>50000||name===null||ref===null||typeof step.mode!=='string'||step.mode.length>80){reason='Invalid source road step';break;}
      if(step.maneuver?.type==='arrive'){
        if(stepIndex!==steps.length-1||cursor!==leg.end_vertex||step.duration!==0||step.distance!==0||!points.every(p=>same(p,route.vertices[cursor].coordinate))){reason='Arrival step does not match the leg endpoint';break;}
        continue;
      }
      const end=cursor+points.length-1;
      if(end>leg.end_vertex||!points.every((p,i)=>same(p,route.vertices[cursor+i]?.coordinate))){reason='Road-step geometry does not match the route in order';break;}
      segments.push({leg_index:legIndex,step_index:stepIndex,start_vertex:cursor,end_vertex:end,source_start_vertex:cursor,source_end_vertex:end,
        start_elapsed:route.vertices[cursor].elapsed,end_elapsed:route.vertices[end].elapsed,
        name,ref,mode:step.mode,source:{name:step.name,ref:step.ref??null,mode:step.mode,
          duration:step.duration??null,distance:step.distance??null,maneuver:step.maneuver??null}});
      cursor=end;
    }
    if(!reason&&cursor!==leg.end_vertex)reason='Road steps do not cover the whole leg';
    if(reason)result.unavailable_legs.push({leg_index:legIndex,reason});else result.segments.push(...segments);
  }
  result.status=result.segments.length?(result.unavailable_legs.length?'partial':'available'):'unavailable';
  return result;
}

export function roadStops(context,stops){
  if(!context)return null;
  return {...context,segments:context.segments.map(s=>({...s,
    start_vertex:s.start_vertex+stops.filter(p=>p.duration&&p.end_vertex<=s.start_vertex).length,
    end_vertex:s.end_vertex+stops.filter(p=>p.duration&&p.end_vertex<s.end_vertex).length,
    start_elapsed:s.start_elapsed+stops.filter(p=>p.driving_elapsed<=s.start_elapsed).reduce((n,p)=>n+p.duration,0),
    end_elapsed:s.end_elapsed+stops.filter(p=>p.driving_elapsed<s.end_elapsed).reduce((n,p)=>n+p.duration,0)}))};
}

// Deliberately narrow: preserve street direction words, route suffixes and ramps.
// Only common US numbered-route punctuation is interchangeable.
export function roadLabel(value){
  const text=String(value||'').normalize('NFKC').trim().toLowerCase().replace(/\s+/g,' ');
  const numbered=/^(i|us|md|ia|wa|sr)[ -]+(\d+)(.*)$/.exec(text);
  return numbered?numbered[1]+' '+numbered[2]+numbered[3]:text;
}
export function nearbyRoadLabels(context,event,spans){
  const sourceLabels=event.roads.map(roadLabel).filter(Boolean),matches=new Map(),segments=context?.segments||[];
  for(const [a,b] of spans){
    let low=0,high=segments.length;
    while(low<high){const mid=(low+high)>>1;if(segments[mid].end_elapsed<=a)low=mid+1;else high=mid;}
    for(let i=low;i<segments.length&&segments[i].start_elapsed<b;i++){
      const segment=segments[i],start=Math.max(a,segment.start_elapsed),end=Math.min(b,segment.end_elapsed);
      if(end<=start)continue; // A junction touch or stopped interval cannot assign a road.
      if(!matches.has(i))matches.set(i,[]);matches.get(i).push([start,end]);
    }
  }
  const rows=[];for(const [i,overlaps] of [...matches].sort((a,b)=>a[0]-b[0])){
    const segment=segments[i];
    const labels=[segment.name,...segment.ref.split(';')].map(roadLabel).filter(Boolean);
    const shared=[...new Set(labels.filter(v=>sourceLabels.includes(v)))];
    rows.push({...segment,shared_labels:shared,spans:overlaps});
  }
  return {method:ROAD_CONTEXT_METHOD,status:rows.some(r=>r.shared_labels.length)?'shared_label':rows.some(r=>r.name||r.ref)?'no_shared_label':'unavailable',
    source_context_status:context?.status||'unavailable',segments:rows.slice(0,100),omitted_segments:Math.max(0,rows.length-100),
    direction_verified:false,closure_attribution_verified:false};
}
