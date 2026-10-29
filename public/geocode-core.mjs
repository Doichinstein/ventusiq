/* Census address lookup contracts. Apache-2.0. */
export const GEOCODER='https://geocoding.geo.census.gov/geocoder/locations/onelineaddress';
export const GEOCODE_METHOD='2026-10-29.1';
export const GEOCODE_LIMITS='Census coordinates are approximated along street address ranges, not verified building or parcel locations. A match does not prove that a structure exists. Review the point before using weather or watershed results.';
export function addressQuery(value){
  if(typeof value!=='string'||/[\u0000-\u001f\u007f]/.test(value))throw Error('Enter a single-line street address.');
  const query=value.trim().replace(/ +/g,' ');if(query.length<5||query.length>100)throw Error('Use a street address between 5 and 100 characters.');
  return query;
}
const text=(v,max)=>typeof v==='string'&&v.trim().length>0&&v.length<=max&&!/[\u0000-\u001f\u007f]/.test(v);
export function geocodeResult(raw,query){
  query=addressQuery(query);const result=raw?.result,benchmark=result?.input?.benchmark,matches=result?.addressMatches;
  if(result?.input?.address?.address!==query||benchmark?.benchmarkName!=='Public_AR_Current'||!text(benchmark?.id,20)||!Array.isArray(matches)||matches.length>20)throw Error('Census returned an unexpected address response.');
  const seen=new Set(),normalized=[];
  for(const match of matches){const lat=match?.coordinates?.y,lon=match?.coordinates?.x,line=match?.tigerLine;
    if(!text(match?.matchedAddress,300)||typeof lat!=='number'||!Number.isFinite(lat)||lat< -90||lat>90||typeof lon!=='number'||!Number.isFinite(lon)||lon< -180||lon>180||!text(line?.tigerLineId,30)||!/^\d+$/.test(line.tigerLineId)||!['L','R'].includes(line?.side))throw Error('Census returned an invalid address match.');
    const key=JSON.stringify([match.matchedAddress,lat,lon,line.tigerLineId,line.side]);if(seen.has(key))continue;seen.add(key);
    normalized.push({address:match.matchedAddress,lat,lon,tiger_line_id:line.tigerLineId,side:line.side});
  }
  return {method:GEOCODE_METHOD,provider:'US Census Bureau',source_url:GEOCODER,query,benchmark:{id:benchmark.id,name:benchmark.benchmarkName},matches:normalized,issued_at:null,limitations:GEOCODE_LIMITS,raw};
}
export async function lookupAddress(query,fetcher=fetch,signal=AbortSignal.timeout(20000)){
  query=addressQuery(query);const url=new URL(GEOCODER);url.search=new URLSearchParams({address:query,benchmark:'Public_AR_Current',format:'json'}).toString();
  const response=await fetcher(url.href,{signal,redirect:'manual',headers:{Accept:'application/json'}});if(!response.ok)throw Error('Census geocoder returned HTTP '+response.status);
  const reader=response.body?.getReader();if(!reader)throw Error('Census returned an empty response.');let content='',size=0;const decoder=new TextDecoder();
  for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>262144){await reader.cancel();throw Error('Census response exceeds the size limit.');}content+=decoder.decode(value,{stream:true});}content+=decoder.decode();
  return geocodeResult(JSON.parse(content),query);
}
