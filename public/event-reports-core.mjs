import {capId} from './events-core.mjs';
import {routePassages} from './journey-core.mjs';
export const REPORT_METHOD='2026-10-28.1',DAY=86400000;
const SUPPORTED=new Set(['Tornado Warning','Tornado Watch','Severe Thunderstorm Warning','Severe Thunderstorm Watch','Severe Weather Statement']);
export function reportDay(value){if(!/^\d{4}-\d{2}-\d{2}$/.test(value||'')||!Number.isFinite(Date.parse(value+'T00:00:00Z'))||new Date(value+'T00:00:00Z').toISOString().slice(0,10)!==value||value<'1999-06-01')throw Error('Invalid storm-report day');return value;}
export function reportURL(day){reportDay(day);return 'https://www.spc.noaa.gov/climo/reports/'+day.replaceAll('-','').slice(2)+'_rpts.csv';}
function csv(text){
  if(typeof text!=='string'||text.length>2000000)throw Error('Storm report response exceeds its size limit');const rows=[];let row=[],field='',quoted=false;
  for(let i=0;i<text.length;i++){const c=text[i];if(c==='"'){if(quoted&&text[i+1]==='"'){field+='"';i++;}else quoted=!quoted;}else if(c===','&&!quoted){row.push(field);field='';}else if((c==='\n'||c==='\r')&&!quoted){if(c==='\r'&&text[i+1]==='\n')i++;row.push(field);if(row.some(s=>s.length))rows.push(row);row=[];field='';}else field+=c;}
  if(quoted)throw Error('Invalid unterminated storm-report CSV');row.push(field);if(row.some(s=>s.length))rows.push(row);if(rows.length>10003)throw Error('Storm report row limit exceeded');return rows;
}
export async function parseStormReports(text,day){
  reportDay(day);const rows=csv(text),seen=new Set(),reports=[],sections=new Set();let kind=null,invalid=0,duplicates=0;
  for(const row of rows){if(row[0]==='Time'){kind={F_Scale:'tornado',Speed:'wind',Size:'hail'}[row[1]];if(!kind||row.slice(2).join(',')!=='Location,County,State,Lat,Lon,Comments')throw Error('Invalid storm report header');sections.add(kind);continue;}
    if(!kind||row.length<8)throw Error('Invalid storm report CSV structure');
    const [hhmm,magnitude,location,county,state,latText,lonText,...comments]=row,h=Number(hhmm.slice(0,2)),m=Number(hhmm.slice(2)),lat=Number(latText),lon=Number(lonText);
    if(!/^\d{4}$/.test(hhmm)||h>23||m>59||!latText.trim()||!lonText.trim()||!Number.isFinite(lat)||!Number.isFinite(lon)||Math.abs(lat)>90||Math.abs(lon)>180){invalid++;continue;}
    const at=Date.parse(day+'T00:00:00Z')+(h<12?DAY:0)+(h*60+m)*60000;
    const value=/^\d+(\.\d+)?$/.test(magnitude)?Number(magnitude):null;
    const record={kind,observed_at:new Date(at).toISOString(),location,county,state,latitude:lat,longitude:lon,reported_magnitude:magnitude,magnitude:kind==='tornado'?null:value===null?null:kind==='hail'?value/100:value,unit:kind==='hail'?'inches':kind==='wind'?'mph':null,comments:comments.join(','),data_kind:'preliminary-report',publication_time:null};
    const normalized=JSON.stringify(record);if(seen.has(normalized)){duplicates++;continue;}seen.add(normalized);const id=[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(normalized)))].map(v=>v.toString(16).padStart(2,'0')).join('');reports.push({id,...record});
  }
  if(sections.size!==3)throw Error('Incomplete storm report sections');
  return {day,source:'NOAA / Storm Prediction Center',source_url:reportURL(day),source_page:reportURL(day).replace('_rpts.csv','_rpts.html'),data_kind:'preliminary-report',issued_at:null,raw_csv:text,reports,invalid_rows:invalid,duplicate_rows:duplicates};
}
export function alertReportScope(story,now,{supported=SUPPORTED}={}){
  const unique=new Map();for(const t of story.transitions){if(t.present!==0)unique.set(t.id+':'+t.revision,t);}
  const all=[...unique.values()],windows=[],unsupported=new Set();let invalid=0;
  for(const t of all){const p=t.feature.properties;if(p.status!=='Actual'||p.messageType==='Cancel')continue;if(supported&&!supported.has(p.event)){unsupported.add(p.event);continue;}
    const sent=Date.parse(p.sent),onset=Date.parse(p.onset||p.effective||p.sent),expiry=Date.parse(p.ends||p.expires),start=Math.max(sent,onset);let end=expiry;
    if(![sent,onset,expiry].every(Number.isFinite)||expiry<=start){invalid++;continue;}
    const cap=capId(p.id||t.feature.id);
    for(const successor of all){if(successor===t)continue;const q=successor.feature.properties,issued=Date.parse(q.sent);if(issued>=start&&(q.references||[]).some(r=>capId(r.identifier||r['@id'])===cap))end=Math.min(end,issued);}
    if(end<=start)continue;
    windows.push({message_id:t.id,revision:t.revision,event:p.event,collected_at:t.first_collected||t.at,start:new Date(start).toISOString(),end:new Date(end).toISOString(),feature:t.feature});
  }
  const days=new Set();let tooLong=false;
  for(const w of windows){const start=Date.parse(w.start),end=Math.min(now,Date.parse(w.end)-1);if(end<start)continue;let d=Math.floor((start-12*3600000)/DAY)*DAY;const last=Math.floor((end-12*3600000)/DAY)*DAY;for(;d<=last&&days.size<32;d+=DAY)days.add(new Date(d).toISOString().slice(0,10));if(d<=last)tooLong=true;}
  const ordered=[...days].sort();return {windows,days:ordered.slice(0,3),days_omitted:Math.max(0,ordered.length-3),span_exceeds_limit:tooLong,invalid_windows:invalid,unsupported_events:[...unsupported]};
}
export function inReportArea(geometry,report){const coordinate=[report.longitude,report.latitude];const hits=routePassages({vertices:[{coordinate,elapsed:0},{coordinate,elapsed:1}]},geometry);return hits===null?null:hits.length>0;}
export function matchEventReports(scope,products,areas,asOf){
  const matches=new Map();let future=0;for(const product of products){for(const report of product.reports){const at=Date.parse(report.observed_at);if(at>asOf){future++;continue;}
    const links=[];for(const w of scope.windows){if(at<Date.parse(w.start)||at>=Date.parse(w.end))continue;const area=areas.find(a=>a.message_id===w.message_id&&a.revision===w.revision);if(!area)continue;
      const hits=area.geometries.filter(g=>inReportArea(g.geometry,report)===true);if(hits.length)links.push({message_id:w.message_id,revision:w.revision,event:w.event,start:w.start,end:w.end,coverage:area.kind,matched_boundaries:hits.map(g=>({source_url:g.source_url,revision:g.revision,checked_at:g.checked_at}))});
    }
    if(links.length){const old=matches.get(report.id);if(old)old.links.push(...links);else matches.set(report.id,{...report,links,source_day:product.day,source_revision:product.revision,source_checked_at:product.checked_at,source_url:product.source_url});}
  }}return {matches:[...matches.values()].sort((a,b)=>a.observed_at.localeCompare(b.observed_at)),future_reports_excluded:future};
}
