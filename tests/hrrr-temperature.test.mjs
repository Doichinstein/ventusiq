import {test} from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {loadHrrrCatalog,validateHrrrMetadata} from '../lib/hrrr-reader.mjs';
import {loadHrrrTemperature} from '../lib/hrrr-temperature-reader.mjs';
import {hrrrTemperatureView} from '../public/hrrr-temperature-core.mjs';
import {HrrrService} from '../lib/hrrr-service.mjs';import {WeatherService} from '../lib/weather-service.mjs';import {database} from './fixtures/push.mjs';
import {fakeHrrr,hrrrNow,hrrrIssued} from './fixtures/hrrr.mjs';
const metadata=JSON.parse(readFileSync(new URL('./fixtures/hrrr-temperature-metadata.json',import.meta.url),'utf8'));
function source(){const base=fakeHrrr();let broken=false,calls=0;return {get calls(){return calls;},fail(){broken=true;},fetcher:async(url,options)=>{calls++;if(broken)return new Response('down',{status:503});if(url.endsWith('/.zmetadata'))return Response.json(metadata);if(/\/TMP\/0\.\d+\.\d+$/.test(url)){
  const count=48*150*150,bytes=new Uint8Array(16+count*4),v=new DataView(bytes.buffer);bytes.set([2,1,35,4]);v.setUint32(4,count*4,true);v.setUint32(8,count*4,true);v.setUint32(12,bytes.length,true);for(let i=0;i<count;i++)v.setFloat32(16+i*4,273.15+i%17,true);return new Response(bytes);
}return base.fetcher(url,options);}};}
function product(){return {method:'2026-10-29.1',model:'NOAA HRRR',point:{lat:39,lon:-77},cell:{lat:38.99566,lon:-76.99582,projection_distance_m:603},issued_at:new Date(hrrrIssued).toISOString(),checked_at:new Date(hrrrNow).toISOString(),raw_unit:'K',height_m:2,temporal_semantics:'instantaneous',samples:Array.from({length:48},(_,i)=>({at:new Date(hrrrIssued+(i+1)*3600000).toISOString(),lead_hours:i+1,raw_kelvin:273.15}))};}
test('temperature reader uses actual f32 Kelvin metadata, a bounded chunk and identified lead times',async()=>{
  const s=source(),catalog=await loadHrrrCatalog(s.fetcher,undefined,hrrrNow,'temperature'),p=await loadHrrrTemperature({lat:39,lon:-77},catalog,s.fetcher);
  assert.match(p.source_url,/2m_above_ground\/TMP\/2m_above_ground\/TMP\/0\.4\.9$/);assert.equal(p.samples.length,48);assert.equal(p.raw_unit,'K');assert.equal(p.height_m,2);
  assert.equal(p.samples[0].raw_kelvin,Math.fround(273.15+2085%17));assert.equal(p.issued_at,new Date(hrrrIssued).toISOString());assert.match(p.chunk_sha256,/^[a-f0-9]{64}$/);
  await assert.rejects(loadHrrrTemperature({lat:39,lon:-77},{...catalog,kind:'smoke'},s.fetcher),/catalog/);
  for(const edit of [m=>m['2m_above_ground/TMP/.zattrs'].units='C',m=>m['2m_above_ground/TMP/.zarray'].dtype='<f2',m=>m['2m_above_ground/TMP/.zattrs'].GRIB_PARAM[3]=1]){const changed=structuredClone(metadata);edit(changed.metadata);assert.throws(()=>validateHrrrMetadata(changed,'temperature'));}
});
test('temperature display preserves run lead, Kelvin conversion and missing horizon without treating delayed output as current',()=>{
  const p=product(),r=hrrrTemperatureView(p,p.point,hrrrNow);assert.equal(r.rows[0].lead_hours,3);assert.equal(r.rows[0].temperature_f,32);assert.equal(r.available_hours,46);assert.equal(r.rows[47].temperature_f,null);assert.equal(r.collection_recent,true);
  assert.equal(hrrrTemperatureView({...p,stale:true},p.point,hrrrNow).collection_recent,false);
  assert.equal(hrrrTemperatureView(p,p.point,hrrrNow+19*3600000).collection_recent,false);
  for(const mutate of [q=>q.samples[2].raw_kelvin=-9999,q=>q.samples[2].raw_kelvin=400,q=>q.samples[2].raw_kelvin='273.15',q=>q.samples[2].lead_hours=4,q=>q.samples.splice(10,1,{...q.samples[2]})]){
    const q=structuredClone(p);mutate(q);assert.equal(hrrrTemperatureView(q,q.point,hrrrNow).rows[0].temperature_f,null);
  }
  assert.throws(()=>hrrrTemperatureView(p,{lat:40,lon:-77},hrrrNow),/another point/);assert.throws(()=>hrrrTemperatureView({...p,issued_at:new Date(hrrrNow+3600000).toISOString()},p.point,hrrrNow),/run or grid/);
});
test('temperature and smoke share request/day budgets but retain independent data caches and last-good products',async()=>{
  const db=database(),s=source();let now=hrrrNow/1000;const w=new WeatherService(db,{clock:()=>now,fetcher:s.fetcher}),service=new HrrrService(w);
  try{const p=await service.forecast(39,-77,'temperature'),count=s.calls;await service.forecast(39.001,-77.001,'temperature');assert.equal(s.calls,count);
    assert.equal((await w.state('hazards/hrrr-point/39,-77')).name,undefined);await assert.rejects(service.forecast(39,-77),/busy/);assert.equal(s.calls,count);
    now+=3601;s.fail();const old=await service.forecast(39,-77,'temperature');assert.equal(old.revision,p.revision);assert.equal(old.stale,true);assert.match(old.error,/503/);
    await assert.rejects(service.forecast(39,-77,'wind'),/Unsupported/);
  }finally{db.close();}
});

export {product};
