import {SMOKE_SOURCE,SMOKE_METHOD,selectSmokeRun} from './smoke-core.mjs';
export const SMOKE_MAP_METHOD='2026-10-28.1';
export const SMOKE_MAP_BOUNDS=[[24,-125],[50,-66]];
export const SMOKE_BANDS=[
  {min:0,max:1,color:[156,163,175]}, {min:1,max:5,color:[56,189,248]},
  {min:5,max:15,color:[139,92,246]}, {min:15,max:40,color:[251,146,60]},
  {min:40,max:100,color:[244,114,182]}, {min:100,max:1000000,color:[190,24,93]},
];
const HOUR=3600000;
export function smokeMapTimeline(catalog,now=Date.now()){
  const run=selectSmokeRun(catalog,now),first=Math.ceil(now/HOUR)*HOUR;
  const issueAge=now-Date.parse(run.issued_at),checkAge=now-Date.parse(catalog.checked_at);
  return {method:SMOKE_MAP_METHOD,source_method:SMOKE_METHOD,issued_at:run.issued_at,checked_at:catalog.checked_at,revision:catalog.revision||null,
    fresh:!catalog.stale&&!catalog.error&&issueAge>=0&&issueAge<=30*HOUR&&checkAge>=-60000&&checkAge<=1.5*HOUR,
    frames:Array.from({length:48},(_,i)=>{const at=first+i*HOUR,raster=run.rasters.find(r=>r.idp_validtime===at);return {at:new Date(at).toISOString(),raster:raster||null};}),evidence:catalog};
}
// Scale raw kg/m³ as F32 before integer classification; tiny raw cutoffs can be rounded by Remap.
// Explicit concentration bands avoid the provider's undocumented default colour scale.
export function smokeRenderingRule(){return {rasterFunction:'Colormap',rasterFunctionArguments:{Colormap:SMOKE_BANDS.map((b,i)=>[i+1,...b.color]),Raster:{rasterFunction:'Remap',rasterFunctionArguments:{InputRanges:SMOKE_BANDS.flatMap(b=>[b.min,b.max]),OutputValues:SMOKE_BANDS.map((_,i)=>i+1),AllowUnmatched:false,Raster:{rasterFunction:'Arithmetic',rasterFunctionArguments:{Raster:'$$',Raster2:1e9,Operation:3},outputPixelType:'F32'}},outputPixelType:'U8'}},outputPixelType:'U8'};}
export function smokeFrameRequest(frame,issued){
  const r=frame?.raster,issue=Date.parse(issued),valid=Date.parse(frame?.at);
  if(!r||!Number.isSafeInteger(r.objectid)||r.objectid<=0||r.idp_subset!=='conus'||r.idp_issueddate!==issue||r.idp_validtime!==valid||!Number.isFinite(issue)||valid<issue||valid>issue+51*HOUR)throw Error('No matching raster for this forecast hour');
  const project=([lat,lon])=>[6378137*lon*Math.PI/180,6378137*Math.log(Math.tan(Math.PI/4+lat*Math.PI/360))];
  const bbox=[...project(SMOKE_MAP_BOUNDS[0]),...project(SMOKE_MAP_BOUNDS[1])];
  const stamp=n=>new Date(n).toISOString().slice(0,19).replace('T',' ');
  const where=`objectid=${r.objectid} AND idp_subset='conus' AND idp_issueddate=timestamp '${stamp(issue)}' AND idp_validtime=timestamp '${stamp(valid)}'`;
  const params={f:'image',bbox:bbox.join(','),bboxSR:'3857',imageSR:'3857',size:'1024,600',adjustAspectRatio:'false',format:'png32',interpolation:'RSP_NearestNeighbor',
    mosaicRule:JSON.stringify({mosaicMethod:'esriMosaicLockRaster',lockRasterIds:[r.objectid],where,mosaicOperation:'MT_FIRST'}),renderingRule:JSON.stringify(smokeRenderingRule())};
  return {url:SMOKE_SOURCE+'/exportImage?'+new URLSearchParams(params),bounds:SMOKE_MAP_BOUNDS,width:1024,height:600,raster_id:r.objectid,issued_at:issued,valid_at:frame.at,where};
}
export async function loadSmokeFrame(frame,issued,fetcher=fetch,signal=AbortSignal.timeout(25000)){
  const request=smokeFrameRequest(frame,issued);
  // Catalog IDs are provider-managed. Check their time/subset before every uncached image.
  const metadata=await fetcher(SMOKE_SOURCE+'/query?'+new URLSearchParams({f:'json',where:request.where,outFields:'objectid,idp_subset,idp_issueddate,idp_validtime',returnGeometry:'false'}),{signal,redirect:'error'});
  if(!metadata.ok)throw Error('Smoke frame metadata is unavailable');const data=await metadata.json();
  const a=data.features?.[0]?.attributes,r=frame.raster;
  if(data.error||data.exceededTransferLimit||data.features?.length!==1||!a||['objectid','idp_subset','idp_issueddate','idp_validtime'].some(k=>a[k]!==r[k]))throw Error('Smoke frame changed or expired at the source; refresh the run');
  const response=await fetcher(request.url,{signal,redirect:'error'});
  if(!response.ok||!response.headers.get('Content-Type')?.toLowerCase().startsWith('image/png'))throw Error('Smoke image unavailable; coverage is unknown');
  const reader=response.body?.getReader();if(!reader)throw Error('Smoke image is empty');const chunks=[];let length=0;
  for(;;){const {done,value}=await reader.read();if(done)break;length+=value.length;if(length>5*1024*1024){await reader.cancel();throw Error('Smoke image exceeds the size limit');}chunks.push(value);}
  const blob=new Blob(chunks,{type:'image/png'}),head=new Uint8Array(await blob.slice(0,24).arrayBuffer());
  const view=new DataView(head.buffer);if(head.length<24||![137,80,78,71,13,10,26,10].every((v,i)=>head[i]===v)||view.getUint32(16)!==request.width||view.getUint32(20)!==request.height)throw Error('Smoke image has an unexpected format or extent');
  return {...request,blob};
}
