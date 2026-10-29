/* Run-identified NOAA GEFS via dynamical.org. Apache-2.0. */
export const GEFS_RUN_METHOD='2026-10-29.3';
export const GEFS_RUN_PRODUCT='noaa-gefs-forecast-35-day';
export const GEFS_RUN_URL='https://api.dynamical.org/v1/forecasts';
const variables={temperature_2m:'degree_Celsius',wind_u_10m:'m s-1',wind_v_10m:'m s-1'};
export function gefsRunQuery(point){return {queries:[{dataProductId:GEFS_RUN_PRODUCT,location:{latitude:point.lat,longitude:point.lon},maxLeadTimeHours:120,variables:Object.keys(variables)}]};}
const finite=v=>typeof v==='number'&&Number.isFinite(v);
const timestamp=t=>typeof t==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(t)?Date.parse(t):NaN;
export function normalizeGEFSRun(raw,point,now=Date.now()){
  if(!Array.isArray(raw?.results)||raw.results.length!==1)throw Error('Expected one GEFS run response');
  const r=raw.results[0],p=r.point?.selected,q=r.point?.requested;
  if(r.dataProduct?.id!==GEFS_RUN_PRODUCT||typeof r.dataProduct.version!=='string'||!/^\d+\.\d+\.\d+$/.test(r.dataProduct.version)||!/[A-Z0-9]{20}/.test(r.snapshotId||'')||r.snapshotId.length!==20)throw Error('Unidentified GEFS archive product or snapshot');
  if(r.point?.method!=='nearest'||!p||!q||q.latitude!==point.lat||q.longitude!==point.lon||!finite(p.latitude)||!finite(p.longitude)||Math.abs(p.latitude)>90||Math.abs(p.longitude)>180||Math.abs(p.latitude-point.lat)>.125001||Math.min(Math.abs(p.longitude-point.lon),360-Math.abs(p.longitude-point.lon))>.125001||!Number.isInteger(p.grid?.latitudeIndex)||!Number.isInteger(p.grid?.longitudeIndex)||p.grid.latitudeIndex!==(90-p.latitude)*4||p.grid.longitudeIndex!==(p.longitude+180)*4)throw Error('GEFS run grid does not match the requested cell');
  for(const [name,unit] of Object.entries(variables))if(r.variables?.[name]?.unit!==unit)throw Error('GEFS run variable units changed');
  if(!Array.isArray(r.forecasts)||r.forecasts.length!==1)throw Error('Expected one identified GEFS initialization');
  const run=r.forecasts[0],init=timestamp(run.initTime),times=run.validTimes,leads=run.leadTimeHours;
  if(!Number.isFinite(init)||init%86400000!==0||init>now+60000)throw Error('Invalid or future GEFS daily initialization');
  if(!Array.isArray(times)||!times.length||times.length>41||!Array.isArray(leads)||times.length!==leads.length||leads.some((h,i)=>!Number.isInteger(h)||h<0||h>120||h%3!==0||(i&&h<=leads[i-1])||timestamp(times[i])!==init+h*3600000))throw Error('GEFS run valid times and lead hours disagree');
  if(!Array.isArray(run.ensembleMembers)||run.ensembleMembers.length>31)throw Error('Invalid GEFS member collection');
  const hourly={time:times.map(t=>timestamp(t)/1000)},hourly_units={time:'unixtime'},seen=new Set();
  for(const m of run.ensembleMembers){
    if(!Number.isInteger(m.member)||m.member<0||m.member>30||seen.has(m.member)||!m.data)throw Error('Duplicate or invalid GEFS member identity');seen.add(m.member);
    for(const field of Object.keys(variables))if(m.data[field]!==undefined&&(!Array.isArray(m.data[field])||m.data[field].length!==times.length))throw Error('GEFS member series length changed');
    const suffix=m.member?'_member'+String(m.member).padStart(2,'0'):'';
    hourly['temperature_2m'+suffix]=times.map((_,i)=>{const v=m.data.temperature_2m?.[i];return finite(v)&&v>=-129&&v<=83?v*9/5+32:null;});
    hourly['wind_speed_10m'+suffix]=times.map((_,i)=>{const u=m.data.wind_u_10m?.[i],v=m.data.wind_v_10m?.[i];return finite(u)&&finite(v)&&Math.abs(u)<=112&&Math.abs(v)<=112?Math.hypot(u,v)*2.2369362920544:null;});
    hourly_units['temperature_2m'+suffix]='°F';hourly_units['wind_speed_10m'+suffix]='mp/h';
  }
  return {latitude:p.latitude,longitude:p.longitude,utc_offset_seconds:0,hourly,hourly_units,initialization_at:new Date(init).toISOString(),snapshot_id:r.snapshotId,archive_version:r.dataProduct.version};
}
