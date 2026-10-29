export const STATION_HISTORY_METHOD='2026-10-29.1';
export const STATION_CATALOG='https://www.ncei.noaa.gov/pub/data/noaa/isd-history.csv';
export const STATION_DATA='https://www.ncei.noaa.gov/access/services/data/v1';
export class StationInputError extends Error{constructor(message){super(message);this.status=400;}}
export function historicalDate(value,now=Date.now()){
  const at=typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)?Date.parse(value+'T00:00:00Z'):NaN;
  if(!Number.isFinite(at)||new Date(at).toISOString().slice(0,10)!==value||value<'1929-01-01'||at>Math.floor(now/86400000)*86400000-7*86400000)throw new StationInputError('Choose a real date from 1929 through seven days ago');
  return at;
}
export function historyPoint(lat,lon){if(lat===null||lon===null||String(lat).trim()===''||String(lon).trim()===''||!Number.isFinite(+lat)||!Number.isFinite(+lon)||Math.abs(+lat)>90||Math.abs(+lon)>180)throw new StationInputError('Valid coordinates are required');return {lat:+lat,lon:+lon};}
// Preserve quoted commas and doubled quotes; malformed CSV must never become an empty catalog.
export function stationCSV(text){
  const rows=[];let row=[],field='',quoted=false,closed=false;
  for(let i=0;i<=text.length;i++){const c=i===text.length?'\n':text[i];if(quoted){if(c==='"'){if(text[i+1]==='"'){field+='"';i++;}else{quoted=false;closed=true;}}else field+=c;}else if(c==='"'&&!field&&!closed)quoted=true;else if(c===','||c==='\n'){row.push(field);field='';closed=false;if(c==='\n'){if(row.some(Boolean))rows.push(row);row=[];}}else if(c==='\r'&&text[i+1]==='\n')continue;else{if(closed||c==='"')throw Error('Malformed NOAA station CSV');field+=c;}if(field.length>256||row.length>12||rows.length>50000)throw Error('NOAA station catalog exceeds limits');}
  if(quoted)throw Error('Unclosed NOAA station CSV field');
  const header=['USAF','WBAN','STATION NAME','CTRY','STATE','ICAO','LAT','LON','ELEV(M)','BEGIN','END'];if(JSON.stringify(rows.shift())!==JSON.stringify(header))throw Error('Unexpected NOAA station catalog columns');
  return rows.filter(r=>r[3]==='US');
}
const numeric=s=>typeof s==='string'&&s.trim()!==''&&/^[+-]?\d+(\.\d+)?$/.test(s.trim())?Number(s):null;
export function catalogStations(raw){
  if(!Array.isArray(raw)||raw.length>15000)throw Error('Invalid station catalog');const groups=new Map(),stations=[];let invalid=0,conflicting=0;
  for(const row of raw){const [usaf,wban,name,country,state,icao,lat,lon,elevation,begin,end]=row;
    if(row.length!==11||!/^\d{6}$/.test(usaf)||!/^\d{5}$/.test(wban)||country!=='US'||!name||numeric(lat)===null||numeric(lon)===null||Math.abs(+lat)>90||Math.abs(+lon)>180||!/^\d{8}$/.test(begin)||!/^\d{8}$/.test(end)||begin>end){invalid++;continue;}
    const id=usaf+wban,list=groups.get(id)||[];list.push(row);groups.set(id,list);
  }
  for(const [id,rows] of groups){if(rows.some(r=>JSON.stringify(r)!==JSON.stringify(rows[0]))){conflicting+=rows.length;continue;}const r=rows[0],date=s=>s.slice(0,4)+'-'+s.slice(4,6)+'-'+s.slice(6);stations.push({id,name:r[2],state:r[4],icao:r[5],lat:+r[6],lon:+r[7],elevation_m:numeric(r[8]),begin:date(r[9]),end:date(r[10])});}
  if(!stations.length)throw Error('NOAA catalog has no usable US stations');return {stations,audit:{returned:raw.length,invalid,conflicting}};
}
export function stationDistance(a,b){const rad=Math.PI/180,dlat=(b.lat-a.lat)*rad,dlon=(b.lon-a.lon)*rad,h=Math.sin(dlat/2)**2+Math.cos(a.lat*rad)*Math.cos(b.lat*rad)*Math.sin(dlon/2)**2;return 6371*2*Math.asin(Math.sqrt(Math.min(1,h)));}
export function nearbyHistorical(stations,point,date){const end=new Date(Date.parse(date+'T00:00:00Z')+86400000).toISOString().slice(0,10);return stations.filter(s=>s.begin<=date&&s.end>=end).map(s=>({...s,distance_km:stationDistance(point,s)})).filter(s=>s.distance_km<=100).sort((a,b)=>a.distance_km-b.distance_km||a.id.localeCompare(b.id)).slice(0,10);}
export const PRECIP_FLAGS={A:'One 6-hour report',B:'Two 6-hour reports',C:'Three 6-hour reports',D:'Four 6-hour reports',E:'One 12-hour report',F:'Two 12-hour reports',G:'One 24-hour report',H:'Zero reported with precipitation occurrence; incomplete',I:'No precipitation data reported; occurrence remains unknown'};
function value(raw,key,sentinel,min,max){const n=numeric(raw[key]);return n===null||n===sentinel||n<min||n>max?null:n;}
const attribute=(raw,key)=>typeof raw[key]==='string'&&raw[key].length<=20?raw[key]:null;
export function stationDays(raw,id,date){
  if(!Array.isArray(raw)||raw.length>10)throw Error('Invalid NOAA daily station response');const dates=[date,new Date(Date.parse(date+'T00:00:00Z')+86400000).toISOString().slice(0,10)],rows=[],audit={returned:raw.length,foreign:0,duplicates:0,conflicting:0};
  if(raw.some(r=>!r||typeof r!=='object'||Array.isArray(r)))throw Error('Invalid NOAA daily station row');
  audit.foreign=raw.filter(r=>r.STATION!==id||!dates.includes(r.DATE)).length;
  for(const day of dates){const found=raw.filter(r=>r.STATION===id&&r.DATE===day);if(!found.length){rows.push({date:day,available:false});continue;}if(found.some(r=>JSON.stringify(r)!==JSON.stringify(found[0]))){audit.conflicting+=found.length;rows.push({date:day,available:false,reason:'Conflicting source rows'});continue;}audit.duplicates+=found.length-1;const r=found[0],flag=attribute(r,'PRCP_ATTRIBUTES')?.trim()??null;
    rows.push({date:day,available:true,mean_f:value(r,'TEMP',9999.9,-150,150),high_f:value(r,'MAX',9999.9,-150,150),low_f:value(r,'MIN',9999.9,-150,150),wind_knots:value(r,'WDSP',999.9,0,300),gust_knots:value(r,'GUST',999.9,0,300),precip_inches:flag==='I'?null:value(r,'PRCP',99.99,0,99.98),precip_flag:flag,precip_description:PRECIP_FLAGS[flag]||'Unknown reporting period/flag',high_attribute:attribute(r,'MAX_ATTRIBUTES'),low_attribute:attribute(r,'MIN_ATTRIBUTES'),temperature_count:attribute(r,'TEMP_ATTRIBUTES'),wind_count:attribute(r,'WDSP_ATTRIBUTES'),occurrence_flags:typeof r.FRSHTT==='string'&&/^[01]{6}$/.test(r.FRSHTT)?r.FRSHTT:null});
  }return {rows,audit};
}
export async function stationText(url,limit,fetcher,signal){
  const response=await fetcher(url,{signal,redirect:'manual',headers:{Accept:'application/json, text/csv'}});if(!response.ok)throw Error('NOAA station archive returned HTTP '+response.status);const reader=response.body?.getReader();if(!reader)throw Error('Missing station response body');const chunks=[];let size=0;for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>limit){await reader.cancel();throw Error('NOAA station response exceeds size limit');}chunks.push(value);}const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}return new TextDecoder('utf-8',{fatal:true}).decode(bytes);
}
