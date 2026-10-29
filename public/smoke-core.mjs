/* NOAA NDGD RAP near-surface smoke. Apache-2.0. */
export const SMOKE_METHOD='2026-10-28.1';
export const SMOKE_EVALUATION_METHOD='2026-10-28.2';
export const SMOKE_SOURCE='https://mapservices.weather.noaa.gov/raster/rest/services/air_quality/ndgd_smoke_sfc_1hr_avg_time/ImageServer';
export const SMOKE_UNITS_NOTICE='https://www.weather.gov/media/notification/pdf2/scn21-86rap_and_hrr_smoke_units_change_aab.pdf';
export const SMOKE_PRODUCT_NOTICE='https://www.weather.gov/media/notification/pdf2/scn22-42_hysplit_smoke_model_change_aaa.pdf';
const HOUR=3600000,iso=t=>new Date(t).toISOString();
const stamp=v=>typeof v==='number'&&Number.isFinite(v)&&v>0;
export function smokePoint(lat,lon){
  if(lat===null||lon===null||String(lat).trim()===''||String(lon).trim()==='')throw Error('Invalid coordinates');
  lat=Number(lat);lon=Number(lon);
  if(!Number.isFinite(lat)||!Number.isFinite(lon)||lat< -90||lat>90||lon< -180||lon>180)throw Error('Invalid coordinates');
  if(lat<24||lat>50||lon< -125||lon> -66)throw Error('Invalid coordinates for smoke coverage: forecasts currently cover the contiguous United States (24–50°N, 125–66°W).');
  return {lat:Number(lat.toFixed(2)),lon:Number(lon.toFixed(2))};
}
async function json(path,params,fetcher,signal){
  const response=await fetcher(SMOKE_SOURCE+path+'?'+new URLSearchParams({f:'json',...params}),{signal});
  if(!response.ok)throw Error('NOAA smoke service returned HTTP '+response.status);
  const body=await response.json();if(body.error)throw Error('NOAA smoke service: '+String(body.error.message||'query failed').slice(0,200));return body;
}
export async function loadSmokeCatalog(fetcher=fetch,signal=AbortSignal.timeout(45000)){
  const catalog=await json('/query',{where:"category=1 AND idp_subset='conus'",outFields:'objectid,idp_subset,idp_issueddate,idp_validtime,idp_validendtime,idp_ingestdate,idp_fcst_hour',returnGeometry:'false',resultRecordCount:'200',orderByFields:'idp_issueddate DESC,idp_validtime ASC'},fetcher,signal);
  if(!Array.isArray(catalog.features)||catalog.features.length>200||catalog.exceededTransferLimit)throw Error('Smoke forecast catalog is incomplete');
  // Retain only attributes; source polygon footprints are not needed for point sampling.
  return {features:catalog.features.map(f=>({attributes:f.attributes})),source_url:SMOKE_SOURCE};
}
export function selectSmokeRun(catalog,now=Date.now()){
  const rows=(catalog.features||[]).map(f=>f.attributes).filter(a=>a&&a.idp_subset==='conus'&&Number.isSafeInteger(a.objectid)&&a.objectid>0&&stamp(a.idp_issueddate)&&a.idp_issueddate<=now&&stamp(a.idp_validtime)&&a.idp_validtime>=a.idp_issueddate&&a.idp_validtime<=a.idp_issueddate+51*HOUR);
  if(!rows.length)throw Error('No usable NOAA smoke forecast run');
  const issued=Math.max(...rows.map(a=>a.idp_issueddate)),selected=rows.filter(a=>a.idp_issueddate===issued);
  if(selected.length>104)throw Error('Unexpected smoke forecast catalog size');
  const times=new Set();for(const a of selected){if(times.has(a.idp_validtime))throw Error('Conflicting smoke forecast rasters');times.add(a.idp_validtime);}
  return {issued_at:iso(issued),rasters:selected.sort((a,b)=>a.idp_validtime-b.idp_validtime)};
}
export async function loadSmokePoint(point,catalog,fetcher=fetch,signal=AbortSignal.timeout(45000),now=Date.now()){
  point=smokePoint(point.lat,point.lon);const run=selectSmokeRun(catalog,now),samples=[];
  for(let i=0;i<run.rasters.length;i+=20){
    const ids=run.rasters.slice(i,i+20).map(a=>a.objectid);
    const response=await json('/getSamples',{geometry:JSON.stringify({x:point.lon,y:point.lat,spatialReference:{wkid:4326}}),geometryType:'esriGeometryPoint',returnFirstValueOnly:'false',outFields:'*',interpolation:'RSP_NearestNeighbor',mosaicRule:JSON.stringify({mosaicMethod:'esriMosaicLockRaster',lockRasterIds:ids,mosaicOperation:'MT_FIRST'}),renderingRule:JSON.stringify({rasterFunction:'None'})},fetcher,signal);
    if(!Array.isArray(response.samples)||response.samples.length>20||response.exceededTransferLimit)throw Error('Incomplete smoke sampling response');
    if(response.samples.some(s=>!ids.includes(s.rasterId)))throw Error('Smoke sampling returned an unrequested raster');
    samples.push(...response.samples);
  }
  return {method:SMOKE_METHOD,point,model:'NOAA RAP / NDGD',issued_at:run.issued_at,rasters:run.rasters,samples,source_url:SMOKE_SOURCE,raw_unit:'kg/m³',unit:'µg/m³',conversion_factor:1e9,temporal_semantics:'instantaneous',height_m:8,units_notice:SMOKE_UNITS_NOTICE,product_notice:SMOKE_PRODUCT_NOTICE};
}
function concentration(sample,raster,point){
  if(!sample)return {value:null,reason:'No sampled grid value'};
  const a=sample.attributes,l=sample.location;
  if(!a||a.idp_issueddate!==raster.idp_issueddate||a.idp_validtime!==raster.idp_validtime||a.idp_subset!=='conus')return {value:null,reason:'Raster metadata changed during collection'};
  if(!l||l.spatialReference?.wkid!==4326||!Number.isFinite(l.x)||!Number.isFinite(l.y)||Math.abs(l.x-point.lon)>0.00001||Math.abs(l.y-point.lat)>0.00001)return {value:null,reason:'Sample location does not match'};
  const raw=sample.value;
  if((typeof raw!=='number'&&typeof raw!=='string')||String(raw).trim()===''||!/^[+]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(String(raw)))return {value:null,reason:'NoData or invalid concentration'};
  const value=Number(raw);
  if(!Number.isFinite(value)||value<0||value>0.001)return {value:null,reason:'Concentration outside the supported raw-unit range'};
  return {value:value*1e9,reason:null};
}
function contract(product){
  if(product?.method!==SMOKE_METHOD||product.raw_unit!=='kg/m³'||product.conversion_factor!==1e9||product.temporal_semantics!=='instantaneous')throw Error('Unsupported smoke product contract');
}
function smokeRows(product,start,count){
  const point=smokePoint(product.point?.lat,product.point?.lon),issued=Date.parse(product.issued_at);
  const rows=[];
  for(let t=start;t<start+count*HOUR;t+=HOUR){
    const rasters=product.rasters.filter(a=>a.idp_validtime===t&&a.idp_issueddate===issued);
    let value=null,reason='Outside available forecast coverage',raster_id=null,resolution=null;
    if(rasters.length===1){const raster=rasters[0],matches=product.samples.filter(s=>s.rasterId===raster.objectid);raster_id=raster.objectid;
      if(matches.length>1)reason='Conflicting samples';else{const parsed=concentration(matches[0],raster,point);value=parsed.value;reason=parsed.reason;resolution=Number.isFinite(matches[0]?.resolution)?matches[0].resolution:null;}
    }else if(rasters.length>1)reason='Conflicting forecast rasters';
    rows.push({at:iso(t),smoke_ug_m3:value,reason,raster_id,source_resolution:resolution});
  }
  return rows;
}
export function smokeForecast(product,now=Date.now()){
  contract(product);
  const point=smokePoint(product.point?.lat,product.point?.lon),issued=Date.parse(product.issued_at),checked=Date.parse(product.checked_at);
  const rows=smokeRows(product,Math.ceil(now/HOUR)*HOUR,48);
  const usable=rows.filter(r=>r.smoke_ug_m3!==null),age=now-issued,checkAge=now-checked;
  const fresh=!product.stale&&!product.error&&Number.isFinite(age)&&age>=0&&age<=30*HOUR&&Number.isFinite(checkAge)&&checkAge>=-60000&&checkAge<=1.5*HOUR;
  return {method:SMOKE_EVALUATION_METHOD,evaluated_at:iso(now),point,issued_at:product.issued_at,checked_at:product.checked_at,fresh,error:product.error||null,rows,coverage:{usable:usable.length,expected:48},range:usable.length?{min:Math.min(...usable.map(r=>r.smoke_ug_m3)),max:Math.max(...usable.map(r=>r.smoke_ug_m3))}:null,evidence:product};
}

