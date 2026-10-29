import {NWPS,gaugeId} from './rivers-core.mjs';

export const RIVER_NETWORK_METHOD='2026-10-29.1';
const MAX_BYTES=262144,MAX_ROWS=1000;
export const riverNetworkURL=id=>NWPS+'/gauges/'+gaugeId(id)+'/riverflow';

export function normalizeRiverNetwork(raw,id){
  id=gaugeId(id);
  if(!raw||typeof raw.startingPoint?.LID!=='string'||!raw.startingPoint.LID||gaugeId(raw.startingPoint.LID)!==id)throw Error('NWPS river connections unavailable for this gauge');
  const groups={},audit={duplicates:0,self_references:0,conflicting_ids:[]};
  for(const direction of ['upstream','downstream']){
    const rows=raw[direction];if(!Array.isArray(rows)||rows.length>MAX_ROWS)throw Error('Incomplete or oversized river connection list');
    const unique=new Map();
    for(const row of rows){
      if(typeof row?.LID!=='string'||!row.LID||typeof row.Name!=='string'||row.Name.length>500)throw Error('Malformed river connection');
      const other=gaugeId(row.LID);
      if(other===id){audit.self_references++;continue;}
      if(unique.has(other)){audit.duplicates++;continue;}
      unique.set(other,{id:other,name:row.Name||other});
    }
    groups[direction]=unique;
  }
  const ambiguous=[];
  for(const [id,row] of groups.upstream)if(groups.downstream.has(id)){
    ambiguous.push(row);audit.conflicting_ids.push(id);groups.upstream.delete(id);groups.downstream.delete(id);
  }
  return {id,upstream:[...groups.upstream.values()],downstream:[...groups.downstream.values()],ambiguous,audit};
}

export async function loadRiverNetwork(id,fetcher=fetch,signal=AbortSignal.timeout(45000)){
  id=gaugeId(id);const source_url=riverNetworkURL(id),response=await fetcher(source_url,{signal,headers:{Accept:'application/json'}});
  if(!response.ok)throw Error('NWPS river connections returned HTTP '+response.status);
  if(response.redirected||Number(response.headers.get('content-length'))>MAX_BYTES)throw Error('Unexpected or oversized river connection response');
  if(!response.body)throw Error('Empty river connection response');
  const reader=response.body.getReader(),chunks=[];let length=0;
  try{while(true){const {done,value}=await reader.read();if(done)break;length+=value.byteLength;if(length>MAX_BYTES)throw Error('Oversized river connection response');chunks.push(value);}}
  finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
  const bytes=new Uint8Array(length);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
  const raw=JSON.parse(new TextDecoder().decode(bytes)),network=normalizeRiverNetwork(raw,id);
  return {method:RIVER_NETWORK_METHOD,...network,raw,source:'NOAA / NWPS riverflow',source_url,data_kind:'provider-gauge-associations',issued_at:null};
}

export function riverNetworkView(product,id,now=Date.now()){
  if(product?.method!==RIVER_NETWORK_METHOD||product.id!==gaugeId(id))throw Error('River connection response does not match the selected gauge');
  const network=normalizeRiverNetwork(product.raw,id),checked=Date.parse(product.checked_at);
  return {...network,delayed:!!product.stale||!!product.error||!Number.isFinite(checked)||now-checked>1350000||now-checked< -60000};
}
