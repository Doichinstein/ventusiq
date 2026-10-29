/* VentusIQ public decision primitives. Apache-2.0. No DOM or network effects. */
(function(root) {
  'use strict';
  const number = value => typeof value === 'number' && Number.isFinite(value) ? value : null;
  const coordinate = (lat, lon) => Number.isFinite(lat) && Number.isFinite(lon) && lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180;
  function ringContains(ring, lon, lat) {
    if (!Array.isArray(ring) || ring.length < 4) return false;
    // Unwrap connected edges, then move the query into the same longitude frame.
    const points=[ring[0]];
    for(const [x,y] of ring.slice(1)){const previous=points.at(-1)[0];points.push([previous+((x-previous+540)%360)-180,y]);}
    lon=points[0][0]+((lon-points[0][0]+540)%360)-180;
    let inside = false;
    for (let i=0,j=points.length-1; i<points.length; j=i++) {
      const [x,y]=points[i], [a,b]=points[j];
      const cross=(lon-x)*(b-y)-(lat-y)*(a-x);
      if (Math.abs(cross)<1e-9 && lon>=Math.min(x,a) && lon<=Math.max(x,a) && lat>=Math.min(y,b) && lat<=Math.max(y,b)) return true;
      if ((y>lat)!==(b>lat) && lon<(a-x)*(lat-y)/(b-y)+x) inside=!inside;
    }
    return inside;
  }
  function contains(geometry, lat, lon) {
    if (!geometry || !coordinate(lat,lon)) return false;
    const polygon = rings => ringContains(rings[0],lon,lat) && !rings.slice(1).some(r=>ringContains(r,lon,lat));
    if (geometry.type==='Polygon') return polygon(geometry.coordinates);
    if (geometry.type==='MultiPolygon') return geometry.coordinates.some(polygon);
    if (geometry.type==='GeometryCollection') return geometry.geometries.some(g=>contains(g,lat,lon));
    return false;
  }
  function relevantAlerts(features, place, metadata, now=Date.now()) {
    const props=metadata?.properties || {}, zones=[props.forecastZone,props.county,props.fireWeatherZone].filter(Boolean);
    return features.filter(f=>{
      const p=f.properties || {}, end=Date.parse(p.ends||p.expires);
      if (p.status!=='Actual' || p.messageType==='Cancel' || (Number.isFinite(end) && end<=now)) return false;
      return f.geometry ? contains(f.geometry,place.lat,place.lon) : (p.affectedZones||[]).some(z=>zones.includes(z));
    }).map(f=>({...f,coverage:f.geometry?'Alert polygon':'Official zone coverage'}));
  }
  function windMph(value) {
    if (typeof value==='object' && value) {
      const n=number(value.value); if(n===null)return null;
      return value.unitCode?.endsWith('km_h-1') ? n/1.609344 : value.unitCode?.endsWith('m_s-1') ? n*2.236936 : value.unitCode?.endsWith('mi_h-1') ? n : null;
    }
    if(typeof value!=='string')return null;
    if(/^calm$/i.test(value.trim()))return 0;
    const values=value.match(/\d+(?:\.\d+)?/g)?.map(Number);
    if(!values)return null;
    const max=Math.max(...values);
    return /mph/i.test(value)?max:/km\/h/i.test(value)?max/1.609344:null;
  }
  function hours(data) {
    return (data?.forecast?.properties?.periods||[]).map(p=>{
      let temp=number(p.temperature);
      if(temp!==null)temp=p.temperatureUnit==='C'?temp*9/5+32:p.temperatureUnit==='F'?temp:null;
      return {start:Date.parse(p.startTime),end:Date.parse(p.endTime),temperature:temp,wind:windMph(p.windSpeed),
        rain:number(p.probabilityOfPrecipitation?.value),summary:p.shortForecast||'',startTime:p.startTime};
    }).filter(h=>Number.isFinite(h.start)&&Number.isFinite(h.end)&&h.end>h.start).sort((a,b)=>a.start-b.start);
  }
  function plan(data, preferences, now=Date.now()) {
    const duration=Number(preferences.duration)*3600000;
    const limits={minTemp:Number(preferences.minTemp),maxTemp:Number(preferences.maxTemp),wind:Number(preferences.wind),rain:Number(preferences.rain)};
    if(!Number.isFinite(duration)||duration<3600000||duration>12*3600000||Object.values(limits).some(v=>!Number.isFinite(v))||limits.minTemp>limits.maxTemp||limits.wind<0||limits.rain<0||limits.rain>100)throw new Error('Check the planning limits and duration.');
    const series=hours(data).filter(h=>h.end>now&&h.start<now+72*3600000), results=[];
    for(const hour of series){
      const start=Math.max(now,hour.start), end=start+duration;
      if(start>=now+48*3600000)continue;
      const slice=series.filter(h=>h.start<end&&h.end>start);
      let cursor=start;
      const reasons=new Set();
      for(const h of slice){
        if(h.start>cursor)reasons.add('Missing forecast hours');
        cursor=Math.max(cursor,h.end);
        if(h.temperature===null)reasons.add('Temperature unavailable');
        else if(h.temperature<limits.minTemp||h.temperature>limits.maxTemp)reasons.add('Temperature outside your range');
        if(h.wind===null)reasons.add('Wind unavailable');else if(h.wind>limits.wind)reasons.add('Wind exceeds your limit');
        if(h.rain===null)reasons.add('Rain probability unavailable');else if(h.rain>limits.rain)reasons.add('Rain probability exceeds your limit');
      }
      if(cursor<end)reasons.add('Incomplete forecast coverage');
      const values=key=>slice.map(h=>h[key]).filter(v=>v!==null);
      const rain=values('rain'), wind=values('wind'), temps=values('temperature');
      results.push({start,end,reasons:[...reasons],fits:!reasons.size,rain:rain.length?Math.max(...rain):null,wind:wind.length?Math.max(...wind):null,minTemp:temps.length?Math.min(...temps):null,maxTemp:temps.length?Math.max(...temps):null});
    }
    // Earliest satisfactory opportunity, then chronological alternatives; no hidden risk score.
    return results.sort((a,b)=>Number(b.fits)-Number(a.fits)||a.start-b.start);
  }
  function alertChanges(previous, current) {
    if(previous===null)return [];
    const old=new Map(previous.map(f=>[f.id,f])), matched=new Set(), result=[];
    const fields=[['severity','Severity'],['onset','Onset'],['ends','End time'],['expires','Expiration'],['instruction','Official instructions']];
    for(const f of current){
      const prior=old.get(f.id)||previous.find(o=>(f.properties.references||[]).some(r=>r.identifier===o.properties.id));
      if(!prior){result.push({kind:'new',id:f.id,text:`New for this place: ${f.properties.event}`});continue;}
      matched.add(prior.id);
      const changed=fields.filter(([key])=>JSON.stringify(prior.properties[key]??null)!==JSON.stringify(f.properties[key]??null)).map(([key,label])=>({field:key,label,before:prior.properties[key]??null,after:f.properties[key]??null}));
      if(JSON.stringify(prior.geometry)!==JSON.stringify(f.geometry)||JSON.stringify(prior.properties.affectedZones)!==JSON.stringify(f.properties.affectedZones))changed.push({field:'coverage',label:'Affected area',before:null,after:null});
      if(changed.length)result.push({kind:'updated',id:f.id,text:`${f.properties.event}: ${changed.map(c=>c.label.toLowerCase()).join(', ')} changed`,fields:changed});
    }
    for(const f of previous)if(!matched.has(f.id)&&!current.some(n=>n.id===f.id))result.push({kind:'left',id:f.id,text:`${f.properties.event} no longer appears for this place; check official status`});
    return result;
  }
  function forecastChanges(previous, current, now=Date.now()) {
    if(!previous)return [];
    const old=new Map(hours(previous).map(h=>[h.start,h]));
    const found=[];
    for(const h of hours(current).filter(h=>h.end>now&&h.start<now+48*3600000)){
      const p=old.get(h.start);if(!p)continue;
      for(const [key,limit,label,unit] of [['temperature',5,'Temperature','°F'],['wind',10,'Wind','mph'],['rain',20,'Rain probability','%']]){
        if(h[key]!==null&&p[key]!==null&&Math.abs(h[key]-p[key])>=limit)found.push({kind:'forecast',at:h.start,field:key,before:p[key],after:h[key],text:`${label}: ${Math.round(p[key])}${unit} → ${Math.round(h[key])}${unit}`});
      }
    }
    return found.slice(0,12);
  }
  const api={coordinate,contains,relevantAlerts,windMph,hours,plan,alertChanges,forecastChanges};
  // The same side-effect module is used by classic browser scripts and the Worker bundle.
  // Bundlers may provide a CommonJS module object even when the importer uses ESM.
  root.WeatherCore=api;
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this);
