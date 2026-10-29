import {validPoint,distanceKm,stamp} from './hazards-core.mjs';
import {monitorId,HOUR} from './air-trends-core.mjs';
import {airPoint,AIR_MODEL,validateAirForecast} from './air-forecast-core.mjs';
import {comparisonChoices} from './pm-comparison-core.mjs';
export const OZONE_METHOD='2026-10-29.1';
export const OZONE_CURRENT='https://services.arcgis.com/cJ9YHowT8TU7DUyn/ArcGIS/rest/services/Air_Now_Current_Monitors_Ozone/FeatureServer/0';
export const OZONE_HISTORY='https://services.arcgis.com/cJ9YHowT8TU7DUyn/ArcGIS/rest/services/Air_Now_Monitors_Ozone/FeatureServer/0';
const finite=n=>typeof n==='number'&&Number.isFinite(n)?n:null;
export async function ozoneJSON(base,query,fetcher,signal){
  if(![OZONE_CURRENT,OZONE_HISTORY].includes(base))throw Error('Untrusted ozone source');const url=base+(query?'/query?'+new URLSearchParams(query):'?f=json'),r=await fetcher(url,{signal,redirect:'manual',headers:{Accept:'application/json'}});if(!r.ok)throw Error('EPA ozone returned HTTP '+r.status);const reader=r.body?.getReader();if(!reader)throw Error('Empty ozone response');let size=0,text='';const decoder=new TextDecoder('utf-8',{fatal:true});for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>2*1024*1024){await reader.cancel();throw Error('EPA ozone response exceeds 2 MiB');}text+=decoder.decode(value,{stream:true});}const raw=JSON.parse(text+decoder.decode());if(raw.error)throw Error('EPA rejected the ozone query');return {raw,url};
}
export async function loadOzone(id,fetcher=fetch,signal){
  const base=id?OZONE_HISTORY:OZONE_CURRENT;if(id)monitorId(id);const metadata=(await ozoneJSON(base,null,fetcher,signal)).raw,features=[],ids=new Set();
  for(let page=0;page<(id?1:4);page++){const {raw,url}=await ozoneJSON(base,{f:'geojson',where:id?`AQSID = '${id}'`:'OZONE_Measured = 1',outFields:'ObjectId,AQSID,SiteName,DataSource,OZONE,OZONE_AQI,OZONE_Measured,OZONE_Unit,ValidTime,MonitorType,Status',outSR:'4326',returnGeometry:'true',orderByFields:id?'ValidTime,ObjectId':'ObjectId',resultRecordCount:id?'200':'2000',resultOffset:String(features.length)},fetcher,signal);
    if(raw?.type!=='FeatureCollection'||!Array.isArray(raw.features)||raw.features.length>(id?200:2000))throw Error('Invalid ozone feature collection');
    for(const f of raw.features){const key=f?.id??f?.properties?.ObjectId;if(f?.type!=='Feature'||!f.properties||key==null||ids.has(String(key))||id&&String(f.properties.AQSID)!==id)throw Error('Invalid or repeated ozone source row');ids.add(String(key));features.push(f);}
    if(!raw.exceededTransferLimit&&!raw.properties?.exceededTransferLimit)return {type:'FeatureCollection',features,monitor_id:id||null,source:'US EPA / AirNow',source_url:id?url:base,source_metadata:{updated:stamp(metadata.editingInfo?.lastEditDate),time_extent:metadata.timeInfo?.timeExtent||null},updated:stamp(metadata.editingInfo?.lastEditDate),issued_at:null,data_kind:'observation'};
    if(!raw.features.length)throw Error('Incomplete ozone pagination');
  }throw Error('Ozone source exceeds bounded collection; no partial edition stored');
}
export function ozoneMonitors(product,place){
  const groups=new Map();for(const f of product.features||[]){try{const id=monitorId(f.properties?.AQSID);if(!validPoint(f.geometry)||f.properties.OZONE_Measured!==1)continue;const list=groups.get(id)||[];list.push(f);groups.set(id,list);}catch{}}
  const monitors=[];for(const [id,list] of groups){if(list.some(f=>JSON.stringify(f.geometry)!==JSON.stringify(list[0].geometry)))continue;const f=list.slice().sort((a,b)=>(b.properties.ValidTime||0)-(a.properties.ValidTime||0))[0],distance=distanceKm(place.lat,place.lon,f.geometry.coordinates[1],f.geometry.coordinates[0]);if(distance<=50)monitors.push({id,geometry:f.geometry,source_feature:f,properties:{name:f.properties.SiteName||'Unnamed ozone monitor',agency:f.properties.DataSource||'Unknown agency',status:f.properties.Status||'Unknown'},distance_km:distance});}return monitors.sort((a,b)=>a.distance_km-b.distance_km||a.id.localeCompare(b.id)).slice(0,5);
}
export function ozoneHistory(product,monitor,now=Date.now()){
  if(product.monitor_id!==monitor.id||!validPoint(monitor.geometry))throw Error('Invalid ozone history identity');const checked=Date.parse(product.checked_at);if(!Number.isFinite(checked)||checked>now+60000)throw Error('Invalid ozone collection time');
  const end=Math.floor(now/HOUR)*HOUR,start=end-24*HOUR,groups=new Map(),excluded={invalid_time:0,outside_window:0,incomplete_period:0,wrong_monitor:0,conflicting:0,location:0,units:0,not_measured:0},rows=[];
  for(const f of product.features||[]){const p=f.properties||{},at=finite(p.ValidTime);if(String(p.AQSID)!==monitor.id){excluded.wrong_monitor++;continue;}if(at===null||at<=0||at%HOUR!==0){excluded.invalid_time++;continue;}if(at<start||at>=end){excluded.outside_window++;continue;}if(at+HOUR>checked){excluded.incomplete_period++;continue;}const group=groups.get(at)||[];group.push(f);groups.set(at,group);}
  for(let at=start;at<end;at+=HOUR){const list=groups.get(at)||[],flags=[];let ozone=null,aqi=null;const f=list[0],p=f?.properties;
    if(!p)flags.push('No completed hourly record');else{
      const comparable=f=>[f.geometry,f.properties.OZONE,f.properties.OZONE_Unit,f.properties.OZONE_AQI,f.properties.OZONE_Measured,f.properties.Status];let valid=true;
      if(list.some(f=>JSON.stringify(comparable(f))!==JSON.stringify(comparable(list[0])))){excluded.conflicting++;flags.push('Conflicting readings');valid=false;}
      if(!validPoint(f.geometry)||distanceKm(f.geometry.coordinates[1],f.geometry.coordinates[0],monitor.geometry.coordinates[1],monitor.geometry.coordinates[0])>0.1){excluded.location++;flags.push('Location differs or unknown');valid=false;}
      if(p.OZONE_Measured!==1){excluded.not_measured++;flags.push('Monitor not marked as measuring ozone');valid=false;}
      if(p.OZONE_Unit!=='PPB'){excluded.units++;flags.push('Unrecognized concentration unit');valid=false;}
      if(valid){ozone=finite(p.OZONE);if(ozone===-999)ozone=null;aqi=finite(p.OZONE_AQI);if(aqi!==null&&aqi<0)aqi=null;if(ozone===null)flags.push('Concentration unavailable');else if(ozone<0)flags.push('Negative reported concentration; possible instrument drift');}
    }
    rows.push({at:new Date(at).toISOString(),end:new Date(at+HOUR).toISOString(),ozone_ppb:ozone,nowcast_aqi:aqi,flags,source_ids:list.map(f=>f.id??f.properties.ObjectId),status:p?.Status||'Unknown',monitor_type:p?.MonitorType||'Unknown'});
  }
  const usable=rows.filter(r=>r.ozone_ppb!==null),latest=usable.at(-1)||null,previous=latest?rows.find(r=>Date.parse(r.at)===Date.parse(latest.at)-6*HOUR):null,change=latest&&previous?.ozone_ppb!=null?{from:previous.at,to:latest.at,delta_ppb:latest.ozone_ppb-previous.ozone_ppb}:null;
  return {method:OZONE_METHOD,evaluated_at:new Date(now).toISOString(),window:{start:new Date(start).toISOString(),end:new Date(end).toISOString()},monitor,rows,latest,change_6h:change,coverage:{hours:24,usable:usable.length,negative:usable.filter(r=>r.ozone_ppb<0).length,excluded},fresh:!product.stale&&!product.error&&now-checked<=30*60000&&latest!==null&&now-Date.parse(latest.end)<=3*HOUR,range:usable.length?{min:Math.min(...usable.map(r=>r.ozone_ppb)),max:Math.max(...usable.map(r=>r.ozone_ppb))}:null,evidence:product};
}
export function ozoneForecastContext({place,trend,checks,forecasts}){
  const point=airPoint(place.lat,place.lon),choices=comparisonChoices(checks,trend.rows.map(r=>Date.parse(r.at))),sources=new Map(),rows=choices.map(({at,check},i)=>{const observation=trend.rows[i],r={...observation,forecast_check:check?{revision:check.revision,checked_at:new Date(check.at*1000).toISOString(),collection_lead_hours:(at-check.at*1000)/HOUR}:null,model_start_ug_m3:null,model_end_ug_m3:null,paired:false,reason:null};
    if(!check){r.reason='No forecast archived 1–24 hours before the observation period';return r;}const p=forecasts.get(check.revision);let data;try{if(p?.model!==AIR_MODEL||p.point.lat!==point.lat||p.point.lon!==point.lon)throw Error();data=validateAirForecast(p.raw,point);}catch{r.reason='Invalid or missing archived model';return r;}sources.set(check.revision,p);r.model_start_ug_m3=data.find(r=>Date.parse(r.at)===at)?.ozone??null;r.model_end_ug_m3=data.find(r=>Date.parse(r.at)===at+HOUR)?.ozone??null;
    if(r.model_start_ug_m3===null||r.model_end_ug_m3===null)r.reason='Missing model bracket';else if(observation.ozone_ppb===null)r.reason='Missing usable hourly measurement';else r.paired=true;return r;});
  return {rows,paired_hours:rows.filter(r=>r.paired).length,forecast_sources:[...sources].map(([revision,product])=>({revision,product})),run_age_known:false,error_metrics:null,limitations:'Monitor ppb and CAMS µg/m³ are different quantities. No ambient temperature/pressure conversion is established, so no numerical difference or accuracy score is computed. Model endpoints bracket an hourly observation but do not establish its mean. Collection lead is not model-run lead; location and spatial scale also differ.'};
}
