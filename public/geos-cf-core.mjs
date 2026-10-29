import {airPoint} from './air-forecast-core.mjs';
export const GEOS_METHOD='2026-10-29.1';
export const GEOS_COLLECTION='aqc_tavg_1hr_glo_L1440x721_slv';
export const GEOS_BASE='https://opendap.nccs.nasa.gov/dods/gmao/geos-cf/v2/fcst/';
export const GEOS_FIELDS=Object.freeze({pm25_rh35:{label:'PM2.5 at RH 35%',unit:'µg/m³',factor:1},pm10_rh35:{label:'PM10 at RH 35%',unit:'µg/m³',factor:1},o3:{label:'Ozone',unit:'ppb',factor:1e9},no2:{label:'Nitrogen dioxide',unit:'ppb',factor:1e9},so2:{label:'Sulfur dioxide',unit:'ppb',factor:1e9},co:{label:'Carbon monoxide',unit:'ppb',factor:1e9}});
const HOUR=3600000;
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
function block(text,name){const matches=[...text.matchAll(new RegExp('(?:^|\\n)\\s*'+name+' \\{([^}]+)\\}','g'))];if(matches.length!==1)throw Error('Invalid GEOS-CF metadata: '+name);return matches[0][1];}
function attr(text,name){const m=text.match(new RegExp('(?:String|Float32|Float64) '+name+' ([^;]+);'));if(!m)throw Error('Missing GEOS-CF attribute: '+name);return m[1].trim().replace(/^"|"$/g,'');}
function gradsTime(text){const m=/^(\d{2}):(\d{2})z(\d{2})(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)(\d{4})$/.exec(text);if(!m)throw Error('Invalid GEOS-CF calendar label');const month=['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'].indexOf(m[4]),t=Date.UTC(+m[5],month,+m[3],+m[1],+m[2]);const d=new Date(t);if(d.getUTCFullYear()!==+m[5]||d.getUTCMonth()!==month||d.getUTCDate()!==+m[3]||d.getUTCHours()!==+m[1]||d.getUTCMinutes()!==+m[2])throw Error('Invalid GEOS-CF calendar date');return t;}
export function geosMetadata(text){
  if(typeof text!=='string'||text.length>16000||!text.includes('GEOS-CF (Composition Forecast)'))throw Error('Invalid GEOS-CF metadata');
  for(const [key,size,min,max,unit] of [['lat',721,-90,90,'degrees_north'],['lon',1440,-180,179.75,'degrees_east']]){const b=block(text,key);if(+attr(b,'grads_size')!==size||+attr(b,'minimum')!==min||+attr(b,'maximum')!==max||+attr(b,'resolution')!==.25||attr(b,'units')!==unit)throw Error('Unsupported GEOS-CF grid');}
  const t=block(text,'time'),first=gradsTime(attr(t,'grads_min')),last=gradsTime(attr(t,'maximum'));
  if(attr(t,'units')!=='days since 1-1-1 00:00:0.0'||attr(t,'grads_step')!=='60mn'||+attr(t,'grads_size')!==120||last-first!==119*HOUR||new Date(first).toISOString().slice(11,16)!=='09:30')throw Error('Unsupported GEOS-CF time axis');
  const lev=block(text,'lev');if(+attr(lev,'minimum')!==72||+attr(lev,'maximum')!==72)throw Error('Unsupported GEOS-CF surface layer');
  for(const [key,f] of Object.entries(GEOS_FIELDS)){const b=block(text,key);if(+attr(b,'_FillValue')!==1e15||+attr(b,'missing_value')!==1e15||!attr(b,'long_name').includes(f.factor===1?'(ug m-3)':'(mol mol-1)'))throw Error('Unsupported GEOS-CF pollutant units');}
  const initialized_at=new Date(first-HOUR/2).toISOString(),run=initialized_at.slice(0,10).replaceAll('-','')+'_09z';
  return {first,last,initialized_at,run,source_url:GEOS_BASE+GEOS_COLLECTION+'/'+GEOS_COLLECTION+'.'+run};
}
export function geosCell(lat,lon){const point=airPoint(lat,lon),y=Math.round((point.lat+90)*4),x=((Math.round((point.lon+180)*4)%1440)+1440)%1440;return {point,grid:{lat:y/4-90,lon:x/4-180},y,x};}
function numbers(line,count){const parts=line.split(',').map(s=>s.trim());if(parts.length!==count||parts.some(s=>!s||!/^[-+]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][-+]?\d+)?$/.test(s)))throw Error('Invalid GEOS-CF numeric axis');const a=parts.map(Number);if(a.some(n=>!Number.isFinite(n)))throw Error('Invalid GEOS-CF axis value');return a;}
export function geosAxis(text){const lines=text.trim().split(/\r?\n/).map(s=>s.trim()).filter(Boolean);if(lines.length!==2||lines[0]!=='time, [120]')throw Error('Invalid GEOS-CF time coordinate response');const axis=numbers(lines[1],120);if(axis[0]<=0||Math.abs((axis[0]%1)-9.5/24)>1e-8)throw Error('Invalid GEOS-CF time origin');return axis;}
export function geosSeries(text,key,axis,first,count,grid){
  const lines=text.trim().split(/\r?\n/).map(s=>s.trim()).filter(Boolean);
  if(!Object.hasOwn(GEOS_FIELDS,key)||lines[0]!==`${key}, [${count}][1][1][1]`||lines.length!==count+9)throw Error('Invalid GEOS-CF point response');
  const values=lines.slice(1,count+1).map((line,i)=>{const prefix=`[${i}][0][0], `;if(!line.startsWith(prefix))throw Error('Invalid GEOS-CF sample index');const raw=line.slice(prefix.length);if(!/^(?:[-+]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][-+]?\d+)?|NaN|Infinity|-Infinity)$/.test(raw))throw Error('Invalid GEOS-CF sample');const value=Number(raw);return Number.isFinite(value)&&value>=0&&value<1e14?value:null;});
  const tail=lines.slice(count+1);if(tail[0]!==`time, [${count}]`||tail[2]!=='lev, [1]'||tail[4]!=='lat, [1]'||tail[6]!=='lon, [1]'||!same(numbers(tail[3],1),[72])||!same(numbers(tail[5],1),[grid.lat])||!same(numbers(tail[7],1),[grid.lon]))throw Error('GEOS-CF coordinate association failed');
  const times=numbers(tail[1],count);return {values:values.map((v,i)=>Math.abs(times[i]-axis[0]-(first+i)/24)<=1e-8&&Math.abs(axis[first+i]-axis[0]-(first+i)/24)<=1e-8?v:null),reasons:values.map((v,i)=>Math.abs(times[i]-axis[0]-(first+i)/24)>1e-8||Math.abs(axis[first+i]-axis[0]-(first+i)/24)>1e-8?'Source time coordinate does not match named-run hour':v===null?'Missing or invalid concentration':null)};
}
export function geosView(product,place,now=Date.now()){
  const {point,grid}=geosCell(place?.lat,place?.lon),meta=geosMetadata(product?.raw?.metadata),axis=geosAxis(product.raw.axis),first=product.first_index,count=product.count;
  if(product.method!==GEOS_METHOD||product.model!=='geos_cf_v2'||!same(product.point,point)||!same(product.grid,grid)||product.source_url!==meta.source_url||product.initialized_at!==meta.initialized_at||!Number.isInteger(first)||first<0||!Number.isInteger(count)||count<1||count>49||first+count>120)throw Error('GEOS-CF forecast identity or coverage mismatch');
  const fields=Object.fromEntries(Object.keys(GEOS_FIELDS).map(key=>[key,geosSeries(product.raw.series[key],key,axis,first,count,grid)]));
  const rows=Array.from({length:count},(_,i)=>{const at=meta.first+(first+i)*HOUR;return {at:new Date(at).toISOString(),start:new Date(at-HOUR/2).toISOString(),end:new Date(at+HOUR/2).toISOString(),lead_hours:first+i+.5,quality:Object.fromEntries(Object.keys(GEOS_FIELDS).map(key=>[key,fields[key].reasons[i]])),...Object.fromEntries(Object.entries(GEOS_FIELDS).map(([key,f])=>[key,fields[key].values[i]===null?null:fields[key].values[i]*f.factor]))};});
  const checked=Date.parse(product.checked_at),run_age_hours=(now-Date.parse(meta.initialized_at))/HOUR;
  return {rows,point,grid,initialized_at:meta.initialized_at,checked_at:product.checked_at||null,run_age_hours,run_delayed:run_age_hours>36,collection_recent:!product.stale&&!product.error&&Number.isFinite(checked)&&checked<=now+60000&&now-checked<=90*60000,units:Object.fromEntries(Object.entries(GEOS_FIELDS).map(([key,f])=>[key,f.unit]))};
}
