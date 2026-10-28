/* NOAA NWPS products and deterministic river summaries. Apache-2.0. */
export const NWPS='https://api.water.noaa.gov/nwps/v1';
export const gaugeId=value=>{const id=String(value||'').toUpperCase();if(!/^[A-Z0-9]{3,16}$/.test(id))throw new Error('Invalid gauge identifier');return id;};
export const waterValue=value=>typeof value==='number'&&Number.isFinite(value)&&![-999,-9999,-99999].includes(value)?value:null;
export const waterTime=value=>typeof value==='string'&&Date.parse(value)>=0?new Date(value).toISOString():null;
export function riverRegion(lat,lon){
  if(lat===null||lon===null||String(lat).trim()===''||String(lon).trim()==='')throw new Error('Invalid coordinates');
  lat=Number(lat);lon=Number(lon);if(!Number.isFinite(lat)||!Number.isFinite(lon)||Math.abs(lat)>90||Math.abs(lon)>180)throw new Error('Invalid coordinates');
  const center={lat:Math.round(lat),lon:Math.round(lon)},dy=2,dx=Math.min(180,Math.ceil(0.5+1.5/Math.max(.02,Math.cos(Math.min(89,Math.abs(center.lat)+dy)*Math.PI/180))));
  const south=Math.max(-90,center.lat-dy),north=Math.min(90,center.lat+dy),west=center.lon-dx,east=center.lon+dx;
  const boxes=dx===180?[[-180,south,180,north]]:west< -180?[[west+360,south,180,north],[-180,south,east,north]]:east>180?[[west,south,180,north],[-180,south,east-360,north]]:[[west,south,east,north]];
  return {key:center.lat+','+center.lon,center,boxes};
}
async function read(path,fetcher,signal){
  if(!/^\/gauges(?:\?|\/[A-Z0-9]{3,16}(?:\/stageflow)?$)/.test(path))throw new Error('Invalid river source path');
  const response=await fetcher(NWPS+path,{signal,headers:{Accept:'application/json'}});
  if(!response.ok)throw new Error(`NWPS returned HTTP ${response.status}`);
  const data=await response.json();if(data.error||data.code)throw new Error('NWPS product is unavailable');return data;
}
const status=p=>({value:waterValue(p?.primary),unit:p?.primaryUnit||'',category:p?.floodCategory||'not_defined',at:waterTime(p?.validTime)});
export async function loadRiverRegion(region,fetcher=fetch,signal=AbortSignal.timeout(45000)){
  const gauges=new Map();
  for(const [xmin,ymin,xmax,ymax] of region.boxes){
    const query=new URLSearchParams({'bbox.xmin':xmin,'bbox.ymin':ymin,'bbox.xmax':xmax,'bbox.ymax':ymax,srid:'EPSG_4326'});
    const data=await read('/gauges?'+query,fetcher,signal);if(!Array.isArray(data.gauges))throw new Error('Incomplete gauge list');
    for(const g of data.gauges){if(!Number.isFinite(g.latitude)||!Number.isFinite(g.longitude)||Math.abs(g.latitude)>90||Math.abs(g.longitude)>180)continue;
      const id=gaugeId(g.lid);gauges.set(id,{type:'Feature',id,geometry:{type:'Point',coordinates:[g.longitude,g.latitude]},properties:{name:g.name||id,state:g.state?.abbreviation||'',observed:status(g.status?.observed),forecast:status(g.status?.forecast)}});
    }
  }
  return {type:'FeatureCollection',features:[...gauges.values()],region,source:'NOAA / NWPS',source_url:NWPS+'/gauges',data_kind:'gauge-status'};
}
export async function loadGauge(id,fetcher=fetch,signal=AbortSignal.timeout(45000)){
  id=gaugeId(id);
  const metadata=await read('/gauges/'+id,fetcher,signal),series=await read('/gauges/'+id+'/stageflow',fetcher,signal);
  if(gaugeId(metadata.lid)!==id||!metadata.flood||!series.observed||!series.forecast||!Array.isArray(series.observed.data)||!Array.isArray(series.forecast.data))throw new Error('Incomplete river product');
  return {metadata,series,source:'NOAA / NWPS',source_url:NWPS+'/gauges/'+id,official_url:'https://water.noaa.gov/gauges/'+id.toLowerCase(),updated:waterTime(series.forecast.issuedTime),data_kind:'observation-and-forecast'};
}
export function dimension(name,unit){
  const kind=/stage/i.test(name)?'stage':/flow|discharge/i.test(name)?'flow':null;
  const units=String(unit||'').toLowerCase().replaceAll(' ','');
  const factor=kind==='stage'?({ft:1,m:3.280839895,cm:.03280839895})[units]:kind==='flow'?({cfs:1,kcfs:1000,'m3/s':35.31466672,'cms':35.31466672})[units]:undefined;
  return {kind:factor===undefined?null:kind,unit:factor===undefined?unit:kind==='stage'?'ft':'cfs',factor:factor??1,name:name||'Primary reading'};
}
export function normalizeSeries(raw){
  const d=dimension(raw?.primaryName,raw?.primaryUnits),seen=new Map();
  for(const p of raw?.data||[]){const at=waterTime(p.validTime);if(!at)continue;const value=waterValue(p.primary);seen.set(at,{at,value:value===null?null:value*d.factor,generated_at:waterTime(p.generatedTime)});}
  return {...d,issued_at:waterTime(raw?.issuedTime),points:[...seen.values()].sort((a,b)=>Date.parse(a.at)-Date.parse(b.at))};
}
export function riverSummary(product,now=Date.now()){
  const metadata=product.metadata,observed=normalizeSeries(product.series.observed),forecast=normalizeSeries(product.series.forecast);
  // A forecast-only gauge can still be useful. Adopt its quantity only when there are no measured values to mislabel.
  if(!observed.kind&&!observed.points.some(p=>p.value!==null)&&forecast.kind)Object.assign(observed,{kind:forecast.kind,unit:forecast.unit,name:forecast.name,factor:forecast.factor});
  const usableObservations=observed.points.filter(p=>p.value!==null&&Date.parse(p.at)<=now+600000),latest=usableObservations.at(-1)||null;
  const observationStale=!latest||now-Date.parse(latest.at)>6*3600000;
  const compatible=observed.kind&&observed.kind===forecast.kind&&observed.unit===forecast.unit;
  // Source status, issue age and future coverage all matter. A successful fetch alone is not a current forecast.
  const forecastStale=!!product.stale||!forecast.issued_at||Date.parse(forecast.issued_at)>now+600000||now-Date.parse(forecast.issued_at)>86400000||metadata.status?.forecast?.floodCategory==='fcst_not_current';
  const future=forecast.points.filter(p=>Date.parse(p.at)>=now),validFuture=future.filter(p=>p.value!==null);
  const usableForecast=!forecastStale&&!!compatible&&!!validFuture.length;
  const thresholdDimension=dimension(observed.kind==='stage'?'Stage':observed.kind==='flow'?'Flow':'',metadata.flood?.[observed.kind==='stage'?'stageUnits':'flowUnits']);
  const thresholdCompatible=!!observed.kind&&thresholdDimension.kind===observed.kind;
  const thresholds=thresholdCompatible?['action','minor','moderate','major'].map(name=>({name,value:waterValue(metadata.flood?.categories?.[name]?.[observed.kind])})).filter(t=>t.value!==null).map(t=>({...t,value:t.value*thresholdDimension.factor})):[];
  const ordered=thresholds.every((t,i)=>i===0||t.value>=thresholds[i-1].value);
  const safeThresholds=ordered?thresholds:[];
  const maximum=usableForecast?Math.max(...validFuture.map(p=>p.value)):null;
  const highs=maximum===null?[]:validFuture.filter(p=>p.value===maximum);
  const peak=highs.length?{value:maximum,at:highs[0].at,repeated:highs.length>1,atEnd:validFuture.at(-1).value===maximum}:null;
  const crossings=usableForecast?safeThresholds.map(t=>{
    const index=future.findIndex(p=>p.value!==null&&p.value>=t.value);if(index<0)return {...t,at:null};
    const p=future[index],previous=future[index-1],gap=previous?Date.parse(p.at)-Date.parse(previous.at):Infinity;
    return {...t,at:p.at,after:previous?.value!==null&&previous?.value<t.value&&gap<=12*3600000?previous.at:null};
  }):[];
  const impacts=observed.kind==='stage'&&thresholdCompatible?(metadata.flood?.impacts||[]).filter(p=>waterValue(p.stage)!==null&&typeof p.statement==='string').map(p=>({value:p.stage*thresholdDimension.factor,text:p.statement})).sort((a,b)=>a.value-b.value):[];
  return {observed,forecast,latest,observationStale,forecastStale,compatible,usableForecast,thresholds:safeThresholds,thresholdsInvalid:!ordered,peak,crossings,impacts,future};
}
export const riverCategory=category=>({major:{label:'Major flooding',color:'#c88ce4'},moderate:{label:'Moderate flooding',color:'#ff7785'},minor:{label:'Minor flooding',color:'#ffb270'},action:{label:'Action stage',color:'#e7c579'},no_flooding:{label:'Below flood stage',color:'#67c587'},low_threshold:{label:'Low water',color:'#88baff'}})[category]||{label:'Status unavailable',color:'#8b8b93'};
