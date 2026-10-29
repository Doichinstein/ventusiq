import {decodeBlosc} from './blosc-lz4.mjs';
import {hrrrURL,hrrrBytes,bytesHash,validateHrrrMetadata,hrrrCell,HRRR_METHOD} from './hrrr-reader.mjs';
import {smokePoint} from '../public/smoke-core.mjs';
import {HRRR_TEMPERATURE_METHOD} from '../public/hrrr-temperature-core.mjs';
export async function loadHrrrTemperature(point,catalog,fetcher=fetch,signal=AbortSignal.timeout(45000)){
  point=smokePoint(point.lat,point.lon);
  if(catalog.kind!=='temperature'||catalog.method!==HRRR_METHOD||catalog.source_url!==hrrrURL(Date.parse(catalog.issued_at),'temperature'))throw Error('Invalid HRRR temperature catalog');
  validateHrrrMetadata(catalog.metadata,'temperature');
  const cell=hrrrCell(point,catalog),source_url=catalog.source_url+'/2m_above_ground/TMP/'+cell.chunk;
  const bytes=await hrrrBytes(source_url,6000000,fetcher,signal);if(bytes[3]!==4)throw Error('HRRR temperature chunk precision disagrees with metadata');
  const decoded=decodeBlosc(bytes,48*150*150*4),view=new DataView(decoded.buffer,decoded.byteOffset,decoded.byteLength);
  const samples=Array.from({length:48},(_,i)=>{const raw=view.getFloat32((i*22500+cell.point_offset)*4,true);return {at:new Date(catalog.arrays.time[i]*3600000).toISOString(),lead_hours:catalog.arrays.forecast_period[i],raw_kelvin:Number.isFinite(raw)?raw:null};});
  return {method:HRRR_TEMPERATURE_METHOD,model:'NOAA HRRR',point,cell,issued_at:catalog.issued_at,source_url,chunk_sha256:await bytesHash(bytes),chunk_bytes:bytes.length,samples,raw_unit:'K',height_m:2,temporal_semantics:'instantaneous',metadata:catalog.metadata,array_hashes:catalog.array_hashes,selection:catalog.selection,provider:'University of Utah HRRR Zarr archive'};
}
