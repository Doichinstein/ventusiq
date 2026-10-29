import {test} from 'node:test';
import assert from 'node:assert/strict';
import {smokeMapTimeline,smokeFrameRequest,smokeRenderingRule,loadSmokeFrame,SMOKE_BANDS} from '../public/smoke-map-core.mjs';
const issue=Date.parse('2026-10-28T03:00:00Z'),now=issue+7.5*3600000;
const raster=(i=8,id=i+1)=>({objectid:id,idp_subset:'conus',idp_issueddate:issue,idp_validtime:issue+i*3600000});
const catalog=()=>({checked_at:new Date(now).toISOString(),features:[8,9,11].map(i=>({attributes:raster(i)}))});
function png(width=1024,height=600){const b=new Uint8Array(24);b.set([137,80,78,71,13,10,26,10]);new DataView(b.buffer).setUint32(16,width);new DataView(b.buffer).setUint32(20,height);return b;}
test('timeline pins one run, includes explicit gaps and never fills them from an older run',()=>{
 const c=catalog();c.features.push({attributes:{...raster(10,100),idp_issueddate:issue-86400000}});const t=smokeMapTimeline(c,now);assert.equal(t.frames.length,48);assert.equal(t.frames[0].at,'2026-10-28T11:00:00.000Z');assert.equal(t.frames[2].raster,null);assert.equal(t.frames[3].raster.objectid,12);assert.equal(t.frames.at(-1).raster,null);assert.equal(t.fresh,true);
 assert.equal(smokeMapTimeline({...c,stale:true},now).fresh,false);assert.equal(smokeMapTimeline({...c,checked_at:new Date(now-2*3600000).toISOString()},now).fresh,false);assert.equal(smokeMapTimeline(c,issue+31*3600000).fresh,false);
 c.features.push({attributes:raster(8,999)});assert.throws(()=>smokeMapTimeline(c,now),/Conflicting/);
});
test('map requests lock the exact raster, run and valid time with explicit projection and bounded size',()=>{
 const t=smokeMapTimeline(catalog(),now),r=smokeFrameRequest(t.frames[0],t.issued_at),u=new URL(r.url),m=JSON.parse(u.searchParams.get('mosaicRule'));
 assert.deepEqual(m.lockRasterIds,[9]);assert.match(m.where,/idp_issueddate=timestamp '2026-10-28 03:00:00'/);assert.match(m.where,/idp_validtime=timestamp '2026-10-28 11:00:00'/);assert.equal(u.searchParams.get('bboxSR'),'3857');assert.equal(u.searchParams.get('imageSR'),'3857');assert.equal(u.searchParams.get('adjustAspectRatio'),'false');assert.equal(u.searchParams.get('size'),'1024,600');assert.equal(u.searchParams.get('interpolation'),'RSP_NearestNeighbor');
 assert.throws(()=>smokeFrameRequest(t.frames[2],t.issued_at),/No matching/);assert.throws(()=>smokeFrameRequest({...t.frames[0],at:t.frames[1].at},t.issued_at),/No matching/);
});
test('renderer scales raw floating values before integer classification and preserves unmatched NoData',()=>{
 const r=smokeRenderingRule(),remap=r.rasterFunctionArguments.Raster,scale=remap.rasterFunctionArguments.Raster;
 assert.equal(scale.rasterFunction,'Arithmetic');assert.equal(scale.rasterFunctionArguments.Operation,3);assert.equal(scale.rasterFunctionArguments.Raster2,1e9);assert.equal(scale.outputPixelType,'F32');assert.equal(remap.rasterFunctionArguments.AllowUnmatched,false);
 assert.deepEqual(remap.rasterFunctionArguments.InputRanges,[0,1,1,5,5,15,15,40,40,100,100,1000000]);assert.deepEqual(r.rasterFunctionArguments.Colormap,SMOKE_BANDS.map((b,i)=>[i+1,...b.color]));
});
test('frame loader checks live identity before accepting only a bounded PNG with exact dimensions',async()=>{
 const t=smokeMapTimeline(catalog(),now),frame=t.frames[0],calls=[];
 const fetcher=async(url,options)=>{calls.push(url);assert.equal(options.redirect,'error');return url.includes('/query?')?Response.json({features:[{attributes:frame.raster}]}):new Response(png(),{headers:{'Content-Type':'image/png'}});};
 const result=await loadSmokeFrame(frame,t.issued_at,fetcher);assert.equal(result.blob.type,'image/png');assert.equal(result.raster_id,9);assert.equal(calls.length,2);
 for(const data of [{features:[]},{features:[{attributes:{...frame.raster,idp_validtime:issue}}]},{features:[{attributes:frame.raster}],exceededTransferLimit:true}]){
 let n=0;await assert.rejects(loadSmokeFrame(frame,t.issued_at,async()=>{n++;return Response.json(data);}),/changed or expired/);assert.equal(n,1);
 }
 for(const response of [()=>Response.json({error:'unavailable'}),()=>new Response('not a PNG',{headers:{'Content-Type':'image/png'}}),()=>new Response(png(800),{headers:{'Content-Type':'image/png'}}),()=>new Response(new Uint8Array(5*1024*1024+1),{headers:{'Content-Type':'image/png'}})]){
 await assert.rejects(loadSmokeFrame(frame,t.issued_at,async url=>url.includes('/query?')?Response.json({features:[{attributes:frame.raster}]}):response()),/unavailable|unexpected|size limit/);
 }
});