// Instantaneous hourly values bracket an ETA; they are not an interpolated ETA estimate.
export function smokeAtTime(product,place,at,now=Date.now()){
  const base={method:'2026-10-29.1',at:Number.isFinite(at)?iso(at):null,point:null,fresh:false,complete:false,samples:[],maximum_ug_m3:null,issued_at:null,checked_at:product?.checked_at||null,revision:product?.revision||null,reason:'Smoke forecast unavailable',continuous_coverage:false};
  if(!Number.isFinite(at)||at<now||at>now+76*HOUR)return {...base,reason:'Smoke sample time is outside the journey horizon'};
  if(!product||product.error&&!product.method)return {...base,reason:product?.error||base.reason};
  try{
    const report=smokeForecast(product,now),point=smokePoint(place?.lat,place?.lon);
    if(point.lat!==report.point.lat||point.lon!==report.point.lon)return {...base,reason:'Smoke forecast belongs to a different location'};
    const first=Math.floor(at/HOUR)*HOUR,last=Math.ceil(at/HOUR)*HOUR,samples=smokeRows(product,first,(last-first)/HOUR+1),known=samples.filter(s=>s.smoke_ug_m3!==null),complete=report.fresh&&known.length===samples.length;
    return {...base,point,fresh:report.fresh,complete,samples,maximum_ug_m3:report.fresh&&known.length?Math.max(...known.map(s=>s.smoke_ug_m3)):null,issued_at:report.issued_at,checked_at:report.checked_at,reason:!report.fresh?'Smoke forecast is stale or updates are delayed':!complete?'Missing or invalid bracketing smoke samples':null};
  }catch(error){return {...base,reason:error.message};}
}

