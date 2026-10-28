import {SOURCES,sourceFetch,stamp,validPoint,distanceKm} from './hazards-core.mjs';
export const AIR_TREND_METHOD='2026-10-28.1',HOUR=3600000;
export function monitorId(value){const id=String(value||'');if(!/^[A-Za-z0-9_-]{1,48}$/.test(id))throw Error('Invalid air monitor identifier');return id;}
export async function loadAirHistory(value,fetcher=fetch,signal=AbortSignal.timeout(45000)){
  const id=monitorId(value),base=SOURCES.airHistory;
  const metadata=await sourceFetch(base+'?f=json',signal,fetcher);
  const query=new URLSearchParams({f:'geojson',where:`AQSID = '${id}'`,outFields:'ObjectId,AQSID,SiteName,DataSource,PM25,PM25_AQI,PM25_Measured,PM25_Unit,ValidTime,MonitorType,Status',outSR:'4326',returnGeometry:'true',orderByFields:'ValidTime,ObjectId',resultRecordCount:'200'});
  const url=base+'/query?'+query,data=await sourceFetch(url,signal,fetcher);
  if(data?.type!=='FeatureCollection'||!Array.isArray(data.features)||data.features.length>200||data.exceededTransferLimit||data.properties?.exceededTransferLimit)throw Error('Air monitor history is incomplete or exceeds 200 records');
  if(!data.features.every(f=>f?.type==='Feature'&&String(f.properties?.AQSID)===id))throw Error('Invalid air monitor history response');
  return {...data,monitor_id:id,source:'US EPA / AirNow',source_url:url,data_kind:'observation',updated:stamp(metadata.editingInfo?.lastEditDate),source_time_extent:metadata.timeInfo?.timeExtent||null,issued_at:null};
}
const measured=n=>typeof n==='number'&&Number.isFinite(n)&&n>=0?n:null;
export function airTrend(product,monitor,now=Date.now()){
  const id=monitorId(monitor.id);if(product.monitor_id!==id)throw Error('Invalid air monitor history identity');
  const start=now-24*HOUR,groups=new Map(),excluded={invalid_time:0,outside_window:0,wrong_monitor:0,conflicting_times:0,non_measured:0,invalid_units:0,invalid_location:0},rows=[];
  for(const f of product.features||[]){const p=f.properties||{},at=typeof p.ValidTime==='number'?p.ValidTime:NaN;
    if(String(p.AQSID)!==id){excluded.wrong_monitor++;continue;}
    if(!Number.isFinite(at)||at<=0||!Number.isFinite(new Date(at).getTime())){excluded.invalid_time++;continue;}
    if(at<start||at>now){excluded.outside_window++;continue;}
    const list=groups.get(at)||[];list.push(f);groups.set(at,list);
  }
  for(const [at,features] of groups){
    const values=features.map(f=>{const p=f.properties;return JSON.stringify([p.PM25,p.PM25_AQI,p.PM25_Measured,p.PM25_Unit,f.geometry]);});
    const conflict=new Set(values).size>1,f=features[0],p=f.properties,reasons=[];
    if(conflict){excluded.conflicting_times++;reasons.push('Conflicting readings at this time');}
    if(p.PM25_Measured!==1){excluded.non_measured++;reasons.push('Not marked measured');}
    if(String(p.PM25_Unit).toUpperCase()!=='UG/M3'){excluded.invalid_units++;reasons.push('Unknown concentration unit');}
    if(!validPoint(f.geometry)||!validPoint(monitor.geometry)||distanceKm(f.geometry.coordinates[1],f.geometry.coordinates[0],monitor.geometry.coordinates[1],monitor.geometry.coordinates[0])>0.1){excluded.invalid_location++;reasons.push('Monitor location differs or is unavailable');}
    const usable=!reasons.length,pm25=usable?measured(p.PM25):null,aqi=usable?measured(p.PM25_AQI):null;
    if(usable&&pm25===null)reasons.push('Concentration missing or invalid');
    if(usable&&aqi===null)reasons.push('AQI missing or invalid');
    rows.push({at:new Date(at).toISOString(),pm25,aqi,flags:reasons,status:p.Status||'Unknown',monitor_type:p.MonitorType||'Unknown',source_ids:features.map(x=>x.id??x.properties.ObjectId),duplicate_records:features.length-1});
  }
  rows.sort((a,b)=>a.at.localeCompare(b.at));const latest=rows.at(-1)||null,byTime=new Map(rows.map(r=>[Date.parse(r.at),r]));
  const previous=latest?byTime.get(Date.parse(latest.at)-6*HOUR):null;
  const change=latest?.pm25!==null&&latest&&previous?.pm25!==null&&previous?{from:previous.at,to:latest.at,previous:previous.pm25,current:latest.pm25,delta:latest.pm25-previous.pm25}:null;
  const consecutive=latest?Array.from({length:6},(_,i)=>byTime.get(Date.parse(latest.at)-i*HOUR)):[];
  const sixHour=consecutive.length===6&&consecutive.every(r=>r&&r.pm25!==null)?{start:consecutive.at(-1).at,end:latest.at,mean:consecutive.reduce((s,r)=>s+r.pm25,0)/6}:null;
  const usable=rows.filter(r=>r.pm25!==null),checked=Date.parse(product.checked_at),fresh=!product.stale&&!product.error&&Number.isFinite(checked)&&checked<=now+60000&&now-checked<=1350000&&latest&&latest.pm25!==null&&now-Date.parse(latest.at)<=3*HOUR;
  return {method_version:AIR_TREND_METHOD,evaluated_at:new Date(now).toISOString(),window_start:new Date(start).toISOString(),window_end:new Date(now).toISOString(),monitor,source:product.source,source_url:product.source_url,revision:product.revision||null,checked_at:product.checked_at||null,source_updated_at:product.updated||null,fresh:!!fresh,error:product.error||null,rows,latest,change_6h:change,mean_6_readings:sixHour,coverage:{readings:rows.length,usable:usable.length,utc_hours_with_measurements:new Set(usable.map(r=>Math.floor(Date.parse(r.at)/HOUR))).size,excluded},range:usable.length?{min:Math.min(...usable.map(r=>r.pm25)),max:Math.max(...usable.map(r=>r.pm25))}:null,evidence:product};
}
