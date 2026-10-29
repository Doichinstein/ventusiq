import {gaugeId,dimension,waterValue} from './rivers-core.mjs';
import {thresholds,datum} from './river-changes-core.mjs';
import {inReportArea} from './event-reports-core.mjs';
export const EVENT_GAUGE_METHOD='2026-10-28.1';
export const FLOOD_EVENTS=new Set(['Flood Warning','Flood Watch','Flood Advisory','Flash Flood Warning','Flash Flood Watch','Flash Flood Statement','Flood Statement']);
const instant=v=>typeof v==='string'&&/(Z|[+-]\d\d:\d\d)$/.test(v)?Date.parse(v):NaN;
export function eventGaugeBoxes(areas){const found=new Map();let omitted=0;
  for(const area of areas)for(const boundary of area.geometries){const points=[];const walk=c=>{if(Array.isArray(c)&&typeof c[0]==='number'){if(c.length>=2&&c.slice(0,2).every(Number.isFinite))points.push(c);}else if(Array.isArray(c))c.forEach(walk);};walk(boundary.geometry.coordinates);
    if(!points.length){omitted++;continue;}const extent=points.reduce((b,p)=>[Math.min(b[0],p[0]),Math.min(b[1],p[1]),Math.max(b[2],p[0]),Math.max(b[3],p[1])],[Infinity,Infinity,-Infinity,-Infinity]);const box=extent.map((v,i)=>(i<2?Math.floor(v*10):Math.ceil(v*10))/10);
    if(box[2]-box[0]>12||box[3]-box[1]>8||box[0]<-180||box[2]>180||box[1]<-90||box[3]>90||box[0]>=box[2]||box[1]>=box[3]){omitted++;continue;}found.set(box.join(','),box);
  }return {boxes:[...found.values()].slice(0,3),boxes_omitted:omitted+Math.max(0,found.size-3)};
}
function linksAt(areas,windows,point){return windows.flatMap(w=>{const a=areas.find(a=>a.message_id===w.message_id&&a.revision===w.revision),hits=a?.geometries.filter(g=>inReportArea(g.geometry,point)===true)||[];return hits.length?[{message_id:w.message_id,revision:w.revision,event:w.event,start:w.start,end:w.end,coverage:a.kind,boundaries:hits.map(({geometry,...evidence})=>evidence)}]:[];});}
export function eventGaugeCandidates(products,areas,windows){const candidates=new Map();let invalid=0;for(const product of products)for(const f of product.features||[]){let id;try{id=gaugeId(f.id);}catch{invalid++;continue;}const c=f.geometry?.coordinates;if(f.geometry?.type!=='Point'||!c||!c.slice(0,2).every(Number.isFinite)){invalid++;continue;}const links=linksAt(areas,windows,{longitude:c[0],latitude:c[1]});if(links.length)candidates.set(id,{id,name:String(f.properties?.name||id),longitude:c[0],latitude:c[1],links,inventory_revision:product.revision,checked_at:product.checked_at});}const all=[...candidates.values()].sort((a,b)=>a.id.localeCompare(b.id));return {gauges:all.slice(0,25),gauges_omitted:Math.max(0,all.length-25),invalid_records:invalid};}
export function matchEventGauge({product,gauge,scope,areas,asOf}){
  const excluded={invalid_time:0,future:0,outside_time:0,unknown_geometry:0,outside_area:0,invalid_value:0,conflicting_value:0};const rows=[],groups=new Map(),raw=product?.series?.observed,d=dimension(raw?.primaryName,raw?.primaryUnits),m=product?.metadata;
  const empty=reason=>({rows,matched_timestamps:0,usable_timestamps:0,rows_omitted:0,excluded,summary:null,thresholds:[],reason,datum:product?datum(product):[],unit:d.kind?d.unit:null});
  if(!product)return empty('No collected gauge product');
  if(gaugeId(m?.lid)!==gaugeId(gauge))return empty('Gauge identity does not match');
  if(!Number.isFinite(m.latitude)||!Number.isFinite(m.longitude)||Math.abs(m.latitude)>90||Math.abs(m.longitude)>180)return empty('Gauge coordinates are unavailable');
  if(!d.kind)return empty('Unsupported observed quantity or units');
  if(!Array.isArray(raw.data)||raw.data.length>20000)return empty('Observed series is missing or exceeds the record limit');
  for(const point of raw.data){const at=instant(point.validTime),generated=point.generatedTime==null?null:instant(point.generatedTime);if(!Number.isFinite(at)||(generated!==null&&!Number.isFinite(generated))){excluded.invalid_time++;continue;}if(at>asOf||(generated!==null&&generated>asOf)){excluded.future++;continue;}if(!groups.has(at))groups.set(at,[]);groups.get(at).push(point);}
  for(const [at,points] of groups){const windows=scope.windows.filter(w=>at>=instant(w.start)&&at<instant(w.end));if(!windows.length){excluded.outside_time++;continue;}
    const links=linksAt(areas,windows,{latitude:m.latitude,longitude:m.longitude});if(!links.length){excluded[windows.some(w=>!areas.find(a=>a.message_id===w.message_id&&a.revision===w.revision)?.complete)?'unknown_geometry':'outside_area']++;continue;}
    const values=points.map(p=>waterValue(p.primary)),unique=new Set(values.map(v=>v===null?null:Math.round(v*d.factor*1e6)/1e6));let value=null,reason=null;
    if(values.some(v=>v===null)){excluded.invalid_value++;reason='Missing or invalid reading';}else if(unique.size!==1){excluded.conflicting_value++;reason='Conflicting readings at this timestamp';}else value=values[0]*d.factor;
    rows.push({at:new Date(at).toISOString(),value,unit:d.unit,reason,generated_at:points.map(p=>p.generatedTime||null),links});
  }
  rows.sort((a,b)=>a.at.localeCompare(b.at));const good=rows.filter(r=>r.value!==null),max=good.length?Math.max(...good.map(r=>r.value)):null,min=good.length?Math.min(...good.map(r=>r.value)):null;
  return {rows:rows.slice(0,2000),matched_timestamps:rows.length,usable_timestamps:good.length,rows_omitted:Math.max(0,rows.length-2000),excluded,unit:d.unit,kind:d.kind,reason:null,datum:datum(product),
    summary:good.length?{min,max,max_at:good.find(r=>r.value===max).at,first_at:good[0].at,last_at:good.at(-1).at,count:good.length}:null,
    thresholds:thresholds(product,d.kind).map(t=>{const matches=good.filter(r=>r.value>=t.value);return {...t,samples_at_or_above:matches.length,first_at:matches[0]?.at||null,last_at:matches.at(-1)?.at||null};})};
}
