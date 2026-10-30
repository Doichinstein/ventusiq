/* Strict bridge from our pinned Valhalla service to Journey. Apache-2.0. */
import {sampleRoute} from '../public/journey-core.mjs';
export const PINNED_ROUTE_METHOD='2026-10-30.1';
const finite=n=>typeof n==='number'&&Number.isFinite(n);
const id=n=>Number.isSafeInteger(n)&&n>0;
const same=(a,b)=>Array.isArray(a)&&Array.isArray(b)&&a.length===2&&b.length===2&&a.every((v,i)=>v===b[i]);
const point=p=>Array.isArray(p)&&p.length===2&&p.every(finite)&&Math.abs(p[0])<=180&&Math.abs(p[1])<=90;
function distance(a,b){const rad=Math.PI/180,p=(b[1]-a[1])*rad,q=(b[0]-a[0])*rad,h=Math.sin(p/2)**2+Math.cos(a[1]*rad)*Math.cos(b[1]*rad)*Math.sin(q/2)**2;return 12742000*Math.asin(Math.sqrt(Math.min(1,h)));}
export function decodePolyline6(shape){
  if(typeof shape!=='string'||shape.length>1000000)throw Error('Invalid pinned route shape');
  let offset=0,lat=0,lon=0;const values=[],points=[];
  while(offset<shape.length){let value=0,multiplier=1,byte;
    do{if(offset>=shape.length||multiplier>2**45)throw Error('Malformed pinned route shape');byte=shape.charCodeAt(offset++)-63;if(byte<0||byte>63)throw Error('Malformed pinned route shape');value+=(byte&31)*multiplier;multiplier*=32;}while(byte>=32);
    if(!Number.isSafeInteger(value))throw Error('Invalid pinned coordinate');values.push(value%2?-(value+1)/2:value/2);
  }
  if(values.length<4||values.length%2||values.length>100000)throw Error('Invalid pinned coordinate count');
  for(let i=0;i<values.length;i+=2){lat+=values[i];lon+=values[i+1];const p=[lon/1e6,lat/1e6];if(!point(p))throw Error('Pinned coordinates outside WGS84');points.push(p);}return points;
}
export function pinnedRouterConfig(env={}){
  const values=[env.VENTUSIQ_PINNED_ROUTER_URL,env.VENTUSIQ_PINNED_GRAPH_SHA256,env.VENTUSIQ_PINNED_ROUTER_TOKEN];
  if(values.every(v=>!v))return null;
  try{const url=new URL(values[0]);if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash||url.pathname!=='/route'||!/^\w[\w.-]*$/.test(url.hostname)||!(/^[0-9a-f]{64}$/).test(values[1])||typeof values[2]!=='string'||!(/^[A-Za-z0-9_-]{32,256}$/).test(values[2]))throw Error();return {url:url.href,graph:values[1],token:values[2]};}catch{throw Error('Pinned router configuration is incomplete or invalid');}
}
export function normalizePinnedRoute(data,expectedGraph,requested,now=Date.now()){
  const checked=Date.parse(data?.checked_at);
  if(data?.schema!=='ventusiq-pinned-route/1'||data.graph_sha256!==expectedGraph||data.engine_version!=='3.9.1'||!Number.isFinite(checked)||checked>now+60000||now-checked>300000)throw Error('Pinned router identity or collection time is invalid');
  if(!Array.isArray(requested)||requested.length<2||requested.length>5||!requested.every(point)||!Array.isArray(data.requested_waypoints)||data.requested_waypoints.length!==requested.length||!requested.every((p,i)=>same(p,data.requested_waypoints[i]))||!Array.isArray(data.legs)||data.legs.length!==requested.length-1)throw Error('Pinned route waypoints differ from the request');
  const vertices=[],legs=[],waypoints=[],segments=[],references=[];let elapsed=0,metres=0,totalEdges=0,dataset=null;
  for(const [legIndex,probe] of data.legs.entries()){
    const trip=probe?.route?.trip,trace=probe?.trace_attributes,sourceLeg=trip?.legs?.[0],rawPoints=probe?.requests?.route?.locations;
    if(probe?.requests?.trace?.shape_match!=='edge_walk'||probe.requests.trace.encoded_polyline!==trace?.shape||probe?.requests?.route?.costing!=='auto')throw Error('Pinned evidence must come from an exact driving edge walk');
    if(probe?.schema!=='ventusiq-route-network-probe/1'||probe.graph_sha256!==expectedGraph||trip?.legs?.length!==1||trip?.status!==0||trip?.units!=='kilometers'||trace?.shape!==sourceLeg?.shape||!id(trace?.osm_changeset)||trace?.alternate_paths?.length||!Array.isArray(rawPoints)||rawPoints.length!==2||!same([rawPoints[0]?.lon,rawPoints[0]?.lat],requested[legIndex])||!same([rawPoints[1]?.lon,rawPoints[1]?.lat],requested[legIndex+1]))throw Error('Pinned route evidence is inconsistent');
    if(dataset!==null&&trace.osm_changeset!==dataset)throw Error('Pinned route legs use different datasets');dataset=trace.osm_changeset;
    const coords=decodePolyline6(trace.shape),edges=trace.edges,startVertex=vertices.length?vertices.length-1:0,startTime=elapsed,startDistance=metres;
    if(vertices.length&&!same(vertices.at(-1).coordinate,coords[0]))throw Error('Pinned route legs do not meet at the same snapped waypoint');
    if(!Array.isArray(edges)||!edges.length||(totalEdges+=edges.length)>50000||vertices.length+coords.length>50004)throw Error('Pinned edge capacity exceeded');
    const summary=sourceLeg.summary;if(!finite(summary?.time)||summary.time<=0||!finite(summary?.length)||summary.length<=0)throw Error('Pinned route timing is unavailable');
    let prior=null,previousTime=0,totalEdgeLength=0;const legRows=[];
    for(const [i,edge] of edges.entries()){
      const begin=edge.begin_shape_index,end=edge.end_shape_index,time=edge.end_node?.elapsed_time,from=Object.hasOwn(edge,'source_percent_along')?edge.source_percent_along:0,to=Object.hasOwn(edge,'target_percent_along')?edge.target_percent_along:1;
      if(![edge.id,edge.way_id,edge.node_id,edge.end_node?.node_id].every(id)||typeof edge.forward!=='boolean'||!Number.isInteger(begin)||!Number.isInteger(end)||begin<0||begin>=end||end>=coords.length||begin!==(prior?prior.end_shape_index:0)||(prior&&prior.end_node.node_id!==edge.node_id)||!finite(time)||time<previousTime||!finite(edge.length)||edge.length<0||!finite(from)||!finite(to)||from<0||from>to||to>1||!Array.isArray(edge.names??[])||(edge.names??[]).some(n=>typeof n!=='string'||n.length>500))throw Error('Pinned edge identity, timing or coverage is invalid');
      if(i>0&&from!==0||i<edges.length-1&&to!==1)throw Error('Interior pinned edges have partial coverage');
      const lengths=[];let geometric=0;for(let j=begin+1;j<=end;j++){const d=distance(coords[j-1],coords[j]);lengths.push(d);geometric+=d;}
      if(!geometric)throw Error('Pinned edge has no usable geometry');
      let covered=0;for(let j=begin+1;j<=end;j++){covered+=lengths[j-begin-1];legRows.push({coordinate:coords[j],elapsed:previousTime+(time-previousTime)*covered/geometric,distance:totalEdgeLength+edge.length*1000*covered/geometric});}
      segments.push({leg_index:legIndex,step_index:i,start_vertex:startVertex+begin,end_vertex:startVertex+end,source_start_vertex:startVertex+begin,source_end_vertex:startVertex+end,start_elapsed:startTime+previousTime,end_elapsed:startTime+time,name:(edge.names||[]).join(' / '),ref:'',source_labels:edge.names||[],mode:'driving',source:{edge_id:edge.id,names:edge.names||[]}});
      totalEdgeLength+=edge.length*1000;previousTime=time;prior=edge;
    }
    if(prior.end_shape_index!==coords.length-1||Math.abs(previousTime-summary.time)>.02||Math.abs(totalEdgeLength-summary.length*1000)>edges.length+1||totalEdgeLength<=0)throw Error('Pinned edge totals differ from the route');
    if(!vertices.length)vertices.push({coordinate:coords[0],elapsed:0,distance:0});
    vertices.push(...legRows.map(v=>({...v,elapsed:startTime+v.elapsed,distance:startDistance+v.distance})));
    elapsed+=previousTime;metres+=totalEdgeLength;legs.push({start_vertex:startVertex,end_vertex:vertices.length-1,duration:previousTime,distance:totalEdgeLength});
    for(const [index,coordinate] of [[legIndex,coords[0]],[legIndex+1,coords.at(-1)]]){const snap=distance(coordinate,requested[index]);if(snap>1000)throw Error('A waypoint is more than 1 km from a pinned road');waypoints[index]={coordinate,snap_distance:snap,name:''};}
    references.push({leg_index:legIndex,probe});
  }
  if(elapsed>86400||metres>2000000)throw Error('Routes must be shorter than 2,000 km and 24 hours.');
  const route={vertices,legs,waypoints,duration:elapsed,distance:metres,provider:'Pinned Valhalla / OpenStreetMap',data_source:'OpenStreetMap',method:PINNED_ROUTE_METHOD,source_checked_at:data.checked_at,
    timing_method:'Rounded native edge times and lengths, distributed by geometric distance within each edge; estimated turn time included; no live traffic',
    road_context:{status:'available',segments,unavailable_legs:[],data_version:expectedGraph,direction_verified:false},
    network_references:{kind:'pinned_valhalla',method:PINNED_ROUTE_METHOD,status:'retained',graph_sha256:expectedGraph,dataset_id:dataset,engine_version:data.engine_version,legs:references,agency_crosswalk_verified:false,direction_verified:false,closure_attribution_verified:false}};
  return {...route,sampling:sampleRoute(route)};
}
