/* Public fire and air-quality adapters shared by hosted and static editions. Apache-2.0. */
export const SOURCES={
  fires:'https://services3.arcgis.com/T4QMspbfLg3qTGWY/arcgis/rest/services/WFIGS_Incident_Locations_Current/FeatureServer/0',
  perimeters:'https://services3.arcgis.com/T4QMspbfLg3qTGWY/arcgis/rest/services/WFIGS_Interagency_Perimeters/FeatureServer/0',
  air:'https://services.arcgis.com/cJ9YHowT8TU7DUyn/arcgis/rest/services/Air_Now_Current_Monitors_PM25/FeatureServer/0',
  aqi:'https://services.arcgis.com/cJ9YHowT8TU7DUyn/ArcGIS/rest/services/AirNowLatestContoursPM25/FeatureServer/0',
  airHistory:'https://services.arcgis.com/cJ9YHowT8TU7DUyn/ArcGIS/rest/services/Air_Now_Monitors_PM25/FeatureServer/0',
  satellite:'https://gibs.earthdata.nasa.gov/wmts/epsg4326/best/1.0.0/WMTSCapabilities.xml',
};
export const SATELLITE_LAYER='VIIRS_NOAA20_Thermal_Anomalies_375m_All';
const finite=n=>typeof n==='number'&&Number.isFinite(n)?n:null;
const nonnegative=n=>finite(n)!==null&&n>=0?n:null;
export const stamp=n=>finite(n)!==null&&n>0&&Number.isFinite(new Date(n).getTime())?new Date(n).toISOString():null;
export function validPoint(g){return g?.type==='Point'&&Array.isArray(g.coordinates)&&g.coordinates.length>=2&&Number.isFinite(g.coordinates[0])&&Number.isFinite(g.coordinates[1])&&Math.abs(g.coordinates[0])<=180&&Math.abs(g.coordinates[1])<=90;}
export function incidentId(value){const id=String(value||'').replace(/[{}]/g,'').toLowerCase();if(!/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(id))throw new Error('Invalid incident identifier');return id;}
export async function sourceFetch(url,signal,fetcher=fetch){
  const parsed=new URL(url);
  if(!Object.values(SOURCES).some(base=>url===base||url.startsWith(base+'?')||url.startsWith(base+'/query?')))throw new Error('Untrusted hazard source URL');
  if(parsed.protocol!=='https:')throw new Error('Untrusted hazard source URL');
  const response=await fetcher(url,{signal,headers:{Accept:url===SOURCES.satellite?'application/xml':'application/json'}});
  if(!response.ok)throw new Error(`Source returned HTTP ${response.status}`);
  if(url===SOURCES.satellite)return response.text();
  const data=await response.json();if(data.error)throw new Error('Source rejected the query');return data;
}
export async function arcgis(base,{fields='*',where='1=1',idField='OBJECTID',maxAllowableOffset=null}={},fetcher=fetch,signal=AbortSignal.timeout(45000)){
  const metadata=await sourceFetch(base+'?f=json',signal,fetcher),features=[],seen=new Set();
  for(let page=0;page<20;page++){
    const query=new URLSearchParams({f:'geojson',where,outFields:fields,outSR:'4326',returnGeometry:'true',orderByFields:idField,resultRecordCount:'2000',resultOffset:String(features.length),geometryPrecision:'5'});
    if(maxAllowableOffset!==null)query.set('maxAllowableOffset',String(maxAllowableOffset));
    const data=await sourceFetch(base+'/query?'+query,signal,fetcher);
    if(data.type!=='FeatureCollection'||!Array.isArray(data.features))throw new Error('Invalid geographic source response');
    for(const f of data.features){if(f?.type!=='Feature'||!f.properties)throw new Error('Invalid source feature');const id=f.id??f.properties[idField];if(id===undefined||seen.has(String(id)))throw new Error('Source pagination returned duplicate or missing identifiers');seen.add(String(id));features.push(f);}
    if(!data.properties?.exceededTransferLimit&&!data.exceededTransferLimit)return {type:'FeatureCollection',features,updated:stamp(metadata.editingInfo?.lastEditDate),source_url:base};
    if(!data.features.length)throw new Error('Incomplete source pagination');
  }
  throw new Error('Source pagination exceeds the collection limit');
}
export async function loadFires(fetcher=fetch,signal){
  const data=await arcgis(SOURCES.fires,{where:"IncidentTypeCategory IN ('WF','CX')",fields:'OBJECTID,IrwinID,IncidentName,IncidentTypeCategory,POOState,POOCounty,IncidentSize,PercentContained,ModifiedOnDateTime_dt,FireDiscoveryDateTime,FireBehaviorGeneral,IncidentShortDescription'},fetcher,signal);
  const sourceCount=data.features.length;
  data.features=data.features.filter(f=>validPoint(f.geometry)).map(f=>{const p=f.properties;let id;try{id=incidentId(p.IrwinID);}catch{id=String(p.OBJECTID);}return {...f,id,properties:{name:p.IncidentName||'Unnamed incident',kind:p.IncidentTypeCategory==='CX'?'Incident complex':'Wildfire',state:p.POOState||'',county:p.POOCounty||'',acres:nonnegative(p.IncidentSize),contained:finite(p.PercentContained)!==null&&p.PercentContained>=0&&p.PercentContained<=100?p.PercentContained:null,updated_at:stamp(p.ModifiedOnDateTime_dt),discovered_at:stamp(p.FireDiscoveryDateTime),description:p.IncidentShortDescription||p.FireBehaviorGeneral||'',perimeter_id:/^[a-f0-9-]{36}$/.test(id)?id:null}};});
  return {...data,source:'NIFC / WFIGS',data_kind:'reported-incident',omitted_geometry:sourceCount-data.features.length};
}
export async function loadAir(fetcher=fetch,signal){
  const data=await arcgis(SOURCES.air,{idField:'ObjectId',where:'PM25_Measured = 1',fields:'ObjectId,AQSID,SiteName,DataSource,PM25,PM25_AQI,PM25_Unit,ValidTime,MonitorType,Status'},fetcher,signal);
  const count=data.features.length;
  data.features=data.features.filter(f=>validPoint(f.geometry)).map(f=>{const p=f.properties;return {...f,id:String(p.AQSID||f.id),properties:{name:p.SiteName||'Unnamed monitor',agency:p.DataSource||'AirNow reporting agency',aqi:nonnegative(p.PM25_AQI),pm25:String(p.PM25_Unit).toUpperCase()==='UG/M3'?nonnegative(p.PM25):null,observed_at:stamp(p.ValidTime),monitor_type:p.MonitorType||'Not specified',status:p.Status||'Unknown'}};});
  return {...data,source:'US EPA / AirNow',data_kind:'observation',omitted_geometry:count-data.features.length};
}
export const AQI_BANDS = [
  {code:1,label:'Good',range:'0–50',color:'#67c587'},
  {code:2,label:'Moderate',range:'51–100',color:'#e7c579'},
  {code:3,label:'Unhealthy for sensitive groups',range:'101–150',color:'#ffb270'},
  {code:4,label:'Unhealthy',range:'151–200',color:'#ff7785'},
  {code:5,label:'Very unhealthy',range:'201–300',color:'#c88ce4'},
  {code:6,label:'Hazardous',range:'301+',color:'#d86a9a'},
];
export async function loadAqiContours(fetcher=fetch,signal){
  // EPA's gridcode is a category (1–6), not a numerical AQI value.
  const data=await arcgis(SOURCES.aqi,{fields:'OBJECTID,gridcode,Timestamp',maxAllowableOffset:0.01},fetcher,signal);
  return {...data,source:'US EPA / AirNow',data_kind:'interpolated-pm25-aqi',geometry_tolerance_degrees:0.01,
    features:data.features.filter(f=>['Polygon','MultiPolygon'].includes(f.geometry?.type)).map(f=>{
      const band=AQI_BANDS.find(b=>b.code===f.properties.gridcode);
      return {...f,properties:{category:band?.code??null,label:band?.label||'Unknown category',range:band?.range||'Unknown',color:band?.color||'#8b8b93',observed_at:stamp(f.properties.Timestamp)}};
    })};
}
export function fireSymbolSize(acres,options={}){
  const zoom=options?.zoom??9;
  const size=typeof acres!=='number'||!Number.isFinite(acres)||acres<0?22:acres<100?24:acres<1000?30:acres<10000?38:46;
  // Keep acreage bands distinct while reducing national-view crowding.
  return Math.round(size*(zoom<=5?0.55:zoom<=7?0.75:1));
}
export function fireDisplay(properties,now=Date.now()){
  const updated=Date.parse(properties.updated_at),known=Number.isFinite(updated)&&updated<=now+300000;
  const old=known&&now-updated>48*3600000;
  const contained=properties.contained===100;
  const age=known?(old?'record over 48 hours old':'record within 48 hours'):'record time unknown';
  const containment=contained?'reported 100% contained':typeof properties.contained==='number'&&Number.isFinite(properties.contained)&&properties.contained>=0&&properties.contained<100?`reported ${properties.contained}% contained`:'containment unreported';
  return {className:(contained?' fire-contained':'')+(!known||old?' fire-record-old':''),label:`${containment} · ${age}`};
}
export async function loadPerimeters(id,fetcher=fetch,signal){
  id=incidentId(id);
  const data=await arcgis(SOURCES.perimeters,{where:`poly_IRWINID = '{${id.toUpperCase()}}'`,fields:'OBJECTID,poly_IncidentName,poly_DateCurrent,poly_PolygonDateTime,poly_GISAcres,poly_FeatureCategory,poly_MapMethod'},fetcher,signal);
  return {...data,source:'NIFC / WFIGS',data_kind:'reported-perimeter',incident_id:id,features:data.features.filter(f=>['Polygon','MultiPolygon'].includes(f.geometry?.type)).map(f=>({...f,properties:{name:f.properties.poly_IncidentName||'Reported perimeter',updated_at:stamp(f.properties.poly_DateCurrent||f.properties.poly_PolygonDateTime),acres:nonnegative(f.properties.poly_GISAcres),category:f.properties.poly_FeatureCategory||'Not specified',method:f.properties.poly_MapMethod||'Not specified'}}))};
}
export function satelliteMetadata(xml){
  if(typeof xml!=='string'||xml.length>10000000)throw new Error('Invalid NASA layer metadata');
  const layer=[...xml.matchAll(/<Layer\b[^>]*>([\s\S]*?)<\/Layer>/g)].find(m=>m[1].includes('>'+SATELLITE_LAYER+'</'))?.[1];
  const date=layer?.match(/<Default>(\d{4}-\d{2}-\d{2})<\/Default>/)?.[1];
  if(!date||!Number.isFinite(Date.parse(date+'T00:00:00Z'))||new Date(date+'T00:00:00Z').toISOString().slice(0,10)!==date)throw new Error('NASA satellite date is unavailable');
  return {date,layer:SATELLITE_LAYER,source:'NASA FIRMS / GIBS',source_url:SOURCES.satellite,data_kind:'satellite-detection',updated:null};
}
export async function loadSatellite(fetcher=fetch,signal=AbortSignal.timeout(45000)){return satelliteMetadata(await sourceFetch(SOURCES.satellite,signal,fetcher));}
export function distanceKm(lat1,lon1,lat2,lon2){const radians=Math.PI/180,dlat=(lat2-lat1)*radians,dlon=(lon2-lon1)*radians;const a=Math.sin(dlat/2)**2+Math.cos(lat1*radians)*Math.cos(lat2*radians)*Math.sin(dlon/2)**2;return 6371*2*Math.atan2(Math.sqrt(Math.min(1,a)),Math.sqrt(Math.max(0,1-a)));}
export function nearest(features,place,{limit=3,maxKm=100}={}){return features.filter(f=>validPoint(f.geometry)).map(f=>({...f,distance_km:distanceKm(place.lat,place.lon,f.geometry.coordinates[1],f.geometry.coordinates[0])})).filter(f=>f.distance_km<=maxKm).sort((a,b)=>a.distance_km-b.distance_km).slice(0,limit);}
export function observationFresh(feature,now=Date.now()){const at=Date.parse(feature.properties.observed_at);return Number.isFinite(at)&&at<=now+600000&&now-at<=3*3600000;}
export function aqiCategory(value){if(finite(value)===null||value<0)return {label:'Unavailable',color:'#8b8b93'};return value<=50?{label:'Good',color:'#67c587'}:value<=100?{label:'Moderate',color:'#e7c579'}:value<=150?{label:'Unhealthy for sensitive groups',color:'#ffb270'}:value<=200?{label:'Unhealthy',color:'#ff7785'}:value<=300?{label:'Very unhealthy',color:'#c88ce4'}:{label:'Hazardous',color:'#d86a9a'};}
