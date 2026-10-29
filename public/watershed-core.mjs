/* USGS NLDI point association and upstream basin evidence. Apache-2.0. */
import './weather-core.js';
import {distanceKm} from './hazards-core.mjs';
export const WATERSHED_METHOD='2026-10-29.1';
export const NLDI='https://api.water.usgs.gov/nldi';
export function watershedPoint(lat,lon){
  if(lat===null||lon===null||String(lat).trim()===''||String(lon).trim()==='')throw Error('Invalid watershed coordinates');
  lat=Number(lat);lon=Number(lon);if(!Number.isFinite(lat)||!Number.isFinite(lon)||lat<24||lat>50||lon< -125||lon> -66)throw Error('Invalid watershed point: this lookup currently supports the contiguous-US region (24–50°N, 125–66°W)');
  return {lat:Number(lat.toFixed(6)),lon:Number(lon.toFixed(6)),key:lat.toFixed(6)+','+lon.toFixed(6)};
}
const coordinate=p=>Array.isArray(p)&&p.length===2&&p.every(v=>typeof v==='number'&&Number.isFinite(v))&&Math.abs(p[0])<=180&&Math.abs(p[1])<=90;
const identifier=v=>{const id=String(v??'');if(!/^[1-9]\d{0,9}$/.test(id))throw Error('Invalid NLDI catchment identifier');return id;};
function collection(raw){if(raw?.type!=='FeatureCollection'||!Array.isArray(raw.features)||raw.features.length>10||raw.crs)throw Error('Invalid NLDI geographic response');return raw.features;}
export function watershedIndex(position,location,point){
  const features=collection(position);if(features.length!==1)throw Error('USGS did not identify one containing catchment');
  const flowline=features[0],p=flowline.properties,comid=identifier(p?.comid);
  if(p.source!=='comid'||identifier(p.identifier)!==comid||identifier(flowline.id)!==comid||flowline.geometry?.type!=='LineString'||!Array.isArray(flowline.geometry.coordinates)||flowline.geometry.coordinates.length<2||flowline.geometry.coordinates.length>10000||!flowline.geometry.coordinates.every(coordinate))throw Error('Invalid catchment flowline response');
  const locations=collection(location),indexed=locations.filter(f=>f.properties?.source==='indexed'&&f.properties?.type==='hydrolocation'),provided=locations.filter(f=>f.properties?.source==='provided');
  if(indexed.length!==1||provided.length!==1||locations.length!==2)throw Error('USGS did not return one indexed stream point');
  const index=indexed[0],input=provided[0];for(const f of [index,input])if(f.type!=='Feature'||f.geometry?.type!=='Point'||!coordinate(f.geometry.coordinates))throw Error('Invalid hydrolocation point');
  if(Math.abs(input.geometry.coordinates[0]-point.lon)>1e-7||Math.abs(input.geometry.coordinates[1]-point.lat)>1e-7)throw Error('Hydrolocation does not match the requested point');
  if(identifier(index.properties.comid)!==comid)throw Error('USGS catchment lookup and stream indexing disagree; watershed association is unresolved');
  const measure=index.properties.measure;if(typeof measure!=='number'||!Number.isFinite(measure)||measure<0||measure>100)throw Error('Invalid stream reference measure');
  const [lon,lat]=index.geometry.coordinates;
  return {comid,lat,lon,measure,reachcode:index.properties.reachcode||null,offset_m:distanceKm(point.lat,point.lon,lat,lon)*1000,flowline};
}
export function watershedGeometry(geometry){
  if(!geometry||!['Polygon','MultiPolygon'].includes(geometry.type)||!Array.isArray(geometry.coordinates))throw Error('Invalid watershed polygon');
  const polygons=geometry.type==='Polygon'?[geometry.coordinates]:geometry.coordinates;if(!polygons.length||polygons.length>2000)throw Error('Invalid watershed polygon count');
  let vertices=0,area=0;const bounds=[180,90,-180,-90],rad=Math.PI/180;
  for(const polygon of polygons){if(!Array.isArray(polygon)||!polygon.length)throw Error('Invalid watershed rings');let polygonArea=0;
    for(const [j,ring] of polygon.entries()){if(!Array.isArray(ring)||ring.length<4||!ring.every(coordinate)||ring[0][0]!==ring.at(-1)[0]||ring[0][1]!==ring.at(-1)[1])throw Error('Invalid or unclosed watershed ring');vertices+=ring.length;if(vertices>40000)throw Error('Watershed geometry exceeds the 40,000-vertex limit');let sum=0;
      for(let i=0;i<ring.length-1;i++){const a=ring[i],b=ring[i+1];if(Math.abs(b[0]-a[0])>180)throw Error('Unsupported watershed date-line geometry');sum+=(b[0]-a[0])*rad*(2+Math.sin(a[1]*rad)+Math.sin(b[1]*rad));bounds[0]=Math.min(bounds[0],a[0]);bounds[1]=Math.min(bounds[1],a[1]);bounds[2]=Math.max(bounds[2],a[0]);bounds[3]=Math.max(bounds[3],a[1]);}
      const ringArea=Math.abs(sum)*6371008.8**2/2;if(!ringArea)throw Error('Invalid zero-area watershed ring');polygonArea+=(j?-1:1)*ringArea;
    }if(polygonArea<=0)throw Error('Invalid watershed hole area');area+=polygonArea;
  }return {vertices,bounds,area_km2:area/1e6};
}
export function watershedResult(point,position,location,delineation){
  const index=watershedIndex(position,location,point),features=collection(delineation),catchments=features.filter(f=>f.id==='catchment'),basins=features.filter(f=>f.id==='drainageBasin'),splits=features.filter(f=>f.id==='splitCatchment');
  if(catchments.length!==1||basins.length>1||splits.length>1||features.some(f=>!['catchment','drainageBasin','splitCatchment'].includes(f.id))||features.some(f=>f.type!=='Feature'))throw Error('Invalid delineation feature identities');
  const catchment=catchments[0],basin=basins[0]||splits[0];if(!basin)throw Error('USGS did not return a contributing-area polygon');
  if(identifier(catchment.properties?.catchmentID)!==index.comid)throw Error('Delineation catchment differs from the selected network catchment');
  const shapes=features.map(f=>({id:f.id,...watershedGeometry(f.geometry)}));
  if(!globalThis.WeatherCore.contains(catchment.geometry,point.lat,point.lon))throw Error('The selected point is outside the returned catchment; association is unresolved');
  if(!globalThis.WeatherCore.contains(catchment.geometry,index.lat,index.lon))throw Error('The indexed stream point is outside the returned catchment; association is unresolved');
  return {method:WATERSHED_METHOD,provider:'USGS NLDI / NHDPlusV2',point,index:{...index,flowline:undefined},scope:basins.length?'upstream_basin':'local_split_only',place_in_basin:globalThis.WeatherCore.contains(basin.geometry,point.lat,point.lon),basin_feature_id:basin.id,shapes,issued_at:null,simplified:true,raw:{position,location,delineation},limitations:'Geographic drainage context for the indexed stream point. This is not a flood-inundation footprint, address-level flood forecast, travel-time prediction or proof that a nearby gauge is connected. Basin display geometry is simplified; local catchment geometry follows the provider. Small drainage features, storm sewers and infrastructure may not be represented.'};
}
export async function loadWatershed(point,fetcher=fetch,signal=AbortSignal.timeout(45000)){
  const requests=[];
  async function source(url,body=null){const response=await fetcher(url,{signal,redirect:'manual',headers:{Accept:'application/geo+json, application/json',...(body?{'Content-Type':'application/json'}:{})},...(body?{method:'POST',body:JSON.stringify(body)}:{})});if(!response.ok)throw Error('USGS watershed service returned HTTP '+response.status);
    const reader=response.body?.getReader();if(!reader)throw Error('USGS watershed response is empty');const decoder=new TextDecoder();let text='',bytes=0;for(;;){const {done,value}=await reader.read();if(done)break;bytes+=value.length;if(bytes>2000000){await reader.cancel();throw Error('USGS watershed response exceeds the 2 MB limit');}text+=decoder.decode(value,{stream:true});}text+=decoder.decode();requests.push({url,method:body?'POST':'GET',body,bytes});return JSON.parse(text);
  }
  const coords=encodeURIComponent(`POINT(${point.lon} ${point.lat})`),position=await source(NLDI+'/linked-data/comid/position?f=json&coords='+coords),location=await source(NLDI+'/linked-data/hydrolocation?f=json&coords='+coords),index=watershedIndex(position,location,point);
  // The deployed process currently accepts the typed input array shown in its machine schema.
  const body={inputs:Object.entries({lat:index.lat,lon:index.lon,upstream:true,simplified:true}).map(([id,value])=>({id,value:String(value),type:'text/plain'}))};
  const delineation=await source(NLDI+'/pygeoapi/processes/nldi-splitcatchment/execution?f=json',body);
  return {...watershedResult(point,position,location,delineation),requests};
}
export function watershedGeoJSON(report){
  return {type:'FeatureCollection',properties:{method:report.method,comid:report.index.comid,scope:report.scope,checked_at:report.checked_at||null,revision:report.revision||null,limitations:report.limitations},features:[...report.raw.delineation.features.map(f=>({...f,properties:{...f.properties,role:f.id}})),{...report.raw.position.features[0],properties:{...report.raw.position.features[0].properties,role:'associated_flowline'}},{type:'Feature',geometry:{type:'Point',coordinates:[report.point.lon,report.point.lat]},properties:{role:'selected_point'}},{type:'Feature',geometry:{type:'Point',coordinates:[report.index.lon,report.index.lat]},properties:{role:'indexed_stream_point',offset_m:report.index.offset_m}}]};
}
