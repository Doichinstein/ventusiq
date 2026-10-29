import {stationDistance} from './station-history-core.mjs';
export const FIRMS_METHOD='2026-10-29.1';
export const FIRMS_REGIONS={
  conus:{label:'Contiguous US and Hawaii',file:'USA_contiguous_and_Hawaii'},
  alaska:{label:'Alaska',file:'Alaska'},
};
const HEADER='latitude,longitude,bright_ti4,scan,track,acq_date,acq_time,satellite,confidence,version,bright_ti5,frp,daynight';
const number=value=>typeof value==='string'&&/^[+-]?\d+(\.\d+)?$/.test(value)?Number(value):null;
const measured=(value,min,max)=>{const n=number(value);return n!==null&&n>=min&&n<=max?n:null;};
export function firmsURL(region){if(!Object.hasOwn(FIRMS_REGIONS,region)){const e=Error('Invalid FIRMS region');e.status=400;throw e;}return `https://firms.modaps.eosdis.nasa.gov/data/active_fire/noaa-20-viirs-c2/csv/J1_VIIRS_C2_${FIRMS_REGIONS[region].file}_24h.csv`;}
export function parseFirms(csv,checkedAt){
  if(typeof csv!=='string'||csv.length>2*1024*1024||!Number.isFinite(checkedAt))throw Error('Invalid FIRMS source');
  const lines=csv.replace(/^\uFEFF/,'').trimEnd().split(/\r?\n/);if(lines.shift()!==HEADER||lines.length>10000)throw Error('Unexpected FIRMS CSV schema or size');
  const columns=HEADER.split(','),groups=new Map(),features=[],audit={returned:lines.length,invalid:0,future:0,duplicates:0,conflicting:0};
  for(const line of lines){const fields=line.split(',');if(fields.length!==columns.length||fields.some(s=>s.length>60||/["\r\n]/.test(s)))throw Error('Malformed FIRMS CSV row');
    const r=Object.fromEntries(columns.map((c,i)=>[c,fields[i]])),lat=number(r.latitude),lon=number(r.longitude);
    const hhmm=r.acq_time.padStart(4,'0'),observed=`${r.acq_date}T${hhmm.slice(0,2)}:${hhmm.slice(2)}:00.000Z`,at=Date.parse(observed);
    const confidence=new Map([['l','low'],['n','nominal'],['h','high'],['low','low'],['nominal','nominal'],['high','high']]).get(r.confidence);
    if(lat===null||lon===null||Math.abs(lat)>90||Math.abs(lon)>180||!/^\d{4}-\d{2}-\d{2}$/.test(r.acq_date)||!/^\d{1,4}$/.test(r.acq_time)||!Number.isFinite(at)||new Date(at).toISOString()!==observed||r.satellite!=='N20'||r.version!=='2.0NRT'||!confidence||!['D','N'].includes(r.daynight)){audit.invalid++;continue;}
    if(at>checkedAt){audit.future++;continue;}
    const id=`N20/${observed}/${lat}/${lon}`,group=groups.get(id)||[];group.push({line,r,lat,lon,observed,confidence});groups.set(id,group);
  }
  for(const [id,group] of groups){if(group.some(row=>row.line!==group[0].line)){audit.conflicting+=group.length;continue;}audit.duplicates+=group.length-1;const {r,lat,lon,observed,confidence}=group[0];
    features.push({type:'Feature',id,geometry:{type:'Point',coordinates:[lon,lat]},properties:{observed_at:observed,confidence,daynight:r.daynight,version:r.version,satellite:r.satellite,frp_mw:measured(r.frp,0,1000000),brightness_i4_k:measured(r.bright_ti4,0.01,10000),brightness_i5_k:measured(r.bright_ti5,0.01,10000),scan_km:measured(r.scan,0.001,20),track_km:measured(r.track,0.001,20),raw:r}});
  }
  if(lines.length&&!features.length)throw Error('FIRMS response has no usable rows; coverage is unknown');
  return {type:'FeatureCollection',features,audit};
}
export async function loadFirms(region,fetcher=fetch,signal=AbortSignal.timeout(45000),clock=Date.now){
  const source_url=firmsURL(region),response=await fetcher(source_url,{signal,redirect:'manual',headers:{Accept:'text/csv'}});
  if(!response.ok)throw Error('NASA FIRMS returned HTTP '+response.status);
  const reader=response.body?.getReader();if(!reader)throw Error('Missing FIRMS response body');let size=0;const chunks=[];
  for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>2*1024*1024){await reader.cancel();throw Error('FIRMS response exceeds 2 MiB limit');}chunks.push(value);}
  const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
  const raw_csv=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(bytes),at=clock();
  const source_sha256=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(b=>b.toString(16).padStart(2,'0')).join('');
  return {...parseFirms(raw_csv,at),method:FIRMS_METHOD,region,source:'NASA FIRMS · NOAA-20 VIIRS Collection 2 NRT',source_url,source_sha256,raw_csv,retrieved_at:new Date(at).toISOString(),updated:null};
}
export function selectFirms(data,{hours=24,confidence='all',place=null,near=false,now=Date.now()}={}){
  if(![6,24].includes(hours)||!['all','nominal-high','high'].includes(confidence))throw Error('Invalid FIRMS filter');
  if(near&&(!place||!Number.isFinite(place.lat)||!Number.isFinite(place.lon)))return [];
  return data.features.filter(f=>{const p=f.properties,at=Date.parse(p.observed_at);return at<=now&&at>=now-hours*3600000&&(confidence==='all'||confidence==='high'&&p.confidence==='high'||confidence==='nominal-high'&&p.confidence!=='low');})
    .map(f=>({...f,distance_km:place?stationDistance(place,{lat:f.geometry.coordinates[1],lon:f.geometry.coordinates[0]}):null}))
    .filter(f=>!near||f.distance_km<=100).sort((a,b)=>near?a.distance_km-b.distance_km||a.id.localeCompare(b.id):Date.parse(b.properties.observed_at)-Date.parse(a.properties.observed_at)||a.id.localeCompare(b.id));
}
