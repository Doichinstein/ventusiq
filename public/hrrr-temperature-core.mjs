import {smokePoint} from './smoke-core.mjs';
export const HRRR_TEMPERATURE_METHOD='2026-10-29.1';
const HOUR=3600000,stamp=v=>typeof v==='string'&&/(Z|[+-]\d\d:\d\d)$/.test(v)?Date.parse(v):NaN;
export function hrrrTemperatureView(product,place,now=Date.now()){
  if(product?.method!==HRRR_TEMPERATURE_METHOD||product.model!=='NOAA HRRR'||product.raw_unit!=='K'||product.height_m!==2||product.temporal_semantics!=='instantaneous'||!Array.isArray(product.samples)||product.samples.length>48)throw Error('Unsupported HRRR temperature product');
  const point=smokePoint(place?.lat,place?.lon),issued=stamp(product.issued_at),checked=stamp(product.checked_at),cell=product.cell;
  if(point.lat!==product.point?.lat||point.lon!==product.point?.lon)throw Error('HRRR temperature belongs to another point');
  if(!Number.isFinite(issued)||issued%(6*HOUR)||issued>now||!cell||![cell.lat,cell.lon,cell.projection_distance_m].every(Number.isFinite))throw Error('Invalid HRRR run or grid');
  const recent=!product.stale&&!product.error&&now-issued<=18*HOUR&&Number.isFinite(checked)&&now-checked>=-60000&&now-checked<=1.5*HOUR;
  const start=Math.ceil(now/HOUR)*HOUR,rows=Array.from({length:48},(_,i)=>{
    const at=start+i*HOUR,matches=product.samples.filter(s=>stamp(s.at)===at),s=matches.length===1?matches[0]:null;
    const timing=s&&Number.isInteger(s.lead_hours)&&s.lead_hours>=1&&s.lead_hours<=48&&issued+s.lead_hours*HOUR===at;
    const kelvin=timing&&typeof s.raw_kelvin==='number'&&Number.isFinite(s.raw_kelvin)&&s.raw_kelvin>=180&&s.raw_kelvin<=340?s.raw_kelvin:null;
    return {at:new Date(at).toISOString(),lead_hours:(at-issued)/HOUR,temperature_f:kelvin===null?null:(kelvin-273.15)*9/5+32,raw_kelvin:kelvin,reason:kelvin!==null?null:matches.length>1?'Conflicting samples':!s?'Outside the selected run or missing sample':!timing?'Run and valid time disagree':'Missing or implausible temperature'};
  });
  return {method:HRRR_TEMPERATURE_METHOD,evaluated_at:new Date(now).toISOString(),point,issued_at:product.issued_at,checked_at:product.checked_at,run_age_hours:(now-issued)/HOUR,collection_recent:recent,cell,unit:'°F',rows,available_hours:rows.filter(r=>r.temperature_f!==null).length,expected_hours:48,evidence:product,interpretation:'Instantaneous 2 m temperature from one identified HRRR run at a nearby grid cell. This is model guidance, not station observations, ensemble spread or calibrated confidence. Gaps remain unknown.'};
}
