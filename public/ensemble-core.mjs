export const ENSEMBLE_METHOD='2026-10-28.1',ENSEMBLE_MODEL='gfs025',ENSEMBLE_MEMBERS=31;
export const ENSEMBLE_SOURCE='https://ensemble-api.open-meteo.com/v1/ensemble';
export const ENSEMBLE_VARIABLES={temperature:{field:'temperature_2m',unit:'°F',source_unit:'°F',min:-200,max:180},wind:{field:'wind_speed_10m',unit:'mph',source_unit:'mp/h',min:0,max:250}};
export function ensemblePoint(lat,lon){if(lat===null||lon===null||String(lat).trim()===''||String(lon).trim()==='')throw Error('Invalid coordinates');lat=Number(lat);lon=Number(lon);if(!Number.isFinite(lat)||!Number.isFinite(lon)||Math.abs(lat)>90||Math.abs(lon)>180)throw Error('Invalid coordinates');lat=Math.round(lat*4)/4;lon=Math.round(lon*4)/4;if(lon===180)lon=-180;return {lat,lon,key:lat+','+lon};}
export function ensembleURL(point){const p=ensemblePoint(point.lat,point.lon);return ENSEMBLE_SOURCE+'?'+new URLSearchParams({latitude:p.lat,longitude:p.lon,hourly:'temperature_2m,wind_speed_10m',models:ENSEMBLE_MODEL,forecast_days:'4',temperature_unit:'fahrenheit',wind_speed_unit:'mph',timeformat:'unixtime',timezone:'GMT',elevation:'nan',cell_selection:'nearest'});}
const memberKey=(field,i)=>field+(i?'_member'+String(i).padStart(2,'0'):'');
export function validateEnsemble(raw,point){
  if(!raw||Array.isArray(raw)||raw.error)throw Error('Ensemble source returned an invalid product');
  if(!Number.isFinite(raw.latitude)||!Number.isFinite(raw.longitude)||Math.abs(raw.latitude)>90||Math.abs(raw.longitude)>180||Math.abs(raw.latitude-point.lat)>.26||Math.min(Math.abs(raw.longitude-point.lon),360-Math.abs(raw.longitude-point.lon))>.26)throw Error('Ensemble grid does not match the requested cell');
  if(raw.utc_offset_seconds!==0||raw.hourly_units?.time!=='unixtime')throw Error('Ensemble timestamps must be UTC epoch seconds');
  const times=raw.hourly?.time;if(!Array.isArray(times)||!times.length||times.length>120||times.some((t,i)=>!Number.isSafeInteger(t)||t<=0||t%3600!==0||(i&&t<=times[i-1])))throw Error('Ensemble timestamps are invalid, duplicated or unordered');
  if(!Object.keys(raw.hourly).some(k=>k.startsWith('temperature_2m')||k.startsWith('wind_speed_10m')))throw Error('No ensemble members supplied');
  for(const v of Object.values(ENSEMBLE_VARIABLES)){
    const allowed=new Set(Array.from({length:31},(_,i)=>memberKey(v.field,i)));for(const key of Object.keys(raw.hourly))if(key.startsWith(v.field)&&!allowed.has(key))throw Error('Unexpected ensemble member identity');
    for(const key of allowed){if(raw.hourly[key]===undefined)continue;if(!Array.isArray(raw.hourly[key])||raw.hourly[key].length!==times.length||raw.hourly_units[key]!==v.source_unit)throw Error('Ensemble member units or lengths changed');}
  }return raw;
}
function quantile(sorted,p){const at=(sorted.length-1)*p,lo=Math.floor(at),fraction=at-lo;return sorted[lo]+fraction*(sorted[Math.ceil(at)]-sorted[lo]);}
export function ensembleSpread(product,{metric='temperature',threshold=null,now=Date.now()}={}){
  if(product?.method!==ENSEMBLE_METHOD||product.model!==ENSEMBLE_MODEL)throw Error('Unsupported ensemble product');const v=ENSEMBLE_VARIABLES[metric];if(!v)throw Error('Invalid ensemble metric');
  if(threshold!==null&&(!Number.isFinite(threshold)||threshold<v.min||threshold>v.max))throw Error('Threshold is outside the supported range');
  const raw=validateEnsemble(product.raw,product.point),byTime=new Map(raw.hourly.time.map((t,i)=>[t*1000,i])),start=Math.ceil(now/10800000)*10800000;
  const checked=Date.parse(product.checked_at),collection_recent=!product.stale&&!product.error&&Number.isFinite(checked)&&now-checked>=-60000&&now-checked<=7*3600000;
  const rows=Array.from({length:24},(_,i)=>{const at=start+i*10800000,index=byTime.get(at),members=Array.from({length:31},(_,member)=>{const value=index===undefined?null:raw.hourly[memberKey(v.field,member)]?.[index];return {member,value:typeof value==='number'&&Number.isFinite(value)&&value>=v.min&&value<=v.max?value:null};}),valid=members.filter(m=>m.value!==null),values=valid.map(m=>m.value).sort((a,b)=>a-b),complete=values.length===31;
    return {at:new Date(at).toISOString(),members,valid_members:values.length,expected_members:31,complete,min:complete?values[0]:null,max:complete?values.at(-1):null,p10:complete?quantile(values,.1):null,median:complete?quantile(values,.5):null,p90:complete?quantile(values,.9):null,threshold_count:threshold===null?null:valid.filter(m=>metric==='temperature'?m.value<=threshold:m.value>=threshold).length,threshold_total:values.length,reason:complete?null:index===undefined?'No source timestamp':'Missing, invalid or unavailable members'};});
  return {method:ENSEMBLE_METHOD,model:ENSEMBLE_MODEL,metric,unit:v.unit,point:product.point,returned_grid:{lat:raw.latitude,lon:raw.longitude,elevation:raw.elevation??null},evaluated_at:new Date(now).toISOString(),issued_at:null,checked_at:product.checked_at,collection_recent,model_freshness:'unknown: source response does not identify model initialization',source_processed:true,threshold,threshold_operator:metric==='temperature'?'at_or_below':'at_or_above',rows,complete_rows:rows.filter(r=>r.complete).length,expected_rows:24,revision:product.revision||null,evidence:product};
}
