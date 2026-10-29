import {WeatherService,pointKey} from './weather-service.mjs';
import {hash} from './archive-codec.mjs';
import {watchSettings,evaluateWatch} from '../public/watch-core.mjs';
import {RiversService} from './rivers-service.mjs';
import {riverWatchOptions} from '../public/river-watch-core.mjs';
const iso=n=>n===null?null:new Date(n*1000).toISOString();
export class WatchError extends Error{constructor(message,status=400){super(message);this.status=status;}}
function id(value){if(!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(value||''))throw new WatchError('Invalid watch identifier');return value;}
const publicWatch=row=>({id:row.id,label:row.label,point:row.point,settings:JSON.parse(row.settings),enabled:!!row.enabled,created_at:iso(row.created_at),checked_at:iso(row.checked_at),next_check:iso(row.next_check),error:row.error,snapshot:row.baseline?JSON.parse(row.baseline):null,has_feed:!!row.feed_hash});
export class WatchService{
  constructor(weather){this.weather=weather;}
  owner(value){if(!value)throw new WatchError('Sign in to manage watches',401);return value;}
  async owned(owner,value){this.owner(owner);const row=await this.weather.statement('SELECT * FROM watches WHERE id=? AND owner=?',id(value),owner).first();if(!row)throw new WatchError('Watch not found',404);return row;}
  async list(owner){this.owner(owner);const rows=await this.weather.statement('SELECT * FROM watches WHERE owner=? ORDER BY created_at,id',owner).all();return {watches:rows.results.map(publicWatch),limit_per_user:4,global_limit:64};}
  async events(value,limit=200){const r=await this.weather.statement('SELECT id,at,kind,title,payload FROM watch_events WHERE watch_id=? AND at>=? ORDER BY at DESC,id DESC LIMIT ?',value,this.weather.clock()-30*86400,limit).all();return r.results.map(r=>({...r,at:iso(r.at),evidence:JSON.parse(r.payload),payload:undefined}));}
  async detail(owner,value){const row=await this.owned(owner,value);return {watch:publicWatch(row),events:await this.events(row.id),retention:'Up to 200 records and 30 days per watch'};}
  async create(owner,input){this.owner(owner);const watchId=id(input.id),point=pointKey(input.lat,input.lon),label=String(input.label||'').trim(),settings=watchSettings(input.settings);if(!label||label.length>60)throw new WatchError('Place name must contain 1–60 characters');
    const prior=await this.weather.statement('SELECT * FROM watches WHERE id=?',watchId).first();if(prior){if(prior.owner!==owner)throw new WatchError('Watch not found',404);if(prior.point!==point||prior.label!==label||prior.settings!==JSON.stringify(settings))throw new WatchError('This request ID already belongs to different watch settings',409);return publicWatch(prior);}
    // A valid official point is required before enrollment; reading a place never creates a watch.
    if(settings.river){const product=await new RiversService(this.weather).gauge(settings.river.gauge);
      if(!riverWatchOptions(product,this.weather.clock()*1000).some(t=>t.name===settings.river.category))throw new WatchError('A fresh gauge product with this official threshold is required',503);
      if(point!==pointKey(product.metadata.latitude,product.metadata.longitude))throw new WatchError('River watch coordinates must match the selected gauge');
    }else{const forecast=await this.weather.forecast(...point.split(','));if(forecast.stale||forecast.error)throw new WatchError('A fresh official forecast is required to start this watch',503);}
    const now=this.weather.clock(),row=await this.weather.statement('INSERT INTO watches(id,owner,label,point,settings,created_at,updated_at) SELECT ?,?,?,?,?,?,? WHERE (SELECT COUNT(*) FROM watches)<64 AND (SELECT COUNT(*) FROM watches WHERE owner=?)<4 ON CONFLICT(id) DO NOTHING RETURNING *',watchId,owner,label,point,JSON.stringify(settings),now,now,owner).first();
    if(!row){const existing=await this.weather.statement('SELECT * FROM watches WHERE id=? AND owner=?',watchId,owner).first();if(existing){if(existing.point!==point||existing.label!==label||existing.settings!==JSON.stringify(settings))throw new WatchError('This request ID already belongs to different watch settings',409);return publicWatch(existing);}throw new WatchError('Watch capacity reached: four per account and 64 on this public service',429);}return publicWatch(row);
  }
  async change(owner,value,action){const row=await this.owned(owner,value),now=this.weather.clock();
    if(action==='delete'){await this.weather.db.batch([this.weather.statement('DELETE FROM watch_events WHERE watch_id=? AND EXISTS(SELECT 1 FROM watches WHERE id=? AND owner=?)',row.id,row.id,owner),this.weather.statement('DELETE FROM watches WHERE id=? AND owner=?',row.id,owner)]);return {deleted:true};}
    if(action==='feed'){const token=[...crypto.getRandomValues(new Uint8Array(32))].map(v=>v.toString(16).padStart(2,'0')).join('');await this.weather.statement('UPDATE watches SET feed_hash=?,updated_at=? WHERE id=? AND owner=?',await hash(token),now,row.id,owner).run();return {token,id:row.id};}
    if(action==='revoke_feed'){await this.weather.statement('UPDATE watches SET feed_hash=NULL,updated_at=? WHERE id=? AND owner=?',now,row.id,owner).run();return {revoked:true};}
    if(!['pause','resume'].includes(action))throw new WatchError('Unknown watch action');
    await this.weather.statement('UPDATE watches SET enabled=?,next_check=0,lease_until=0,lease_token=NULL,updated_at=? WHERE id=? AND owner=?',action==='resume'?1:0,now,row.id,owner).run();return {watch:publicWatch(await this.owned(owner,row.id))};
  }
  async evaluate(value,alerts,collector=this.weather){
    const now=this.weather.clock(),token=crypto.randomUUID();const row=await this.weather.statement('UPDATE watches SET lease_token=?,lease_until=? WHERE id=? AND enabled=1 AND next_check<=? AND lease_until<=? RETURNING *',token,now+60,value,now,now).first();if(!row)return false;
    try{
      const settings=JSON.parse(row.settings),river=settings.river?await new RiversService(collector).gauge(settings.river.gauge):null,forecast=settings.river?null:await collector.forecast(...row.point.split(','));const result=await evaluateWatch({point:row.point,settings,forecast,alerts,river,previous:row.baseline?JSON.parse(row.baseline):null,now:this.weather.clock()*1000});
      const at=this.weather.clock(),sequence=row.sequence+1,owns='EXISTS(SELECT 1 FROM watches WHERE id=? AND lease_token=? AND enabled=1)',batch=[];
      for(const [i,event] of result.changes.entries()){const payload=JSON.stringify({...event,method_version:result.snapshot.method_version,evaluated_at:result.snapshot.evaluated_at,sources:result.snapshot.sources});if(payload.length>200000)throw Error('Watch evidence exceeds the record limit');batch.push(this.weather.statement(`INSERT OR IGNORE INTO watch_events(id,watch_id,at,kind,title,payload) SELECT ?,?,?,?,?,? WHERE ${owns}`,row.id+':'+sequence+':'+i,row.id,at,event.kind,event.title,payload,row.id,token));}
      const complete=Object.values(result.snapshot.coverage).every(Boolean);batch.push(this.weather.statement('UPDATE watches SET baseline=?,sequence=?,checked_at=?,next_check=?,error=?,lease_token=NULL,lease_until=0 WHERE id=? AND lease_token=? AND enabled=1',JSON.stringify(result.snapshot),sequence,at,at+(complete?3600:300),complete?null:'Some source coverage is unknown or delayed',row.id,token));
      await this.weather.db.batch(batch);await this.weather.statement('DELETE FROM watch_events WHERE watch_id=? AND (at<? OR id NOT IN (SELECT id FROM watch_events WHERE watch_id=? ORDER BY at DESC,id DESC LIMIT 200))',row.id,at-30*86400,row.id).run();return true;
    }catch(error){await this.weather.statement('UPDATE watches SET error=?,next_check=?,lease_token=NULL,lease_until=0 WHERE id=? AND lease_token=?',String(error.message).slice(0,250),this.weather.clock()+300,row.id,token).run();return false;}
  }
  async upkeep(alerts){
    // Derived-state refresh is allowed only for explicitly enrolled, enabled watches.
    await this.weather.statement('DELETE FROM watch_events WHERE at<?',this.weather.clock()-30*86400).run();
    const rows=await this.weather.statement('SELECT id FROM watches WHERE enabled=1 AND next_check<=? AND lease_until<=? ORDER BY next_check,id LIMIT 64',this.weather.clock(),this.weather.clock()).all();if(!rows.results.length)return {processed:0,due:0};
    const deadline=AbortSignal.timeout(20000),collector=new WeatherService(this.weather.db,{clock:this.weather.clock,fetcher:(url,options)=>this.weather.fetcher(url,{...options,signal:AbortSignal.any([options.signal,deadline])})});let cursor=0,processed=0;
    await Promise.all(Array.from({length:Math.min(4,rows.results.length)},async()=>{while(cursor<rows.results.length&&!deadline.aborted){const row=rows.results[cursor++];if(await this.evaluate(row.id,alerts,collector))processed++;}}));return {processed,due:rows.results.length};
  }
  async feed(value,token){if(!/^[a-f0-9]{64}$/.test(token||''))throw new WatchError('Feed not found',404);let key;try{key=id(value);}catch{throw new WatchError('Feed not found',404);}const row=await this.weather.statement('SELECT * FROM watches WHERE id=? AND feed_hash=?',key,await hash(token)).first();if(!row)throw new WatchError('Feed not found',404);return {watch:publicWatch(row),events:await this.events(key,50)};}
}
