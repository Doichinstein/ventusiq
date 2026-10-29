export const STATION_INVENTORY_PAGE_LIMIT=4;
const PAGE_SIZE=500;
// Follow only the NWS station cursor, preserving the requested state and page size.
function nextPage(raw,state){
  if(raw===undefined||raw===null)return null;
  if(typeof raw!=='string'||!raw||raw.length>4096)throw Error('Invalid station pagination');
  let url;try{url=new URL(raw);}catch{throw Error('Invalid station pagination');}
  const q=url.searchParams,states=[...q.getAll('state'),...q.getAll('state[0]')];
  if(url.origin!=='https://api.weather.gov'||url.pathname!=='/stations'||url.username||url.password||url.hash||
    [...q.keys()].some(k=>!['state','state[0]','limit','cursor'].includes(k))||states.length!==1||states[0]!==state||
    q.getAll('limit').length!==1||q.get('limit')!=='500'||q.getAll('cursor').length!==1||!q.get('cursor'))throw Error('Invalid station pagination');
  return 'https://api.weather.gov/stations?state='+state+'&limit=500&cursor='+encodeURIComponent(q.get('cursor'));
}
export async function loadEventStationInventory(state,source,signal){
  if(!/^[A-Z]{2}$/.test(state))throw Error('Invalid station state');
  const source_url='https://api.weather.gov/stations?state='+state+'&limit=500',features=[],pages=[],seen=new Set();let url=source_url,stop_reason='no_next_page';
  while(url&&pages.length<STATION_INVENTORY_PAGE_LIMIT){
    if(seen.has(url))throw Error('Repeated station pagination cursor');seen.add(url);
    const raw=await source(url,signal);
    if(raw?.type!=='FeatureCollection'||!Array.isArray(raw.features)||raw.features.length>PAGE_SIZE)throw Error('Invalid station inventory');
    const next=nextPage(raw.pagination?.next,state);
    if(next&&raw.features.length&&seen.has(next))throw Error('Repeated station pagination cursor');
    features.push(...raw.features);pages.push({source_url:url,feature_count:raw.features.length,pagination_next:raw.pagination?.next||null});
    // NWS can return a next cursor even after an empty terminal page.
    if(!raw.features.length){url=null;stop_reason='empty_page';break;}url=next;
  }
  return {features,state,source_url,pages,page_limit:STATION_INVENTORY_PAGE_LIMIT,inventory_method:'paginated-v1',truncated:!!url,stop_reason:url?'page_limit':stop_reason};
}
