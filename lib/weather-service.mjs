/* Hosted collector and durable decision-time archive. Apache-2.0. */
import {pack,unpack,hash} from './archive-codec.mjs';
import {eventWrites} from './events-service.mjs';
export {pack,unpack} from './archive-codec.mjs';
export const NWS='https://api.weather.gov';
export const iso=seconds=>new Date(seconds*1000).toISOString();
export function pointKey(lat,lon){
  if(lat===null||lon===null||String(lat).trim()===''||String(lon).trim()==='')throw new Error('Coordinates are required');
  lat=Number(lat);lon=Number(lon);
  if(!Number.isFinite(lat)||!Number.isFinite(lon)||lat< -90||lat>90||lon< -180||lon>180)throw new Error('Invalid coordinates');
  return `${lat.toFixed(4)},${lon.toFixed(4)}`;
}
export function validateAlerts(data){
  if(data?.type!=='FeatureCollection'||!Array.isArray(data.features)||!data.features.every(f=>f?.type==='Feature'&&typeof f.id==='string'&&f.properties&&typeof f.properties==='object'))throw new Error('Invalid alert collection');
  return data;
}
export function validateForecast(data){
  const periods=data?.properties?.periods;
  if(!Array.isArray(periods)||!periods.length||!periods.every(h=>Number.isFinite(Date.parse(h.startTime))&&Date.parse(h.endTime)>Date.parse(h.startTime)))throw new Error('Invalid hourly forecast');
  return data;
}
export function changesBetween(previous,current,at){
  const old=previous?.features||[],next=current.features,matched=new Set(),changes=[];
  for(const f of next){
    const p=f.properties, prior=old.find(o=>o.id===f.id)||old.find(o=>(p.references||[]).some(r=>r.identifier===o.properties.id));
    if(prior)matched.add(prior.id);
    const kind=!prior?'new':JSON.stringify(prior)!==JSON.stringify(f)?'updated':null;
    if(kind)changes.push({id:f.id,kind,at:iso(at),event:p.event,area:p.areaDesc});
  }
  for(const f of old)if(!matched.has(f.id)&&!next.some(n=>n.id===f.id))changes.push({id:f.id,kind:'left active feed',at:iso(at),event:f.properties.event,area:f.properties.areaDesc});
  return changes;
}
export class WeatherService{
  constructor(db,{fetcher=fetch,clock=null}={}){this.db=db;this.fetcher=fetcher;this.clock=clock||(()=>Math.floor(Date.now()/1000));this.eventClock=clock?()=>clock()*1000:()=>Date.now();}
  statement(sql,...values){return this.db.prepare(sql).bind(...values);}
  async state(name){return await this.statement('SELECT * FROM datasets WHERE name=?',name).first()||{};}
  /** @param {string} name @param {number|null} [at] */
  async read(name,at=null){
    const row=at===null?await this.statement('SELECT r.*,d.last_success,d.error FROM revisions r JOIN datasets d ON d.name=r.dataset AND d.revision=r.revision WHERE d.name=?',name).first():await this.statement('SELECT r.*,c.at AS last_success FROM checks c JOIN revisions r ON r.dataset=c.dataset AND r.revision=c.revision WHERE c.dataset=? AND c.at<=? ORDER BY c.at DESC LIMIT 1',name,at).first();
    return row?{data:await unpack(row.payload),revision:row.revision,collected_at:iso(row.first_seen),checked_at:iso(row.last_success),issued_at:row.issued_at,error:row.error||null}:null;
  }
  async source(url,signal){
    const parsed=new URL(url);
    if(parsed.origin!==NWS)throw new Error('Untrusted source URL');
    const response=await this.fetcher(url,{headers:{Accept:'application/geo+json, application/json','User-Agent':'VentusIQ-OpenWeather/0.2 (https://github.com/Doichinstein/weather-commons)'},signal});
    if(!response.ok)throw new Error(`NWS returned HTTP ${response.status}`);
    return response.json();
  }
  async collect(name,interval,loader){
    const now=this.clock(),token=crypto.randomUUID();
    const before=await this.state(name);
    if(!before.name&&name.startsWith('observations/')){
      const count=await this.statement("SELECT COUNT(*) AS n FROM datasets WHERE name LIKE 'observations/%'").first();
      if(count.n>=1000)throw new Error('Shared observation cache is at capacity. Please try an existing station or point.');
    }
    if(!before.name&&name.startsWith('forecast/')){
      const count=await this.statement("SELECT COUNT(*) AS n FROM datasets WHERE name LIKE 'forecast/%'").first();
      if(count.n>=1000)throw new Error('Shared forecast cache is at capacity. Please try an existing point.');
    }
    // A database lease deduplicates collection across Worker isolates.
    const lease=await this.statement('INSERT INTO datasets(name,next_fetch,lease_until,lease_token) VALUES (?,0,?,?) ON CONFLICT(name) DO UPDATE SET lease_until=excluded.lease_until,lease_token=excluded.lease_token WHERE datasets.next_fetch<=? AND datasets.lease_until<=? RETURNING name',name,now+90,token,now,now).first();
    if(lease){
      try{
        const previous=name==='alerts/us'?await this.read(name):null;
        const data=await loader(AbortSignal.timeout(45000)),at=this.clock(),revision=await hash(data),payload=await pack(data);
        const issued=data.forecast?.properties?.updateTime||data.updated||null;
        const owns='EXISTS(SELECT 1 FROM datasets WHERE name=? AND lease_token=?)';
        const batch=[
          this.statement(`INSERT OR IGNORE INTO revisions(dataset,revision,first_seen,issued_at,payload) SELECT ?,?,?,?,? WHERE ${owns}`,name,revision,at,issued,payload,name,token),
          this.statement(`INSERT OR REPLACE INTO checks(dataset,at,revision) SELECT ?,?,? WHERE ${owns}`,name,at,revision,name,token),
        ];
        if(name==='alerts/us')batch.push(this.statement(`INSERT OR REPLACE INTO change_batches(at,payload) SELECT ?,? WHERE ${owns}`,at,await pack(changesBetween(previous?.data,data,at)),name,token));
        if(name==='alerts/us'||name.startsWith('event-reference/'))batch.push(...await eventWrites(this,data.features,this.eventClock(),token,name,name==='alerts/us'));
        batch.push(this.statement('UPDATE datasets SET revision=?,last_success=?,next_fetch=?,lease_until=0,lease_token=NULL,error=NULL WHERE name=? AND lease_token=?',revision,at,at+interval,name,token));
        await this.db.batch(batch);
        if(name==='alerts/us')await this.db.batch([
          this.statement("DELETE FROM checks WHERE dataset='alerts/us' AND at<?",at-86400),
          this.statement('DELETE FROM change_batches WHERE at<?',at-86400),
          this.statement("DELETE FROM revisions WHERE dataset='alerts/us' AND NOT EXISTS(SELECT 1 FROM checks c WHERE c.dataset=revisions.dataset AND c.revision=revisions.revision) AND revision<>(SELECT revision FROM datasets WHERE name='alerts/us')"),
        ]);
        // Hazard observations are retained for seven days; current last-good data survives outages.
        if(name.startsWith('hazards/')||name.startsWith('observations/'))await this.db.batch([
          this.statement('DELETE FROM checks WHERE dataset=? AND at<?',name,at-7*86400),
          this.statement('DELETE FROM revisions WHERE dataset=? AND NOT EXISTS(SELECT 1 FROM checks c WHERE c.dataset=revisions.dataset AND c.revision=revisions.revision) AND revision<>(SELECT revision FROM datasets WHERE name=?)',name,name),
        ]);
      }catch(error){
        await this.statement('UPDATE datasets SET error=?,next_fetch=?,lease_until=0,lease_token=NULL WHERE name=? AND lease_token=?',String(error.message).slice(0,300),this.clock()+120,name,token).run();
      }
    }
    const result=await this.read(name),state=await this.state(name);
    if(!result)throw new Error(state.error||'Collection is warming up. Retry shortly.');
    return {...result,error:state.error||null,stale:!!state.error||this.clock()-state.last_success>Math.max(interval*1.5,90)};
  }
  async alerts(){
    const result=await this.collect('alerts/us',60,async signal=>{
      let url=NWS+'/alerts/active?status=actual',updated=null;const seen=new Set(),features=new Map();
      while(url){
        if(seen.has(url)||seen.size>=20)throw new Error('Unexpected NWS pagination');seen.add(url);
        const data=validateAlerts(await this.source(url,signal));updated=data.updated||updated;
        for(const f of data.features)if(f.properties.status==='Actual'&&f.properties.messageType!=='Cancel')features.set(f.id,f);
        url=data.pagination?.next;
      }
      return {type:'FeatureCollection',features:[...features.values()],updated};
    });
    // Alert replay uses check time; unchanged source revisions still have distinct checks.
    return {...result.data,collected_at:result.checked_at};
  }
  async forecast(lat,lon){
    const point=pointKey(lat,lon);
    const result=await this.collect('forecast/'+point,600,async signal=>{
      const metadata=await this.source(NWS+'/points/'+point,signal),url=metadata.properties?.forecastHourly;
      if(!/^https:\/\/api\.weather\.gov\/gridpoints\/[^/]+\/[^/]+\/forecast\/hourly$/.test(url||''))throw new Error('Hourly forecasts unavailable for this location');
      return {metadata,forecast:validateForecast(await this.source(url,signal)),source_url:url};
    });
    return {...result.data,point,revision:result.revision,collected_at:result.collected_at,checked_at:result.checked_at,issued_at:result.issued_at,stale:result.stale,error:result.error};
  }
  async zone(path){
    if(!/^\/zones\/(county|forecast|fire|coastal|offshore)\/\w{6}$/.test(path))throw new Error('Invalid NWS zone');
    const result=await this.collect(path,30*86400,async signal=>{const data=await this.source(NWS+path,signal);if(!data.geometry)throw new Error('No official geometry');return data;});
    return result.data;
  }
  async history(name){const r=await this.statement('SELECT at,revision FROM checks WHERE dataset=? ORDER BY at DESC LIMIT 1500',name).all();return r.results.reverse().map(r=>({at:iso(r.at),revision:r.revision}));}
  async changes(){const rows=await this.statement('SELECT payload FROM change_batches ORDER BY at DESC LIMIT 200').all();const changes=[];for(const row of rows.results){changes.push(...await unpack(row.payload));if(changes.length>=200)break;}return changes.slice(0,200);}
  async health(){const state=await this.state('alerts/us'),age=state.last_success?this.clock()-state.last_success:null;return {mode:'hosted',revision:state.revision||null,last_success:state.last_success||null,next_fetch:state.next_fetch||null,last_error:state.error||null,status:age===null?'missing':age>240?'stale':age>90?'aging':'fresh',age_seconds:age,collection_mode:'on-demand'};}
}
