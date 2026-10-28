import {pack,unpack,hash} from './archive-codec.mjs';
import {capId,eventId,validEventId} from '../public/events-core.mjs';
// Event timestamps are integer milliseconds; weather-cache clocks remain seconds.
const iso=at=>new Date(at).toISOString();
// All writes share the collector transaction and its lease token. No partial snapshot can retire an alert.
export async function eventWrites(weather,features,at,token,dataset,complete){
  const messages=await Promise.all(features.filter(f=>f.properties.status==='Actual').map(async feature=>({feature,cap:capId(feature.properties.id||feature.id),id:await eventId(feature.properties.id||feature.id),revision:await hash(feature)})));
  const ids=messages.map(m=>m.id),rows=await weather.statement('SELECT * FROM event_heads WHERE present=1 OR id IN (SELECT value FROM json_each(?))',JSON.stringify(ids)).all(),heads=new Map(rows.results.map(r=>[r.id,r]));
  const owns='EXISTS(SELECT 1 FROM datasets WHERE name=? AND lease_token=?)',batch=[];
  if(complete){batch.push(weather.statement(`INSERT OR IGNORE INTO event_collections(at) SELECT ? WHERE ${owns}`,at,dataset,token));batch.push(weather.statement(`UPDATE event_heads SET last_seen=? WHERE id IN (SELECT value FROM json_each(?)) AND ${owns}`,at,JSON.stringify(ids),dataset,token));}
  for(const m of messages){const old=heads.get(m.id),p=m.feature.properties,present=complete?1:null;
    if(old?.revision===m.revision&&(!complete||old.present===1))continue;
    batch.push(weather.statement(`INSERT OR IGNORE INTO event_revisions(id,revision,collected_at,issued_at,payload) SELECT ?,?,?,?,? WHERE ${owns}`,m.id,m.revision,at,p.sent||null,await pack(m.feature),dataset,token));
    const conflict=complete?'DO UPDATE SET revision=excluded.revision,last_seen=excluded.last_seen,present=excluded.present,name=excluded.name,area=excluded.area,message_type=excluded.message_type':'DO NOTHING';
    batch.push(weather.statement(`INSERT INTO event_heads(id,cap_id,revision,first_seen,last_seen,present,name,area,message_type) SELECT ?,?,?,?,?,?,?,?,? WHERE ${owns} ON CONFLICT(id) ${conflict}`,m.id,m.cap,m.revision,at,at,present,p.event||'Weather alert',p.areaDesc||'',p.messageType||'Unknown',dataset,token));
    batch.push(weather.statement(`INSERT OR ${complete?'REPLACE':'IGNORE'} INTO event_transitions(id,at,revision,present,origin) SELECT ?,?,?,?,? WHERE ${owns}`,m.id,at,m.revision,present,complete?'active-feed':'reference',dataset,token));
    for(const ref of p.references||[]){const targetCap=capId(ref.identifier||ref['@id']),target=await eventId(targetCap);if(target===m.id)continue;batch.push(weather.statement(`INSERT OR IGNORE INTO event_links(source,target,target_cap,first_seen) SELECT ?,?,?,? WHERE ${owns}`,m.id,target,targetCap,at,dataset,token));}
  }
  if(complete){const live=new Set(ids);for(const old of rows.results)if(old.present===1&&!live.has(old.id)){
    batch.push(weather.statement(`UPDATE event_heads SET present=0 WHERE id=? AND ${owns}`,old.id,dataset,token));
    batch.push(weather.statement(`INSERT OR REPLACE INTO event_transitions(id,at,revision,present,origin) SELECT ?,?,?,0,'active-feed' WHERE ${owns}`,old.id,at,old.revision,dataset,token));
  }}return batch;
}
export class EventsService{
  constructor(weather){this.weather=weather;}
  async list(query='',cursor=''){
    if(query.length>120)throw new Error('Invalid archive search');let before=Number.MAX_SAFE_INTEGER,after='';
    if(cursor){const m=/^(\d+):([a-f0-9]{64})$/.exec(cursor);if(!m)throw new Error('Invalid archive cursor');before=Number(m[1]);after=m[2];}
    const rows=await this.weather.statement("SELECT id,cap_id,first_seen,last_seen,present,name,area,message_type FROM event_heads WHERE instr(lower(name||' '||area),lower(?))>0 AND (first_seen<? OR (first_seen=? AND id>?)) ORDER BY first_seen DESC,id LIMIT 51",query,before,before,after).all();
    const page=rows.results.slice(0,50),last=page.at(-1),check=await this.weather.statement('SELECT MAX(at) AS at FROM event_collections').first();
    return {messages:page.map(r=>({...r,first_seen:iso(r.first_seen),last_seen:iso(r.last_seen)})),next_cursor:rows.results.length>50?last.first_seen+':'+last.id:null,last_collection:check.at?iso(check.at):null};
  }
  async component(id,at){
    validEventId(id);
    const rows=await this.weather.statement(`WITH RECURSIVE connected(id) AS (SELECT ? UNION SELECT CASE WHEN l.source=c.id THEN l.target ELSE l.source END FROM event_links l JOIN connected c ON l.source=c.id OR l.target=c.id WHERE l.first_seen<=? LIMIT 501) SELECT id FROM connected`,id,at).all();
    if(rows.results.length>500)throw new Error('This alert chain exceeds the archive view limit');return rows.results.map(r=>r.id);
  }
  async story(id,at=this.weather.eventClock()/1000){
    if(!Number.isFinite(at)||at*1000>this.weather.eventClock()+1||at<0)throw new Error('Invalid archive time');
    at=Math.floor(at*1000);
    const ids=await this.component(id,at),encoded=JSON.stringify(ids);
    const rows=await this.weather.statement('SELECT t.id,t.at,t.revision,t.present,t.origin,r.issued_at,r.collected_at,r.payload FROM event_transitions t JOIN event_revisions r ON r.id=t.id AND r.revision=t.revision WHERE t.id IN (SELECT value FROM json_each(?)) AND t.at<=? ORDER BY t.at,t.id LIMIT 2001',encoded,at).all();
    if(!rows.results.length)return null;if(rows.results.length>2000)throw new Error('This timeline exceeds the archive view limit');
    const transitions=[];for(const r of rows.results)transitions.push({id:r.id,at:iso(r.at),revision:r.revision,present:r.present,origin:r.origin,issued_at:r.issued_at,first_collected:iso(r.collected_at),feature:await unpack(r.payload)});
    const check=await this.weather.statement('SELECT MAX(at) AS at FROM event_collections WHERE at<=?',at).first(),known=new Set(transitions.map(t=>t.id));
    const refs=await this.weather.statement('SELECT DISTINCT target AS id,target_cap AS cap_id FROM event_links WHERE first_seen<=? AND source IN (SELECT value FROM json_each(?))',at,encoded).all();
    return {id,as_of:iso(at),last_collection:check.at?iso(check.at):null,transitions,missing_references:refs.results.filter(r=>!known.has(r.id)),scope:'Explicit NWS CAP references; not a verified physical-storm identity',retention:'Persistent archive from actual collection; no automatic pruning'};
  }
  async resolve(id){
    const story=await this.story(id);if(!story)return null;
    const missing=story.missing_references.slice(0,5);if(!missing.length)return {retrieved:0,remaining:0,failures:[]};
    const batchId=await hash(missing.map(ref=>ref.id).sort());
    const result=await this.weather.collect('event-reference/'+id+'/'+batchId,3600,async signal=>{
      const features=[],failures=[];
      for(const ref of missing){try{const feature=await this.weather.source('https://api.weather.gov/alerts/'+encodeURIComponent(ref.cap_id),signal);if(feature?.type!=='Feature'||feature.properties?.status!=='Actual'||capId(feature.properties.id||feature.id)!==ref.cap_id)throw new Error('Invalid referenced alert');features.push(feature);}catch(error){failures.push({id:ref.id,error:String(error.message)});}}
      return {type:'FeatureCollection',features,failures};
    });
    return {retrieved:result.data.features.length,failures:result.data.failures,checked_at:result.checked_at,remaining:(await this.story(id)).missing_references.length};
  }
}
