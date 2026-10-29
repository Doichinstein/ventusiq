import {GEOS_BASE,GEOS_COLLECTION,GEOS_FIELDS,GEOS_METHOD,geosMetadata,geosAxis,geosCell,geosView} from '../public/geos-cf-core.mjs';
async function read(url,fetcher,signal){
  if(!url.startsWith(GEOS_BASE))throw Error('Untrusted GEOS-CF URL');
  const response=await fetcher(url,{signal,redirect:'manual'});if(!response.ok)throw Object.assign(Error('NASA GEOS-CF returned HTTP '+response.status),{status:response.status,retryAfter:response.headers.get('Retry-After')});
  const reader=response.body?.getReader();if(!reader)throw Error('Empty GEOS-CF response');const decoder=new TextDecoder();let text='',bytes=0;for(;;){const {done,value}=await reader.read();if(done)break;bytes+=value.length;if(bytes>16384){await reader.cancel();throw Error('GEOS-CF response exceeds 16 KB');}text+=decoder.decode(value,{stream:true});}return text+decoder.decode();
}
export async function loadGeosCF(lat,lon,fetcher=fetch,signal=AbortSignal.timeout(45000),now=Date.now()){
  const cell=geosCell(lat,lon),latest=geosMetadata(await read(GEOS_BASE+GEOS_COLLECTION+'.latest.das',fetcher,signal));
  const metadata=await read(latest.source_url+'.das',fetcher,signal),meta=geosMetadata(metadata);
  if(meta.run!==latest.run||meta.first>now+3600000||meta.last+1800000<=now)throw Error('NASA GEOS-CF has no usable current forecast run');
  const axis=await read(meta.source_url+'.ascii?time[0:1:119]',fetcher,signal);geosAxis(axis);
  const first_index=Math.max(0,Math.floor((now-(meta.first-1800000))/3600000)),count=Math.min(49,120-first_index),series={},source_urls={};
  const keys=Object.keys(GEOS_FIELDS);
  // Two requests at a time: each field reads up to 49 hourly source granules.
  for(let i=0;i<keys.length;i+=2)await Promise.all(keys.slice(i,i+2).map(async key=>{const url=meta.source_url+'.ascii?'+key+`[${first_index}:1:${first_index+count-1}][0:1:0][${cell.y}:1:${cell.y}][${cell.x}:1:${cell.x}]`;source_urls[key]=url;series[key]=await read(url,fetcher,signal);}));
  const product={method:GEOS_METHOD,model:'geos_cf_v2',provider:'NASA GMAO GEOS-CF v2 via NCCS',kind:'forecast',point:cell.point,grid:cell.grid,initialized_at:meta.initialized_at,issued_at:null,source_url:meta.source_url,source_urls,first_index,count,raw:{metadata,axis,series},definition:'Hourly interval averages in the bottom model layer (72), on a 0.25-degree grid. PM at RH 35% includes water; gases are dry-air mole fractions converted to ppb. Not AQI, smoke-only, monitor readings, personal exposure, or regulatory guidance.'};
  geosView(product,cell.point,now);return product;
}
