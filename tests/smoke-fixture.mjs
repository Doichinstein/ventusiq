import {SMOKE_METHOD} from '../public/smoke-core.mjs';
export function smokeFixture(now,point={lat:39,lon:-77}){
  const hour=3600000,start=Math.floor(now/hour)*hour-hour,issued=start-16*hour;
  const rasters=Array.from({length:16},(_,i)=>({objectid:i+1,idp_subset:'conus',idp_issueddate:issued,idp_validtime:start+i*hour}));
  return {method:SMOKE_METHOD,point,issued_at:new Date(issued).toISOString(),checked_at:new Date(now).toISOString(),revision:'smoke-fixture',raw_unit:'kg/m³',conversion_factor:1e9,temporal_semantics:'instantaneous',rasters,samples:rasters.map(a=>({rasterId:a.objectid,attributes:a,value:'0.000000012',location:{x:point.lon,y:point.lat,spatialReference:{wkid:4326}}}))};
}
