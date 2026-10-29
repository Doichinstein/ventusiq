/* Original router references for inspection, not an agency/network crosswalk. Apache-2.0. */
export const ROUTE_NETWORK_METHOD='2026-10-29.1';
export function routeNetwork(raw,route){
  const result={method:ROUTE_NETWORK_METHOD,status:'unavailable',legs:[],unavailable_legs:[],
    data_version:typeof raw?.data_version==='string'&&raw.data_version.length<=500?raw.data_version:null,
    coordinate_identity_verified:false,agency_crosswalk_verified:false,direction_verified:false,
    closure_attribution_verified:false};
  for(const [i,leg] of route.legs.entries()){
    const ids=raw.routes[0].legs[i].annotation?.nodes,count=leg.end_vertex-leg.start_vertex+1;
    if(!Array.isArray(ids)||ids.length<2||ids.length>50000||!ids.every(n=>Number.isSafeInteger(n)&&n>0)){
      result.unavailable_legs.push({leg_index:i,reason:'Router node IDs missing, invalid or beyond capacity'});continue;
    }
    // Keep original driving geometry with the annotation. Planned stops insert
    // vertices elsewhere and must never shift this source record's positions.
    const coordinates=route.vertices.slice(leg.start_vertex,leg.end_vertex+1).map(v=>v.coordinate.slice(0,2));
    const aligned=ids.length===count,positions=new Map(),conflicts=new Set();
    if(aligned)for(let n=1;n<ids.length-1;n++){
      const position=coordinates[n].join(',');
      if(positions.has(ids[n])&&positions.get(ids[n])!==position)conflicts.add(ids[n]);
      else positions.set(ids[n],position);
    }
    result.legs.push({leg_index:i,node_ids:ids.slice(),geometry_coordinates:coordinates,
      counts_match:aligned,repeated_ids_at_distinct_interior_positions:aligned?[...conflicts]:null,
      endpoint_coordinate_identity_verified:false});
  }
  result.status=result.legs.length?(result.unavailable_legs.length?'partial':'retained'):'unavailable';
  return result;
}

export function networkExplanation(context,totalLegs){
  if(!context?.legs?.length)return 'Router network references are unavailable; agency-to-road matching remains unverified.';
  const conflicts=context.legs.reduce((n,l)=>n+(l.repeated_ids_at_distinct_interior_positions?.length||0),0),mismatches=context.legs.filter(l=>!l.counts_match).length;
  return `Original router node references and driving geometry for ${context.legs.length}/${totalLegs} legs are retained in the JSON export. `+
    (conflicts?`${conflicts} repeated-ID conflicts occur at distinct interior geometry positions. `:'')+
    (mismatches?`${mismatches} legs have different node and coordinate counts. `:'')+
    'These references do not verify coordinate identity, carriageway, signed direction or an agency closure match. Snapped endpoints may lie partway along an edge.';
}
