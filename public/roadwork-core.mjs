/* Agency work-zone context, not network-level closure matching. Apache-2.0. */
import {nearbyRoadLabels} from './journey-roads.mjs';
export const ROADWORK_METHOD='2026-10-29.2';
export const ROADWORK_FEEDS=Object.freeze({
  md:{name:'Maryland DOT SHA',region:'Maryland',url:'https://filter.ritis.org/wzdx_v4.1/mdot.geojson'},
  ia:{name:'Iowa DOT',region:'Iowa',url:'https://iowa-atms.cloud-q-free.com/api/rest/dataprism/wzdx/wzdxfeed'},
  wa:{name:'Washington State DOT',region:'Washington',url:'https://wzdx.wsdot.wa.gov/api/v4/WorkZoneFeed'},
});
export const ROADWORK_RADIUS=250;
const stamp=s=>typeof s==='string'&&/(Z|[+-]\d{2}:\d{2})$/.test(s)&&Number.isFinite(Date.parse(s))?Date.parse(s):null;
const valid=p=>Array.isArray(p)&&p.length>=2&&p.every(Number.isFinite)&&p[0]>=-130&&p[0]<=-60&&p[1]>=20&&p[1]<=55;
const box=(a,b=a)=>[Math.min(a[0],b[0]),Math.min(a[1],b[1]),Math.max(a[0],b[0]),Math.max(a[1],b[1])];
const intersects=(a,b)=>a[0]<=b[2]&&a[2]>=b[0]&&a[1]<=b[3]&&a[3]>=b[1];
const merge=spans=>{const out=[];for(const s of spans.sort((a,b)=>a[0]-b[0])){const last=out.at(-1);if(last&&s[0]<=last[1]+.001)last[1]=Math.max(last[1],s[1]);else out.push(s.slice());}return out;};
export function roadVerification(properties,current,legacy){
  if(Object.hasOwn(properties,current)){const value=properties[current];return {value:typeof value==='boolean'?value:null,field:current,status:typeof value==='boolean'?(value?'verified':'unverified'):'invalid'};}
  if(Object.hasOwn(properties,legacy)){const value=properties[legacy];return {value:value==='verified'?true:value==='estimated'?false:null,field:legacy,status:value==='verified'?'verified':value==='estimated'?'unverified':'invalid'};}
  return {value:null,field:null,status:'unknown'};
}
export function roadActivity(event,issuedAt){
  const reference=stamp(issuedAt),result=(status,reason,usable)=>({status,reason,usable,reference_time:reference===null?null:issuedAt});
  if(['cancelled','completed'].includes(event.event_status))return result('reported_'+event.event_status,'The agency marks this record '+event.event_status+'.',false);
  if(event.end_verified===true){
    if(event.end_ms===null||reference===null)return result('reported_ended_time_unknown','The source reports that work ended, but its date or feed time is unavailable.',false);
    if(event.end_ms>reference+60000)return result('conflicting_end_confirmation','The source confirms work ended but gives an end date later than the feed generation time.',false);
    return result('reported_ended','The source reports that work ended.',false);
  }
  if(event.start_verified===true&&event.start_ms!==null&&reference!==null&&event.start_ms>reference+60000)return result('conflicting_start_confirmation','The source confirms work started but gives a start date later than the feed generation time.',false);
  if(['start_date','end_date'].some(k=>event.verification?.[k]?.status==='invalid'))return result('invalid_confirmation','A supplied start/end confirmation field is invalid; current applicability is unknown.',false);
  return result('not_confirmed_active','Reported dates describe a window; they do not confirm continuous work or current driving access.',true);
}
export function normalizeRoadwork(raw,feed){
  if(!Object.hasOwn(ROADWORK_FEEDS,feed)||raw?.type!=='FeatureCollection'||!Array.isArray(raw.features)||raw.features.length>5000)throw Error('Invalid or oversized work-zone feed');
  const meta=raw.feed_info||raw.road_event_feed_info;if(!meta||!['4','4.0','4.1','4.2'].includes(meta.version)||!stamp(meta.update_date)||typeof meta.publisher!=='string'||!Array.isArray(meta.data_sources))throw Error('Unsupported work-zone metadata');
  if(raw.feed_info&&raw.road_event_feed_info&&['version','update_date','publisher'].some(k=>raw.feed_info[k]!==raw.road_event_feed_info[k]))throw Error('Conflicting work-zone headers');
  const audit={returned:raw.features.length,invalid:0,duplicate:0,conflicting:0,unknown_source_id:0},groups=new Map(),events=[];let vertices=0;
  for(const f of raw.features){if(f?.type!=='Feature'||typeof f.id!=='string'||!f.id||f.id.length>300){audit.invalid++;continue;}const g=groups.get(f.id)||[];g.push(f);groups.set(f.id,g);}
  for(const rows of groups.values()){if(rows.some(r=>JSON.stringify(r)!==JSON.stringify(rows[0]))){audit.conflicting+=rows.length;continue;}audit.duplicate+=rows.length-1;const f=rows[0],p=f.properties,c=p?.core_details,g=f.geometry;
    if(c?.event_type!=='work-zone'||!Array.isArray(c.road_names)||!c.road_names.length||c.road_names.some(n=>typeof n!=='string')||!['MultiPoint','LineString'].includes(g?.type)||!Array.isArray(g.coordinates)||g.coordinates.length<(g.type==='LineString'?2:1)||g.coordinates.length>2000||!g.coordinates.every(valid)){audit.invalid++;continue;}
    vertices+=g.coordinates.length;if(vertices>100000)throw Error('Work-zone geometry exceeds its capacity');
    const sourceListed=meta.data_sources.some(s=>s.data_source_id===c.data_source_id);if(!sourceListed)audit.unknown_source_id++;
    const start=stamp(p.start_date),end=stamp(p.end_date),timesKnown=start!==null&&end!==null&&end>start;
    const verification={start_date:roadVerification(p,'is_start_date_verified','start_date_accuracy'),end_date:roadVerification(p,'is_end_date_verified','end_date_accuracy'),start_position:roadVerification(p,'is_start_position_verified','beginning_accuracy'),end_position:roadVerification(p,'is_end_position_verified','ending_accuracy')};
    const text=value=>typeof value==='string'&&value.length<=500?value:null,number=value=>typeof value==='number'&&Number.isFinite(value)?value:null;
    events.push({id:f.id,roads:c.road_names,direction:typeof c.direction==='string'?c.direction:'unknown',description:typeof c.description==='string'?c.description:'',vehicle_impact:typeof p.vehicle_impact==='string'?p.vehicle_impact:'unknown',source_id:c.data_source_id||null,source_id_listed:sourceListed,start_date:p.start_date||null,end_date:p.end_date||null,start_ms:timesKnown?start:null,end_ms:timesKnown?end:null,updated_at:stamp(c.update_date)!==null?c.update_date:null,event_status:typeof p.event_status==='string'?p.event_status:null,verification,start_verified:verification.start_date.value,end_verified:verification.end_date.value,start_position_verified:verification.start_position.value,end_position_verified:verification.end_position.value,
      location_method:text(p.location_method),beginning_cross_street:text(p.beginning_cross_street),ending_cross_street:text(p.ending_cross_street),beginning_milepost:number(p.beginning_milepost),ending_milepost:number(p.ending_milepost),geometry:g});
  }
  return {method:ROADWORK_METHOD,feed,provider:ROADWORK_FEEDS[feed],issued_at:meta.update_date,meta,audit,events,raw};
}
// A bounding-volume tree keeps the full road path without reducing it to weather samples.
function routeTree(route){const segments=route.vertices.slice(1).map((b,i)=>({a:route.vertices[i],b,bounds:box(route.vertices[i].coordinate,b.coordinate)})).filter(s=>Math.abs(s.a.coordinate[0]-s.b.coordinate[0])<=180);
  function build(rows){const bounds=rows.reduce((a,s)=>[Math.min(a[0],s.bounds[0]),Math.min(a[1],s.bounds[1]),Math.max(a[2],s.bounds[2]),Math.max(a[3],s.bounds[3])],[Infinity,Infinity,-Infinity,-Infinity]);return rows.length<=16?{bounds,rows}:{bounds,children:[build(rows.slice(0,Math.floor(rows.length/2))),build(rows.slice(Math.floor(rows.length/2)))]};}return build(segments);}