// A sample ceiling evaluates discrete values bracketing an activity window.
// It cannot establish continuous concentrations between those forecast times.
export function smokeWindow(product,place,start,end,limit=null,now=Date.now()){
  const base={method:SMOKE_EVALUATION_METHOD,status:limit===null?'not_requested':'unknown',limit_ug_m3:limit,scope:'hourly instantaneous samples bracketing the window',continuous_coverage:false,complete:false,fresh:false,samples:[],maximum_ug_m3:null,reason:'Smoke forecast unavailable'};
  if(!Number.isFinite(start)||!Number.isFinite(end)||end<=start||end-start>12*HOUR)return {...base,reason:'Unsupported activity window'};
  if(limit!==null&&(!Number.isFinite(limit)||limit<0||limit>10000))return {...base,reason:'Invalid smoke ceiling'};
  if(!product)return base;
  try{
    const report=smokeForecast(product,now),point=smokePoint(place?.lat,place?.lon);
    if(point.lat!==report.point.lat||point.lon!==report.point.lon)return {...base,reason:'Smoke forecast belongs to a different place'};
    const first=Math.floor(start/HOUR)*HOUR,last=Math.ceil(end/HOUR)*HOUR;
    const samples=smokeRows(product,first,(last-first)/HOUR+1),usable=samples.filter(s=>s.smoke_ug_m3!==null),complete=usable.length===samples.length;
    const maximum=usable.length?Math.max(...usable.map(s=>s.smoke_ug_m3)):null;
    const status=limit===null?'not_requested':!report.fresh?'unknown':usable.some(s=>s.smoke_ug_m3>limit)?'outside_limits':complete?'fits':'unknown';
    return {...base,status,fresh:report.fresh,complete,samples,maximum_ug_m3:maximum,issued_at:report.issued_at,checked_at:report.checked_at,revision:product.revision||null,reason:!report.fresh?'Smoke forecast is stale or updates are delayed':!complete?'Missing or invalid hourly smoke samples':null};
  }catch(error){return {...base,reason:error.message};}
}