function nearby(tree,bounds,out){if(!intersects(tree.bounds,bounds))return;if(tree.rows){for(const row of tree.rows)if(intersects(row.bounds,bounds))out.push(row);}else for(const child of tree.children)nearby(child,bounds,out);}
function linearRange(value,slope,low,high){if(Math.abs(slope)<1e-12)return value>=low&&value<=high?[0,1]:null;const a=(low-value)/slope,b=(high-value)/slope,start=Math.max(0,Math.min(a,b)),end=Math.min(1,Math.max(a,b));return start<=end?[start,end]:null;}
function circle(a,d,c,r){const x=a[0]-c[0],y=a[1]-c[1],aa=d[0]**2+d[1]**2,cc=x*x+y*y-r*r;if(aa<1e-12)return cc<=0?[0,1]:null;const bb=2*(x*d[0]+y*d[1]),disc=bb*bb-4*aa*cc;if(disc<0)return null;const t=Math.sqrt(disc),start=Math.max(0,(-bb-t)/(2*aa)),end=Math.min(1,(-bb+t)/(2*aa));return start<=end?[start,end]:null;}
function capsule(a,b,c,d,r){const delta=[b[0]-a[0],b[1]-a[1]],out=[circle(a,delta,c,r),circle(a,delta,d,r)].filter(Boolean),vx=d[0]-c[0],vy=d[1]-c[1],length=Math.hypot(vx,vy);if(length>0){const x=(a[0]-c[0])*vx/length+(a[1]-c[1])*vy/length,y=-(a[0]-c[0])*vy/length+(a[1]-c[1])*vx/length,dx=(delta[0]*vx+delta[1]*vy)/length,dy=(-delta[0]*vy+delta[1]*vx)/length,xx=linearRange(x,dx,0,length),yy=linearRange(y,dy,-r,r);if(xx&&yy&&Math.max(xx[0],yy[0])<=Math.min(xx[1],yy[1]))out.push([Math.max(xx[0],yy[0]),Math.min(xx[1],yy[1])]);}return merge(out);}
export function prepareRoadwork(route,products,{maxChecks=2000000}={}){
  if(!Array.isArray(route?.vertices)||route.vertices.length<2||route.vertices.length>50004||route.vertices.some((v,i)=>!Array.isArray(v.coordinate)||v.coordinate.length<2||!v.coordinate.every(Number.isFinite)||Math.abs(v.coordinate[0])>180||Math.abs(v.coordinate[1])>90||!Number.isFinite(v.elapsed)||v.elapsed<0||(i>0&&v.elapsed<route.vertices[i-1].elapsed)))throw Error('Invalid timed route');
  const tree=routeTree(route),feeds=[];let checks=0;
  for(const product of products){const row={feed:product.feed,provider:ROADWORK_FEEDS[product.feed],issued_at:product.issued_at||null,checked_at:product.checked_at||null,revision:product.revision||null,error:product.error||null,stale:!!product.stale,audit:product.audit||null,candidates:[],limited:false};
    for(const event of product.events||[]){if(checks>=maxChecks){row.limited=true;break;}const coords=event.geometry.coordinates,pairs=event.geometry.type==='MultiPoint'?coords.map(p=>[p,p]):coords.slice(1).map((p,i)=>[coords[i],p]),spans=[];
      for(const [c,d] of pairs){const latitude=(c[1]+d[1])/2,xscale=111320*Math.cos(latitude*Math.PI/180),yscale=111320,bounds=box(c,d),padX=ROADWORK_RADIUS/xscale,padY=ROADWORK_RADIUS/yscale,candidates=[];nearby(tree,[bounds[0]-padX,bounds[1]-padY,bounds[2]+padX,bounds[3]+padY],candidates);const project=p=>[(p[0]-c[0])*xscale,(p[1]-c[1])*yscale];
        for(const segment of candidates){if(++checks>maxChecks){row.limited=true;break;}for(const [left,right] of capsule(project(segment.a.coordinate),project(segment.b.coordinate),[0,0],project(d),ROADWORK_RADIUS))spans.push([segment.a.elapsed+(segment.b.elapsed-segment.a.elapsed)*left,segment.a.elapsed+(segment.b.elapsed-segment.a.elapsed)*right]);}if(row.limited)break;}
      const merged=merge(spans);if(merged.length)row.candidates.push({...event,spans:merged.slice(0,200),spans_omitted:Math.max(0,merged.length-200)});if(row.limited)break;
    }feeds.push(row);
  }return {method:ROADWORK_METHOD,road_context:route.road_context||null,radius_m:ROADWORK_RADIUS,checks,feeds,dateline_segments_omitted:route.vertices.slice(1).filter((v,i)=>Math.abs(v.coordinate[0]-route.vertices[i].coordinate[0])>180).length,complete:false};
}
export function evaluateRoadwork(prepared,departure,now=Date.now()){
  const {road_context,...base}=prepared;
  return {...base,feeds:prepared.feeds.map(feed=>{const issued=stamp(feed.issued_at),checked=stamp(feed.checked_at),fresh=!feed.error&&!feed.stale&&issued!==null&&checked!==null&&now-issued<=1800000&&now-issued>=-60000&&now-checked<=900000&&now-checked>=-60000;
    const candidates=[];for(const event of feed.candidates){const timeKnown=event.start_ms!==null&&event.end_ms!==null,spans=event.spans.map(([a,b])=>[departure+a*1000,departure+b*1000]).map(([a,b])=>timeKnown?[Math.max(a,event.start_ms),Math.min(b,event.end_ms)]:[a,b]).filter(([a,b])=>a<=b&&(!timeKnown||a<event.end_ms));if(spans.length)candidates.push({...event,activity:roadActivity(event,feed.issued_at),road_labels:nearbyRoadLabels(road_context,event,spans.map(s=>s.map(t=>(t-departure)/1000))),time_known:timeKnown,usable_timing:fresh&&timeKnown&&roadActivity(event,feed.issued_at).usable,passages:spans.map(s=>s.map(t=>new Date(t).toISOString()))});}
    return {...feed,fresh,candidates};})};
}
