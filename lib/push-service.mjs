import {normalizeQuietHours,quietReason} from '../public/quiet-hours-core.mjs';
import {hash} from './archive-codec.mjs';
import {WatchError} from './watch-service.mjs';
import {validateSubscription,pushEndpoint,publicVapid,vapidHeaders,encryptPush} from './web-push.mjs';
const readQuiet=value=>{try{return normalizeQuietHours(value===null?null:JSON.parse(value));}catch{return {invalid:true};}};
const iso=n=>n?new Date(n*1000).toISOString():null;
export class PushService{
  constructor(weather,{jwk=null,fetcher=null}={}){this.weather=weather;this.jwk=jwk;const request=fetcher||weather.fetcher;this.fetcher=(...args)=>request(...args);}
  configured(){try{return !!publicVapid(this.jwk);}catch{return false;}}
  owner(owner){if(!owner)throw new WatchError('A valid private browser key is required',401);}
  async owned(owner,id){this.owner(owner);const row=await this.weather.statement('SELECT * FROM push_subscriptions WHERE id=? AND owner=?',String(id||''),owner).first();if(!row)throw new WatchError('Push device not found',404);return row;}
  async list(owner){this.owner(owner);const devices=await this.weather.statement('SELECT id,label,created_at,enabled,error,quiet_hours FROM push_subscriptions WHERE owner=? ORDER BY created_at',owner).all();
    const rows=await this.weather.statement('SELECT d.id,d.created_at,d.status,d.attempts,d.accepted_at,d.http_status,d.error,d.payload,s.label FROM push_deliveries d JOIN push_subscriptions s ON s.id=d.subscription_id WHERE s.owner=? AND d.created_at>=? ORDER BY d.created_at DESC,d.id DESC LIMIT 50',owner,this.weather.clock()-7*86400).all();
    return {authenticated:true,configured:this.configured(),public_key:this.configured()?publicVapid(this.jwk):null,devices:devices.results.map(r=>({...r,created_at:iso(r.created_at),enabled:!!r.enabled,quiet_hours:readQuiet(r.quiet_hours)})),deliveries:rows.results.map(r=>({...r,created_at:iso(r.created_at),accepted_at:iso(r.accepted_at),payload:JSON.parse(r.payload)}))};
  }
  async subscribe(owner,input){this.owner(owner);if(!this.configured())throw new WatchError('Push delivery is not configured',503);
    try{pushEndpoint(input.subscription?.endpoint);}catch{
      // Report only the provider hostname, never its private endpoint path or keys.
      let provider='unknown';try{provider=new URL(input.subscription?.endpoint).hostname.slice(0,253);}catch{}
      throw new WatchError(`This browser supplied an unsupported push endpoint (provider: ${provider}). Try a browser with a supported push service.`);
    }
    let sub;try{sub=await validateSubscription(input.subscription);}catch(e){
      const malformed=['Invalid push key','Invalid push keys'].includes(e.message);
      throw new WatchError(malformed?'The browser supplied invalid push encryption keys. Disable push in this browser, then try enrollment again.':'The server could not validate this browser’s push encryption key. Enrollment was not saved.');
    }
    const id=await hash(sub.endpoint),label=String(input.label||'This browser').trim().slice(0,60),existing=await this.weather.statement('SELECT owner FROM push_subscriptions WHERE id=?',id).first();
    if(existing&&existing.owner!==owner)throw new WatchError('This browser subscription is already enrolled under another account. Disable it there first.',409);
    const row=await this.weather.statement('INSERT INTO push_subscriptions(id,owner,label,endpoint,keys,created_at) SELECT ?,?,?,?,?,? WHERE (SELECT COUNT(*) FROM push_subscriptions)<128 AND (SELECT COUNT(*) FROM push_subscriptions WHERE owner=?)<2 ON CONFLICT(id) DO NOTHING RETURNING id',id,owner,label,sub.endpoint,JSON.stringify(sub.keys),this.weather.clock(),owner).first();
    if(!row&&!existing)throw new WatchError('Push device capacity reached: two per browser and 128 on this service',429);
    await this.weather.statement('UPDATE push_subscriptions SET label=?,keys=?,enabled=1,error=NULL WHERE id=? AND owner=?',label,JSON.stringify(sub.keys),id,owner).run();return {id};
  }
  async setQuiet(owner,id,input){const row=await this.owned(owner,id);let settings;try{settings=normalizeQuietHours(input);}catch(e){throw new WatchError(e.message);}await this.weather.statement('UPDATE push_subscriptions SET quiet_hours=? WHERE id=? AND owner=?',settings?JSON.stringify(settings):null,row.id,owner).run();return {quiet_hours:settings};}
  async remove(owner,id){const row=await this.owned(owner,id);await this.weather.db.batch([this.weather.statement('DELETE FROM push_deliveries WHERE subscription_id=?',row.id),this.weather.statement('DELETE FROM push_subscriptions WHERE id=? AND owner=?',row.id,owner)]);return {removed:true};}
  async test(owner,id){const row=await this.owned(owner,id);if(!this.configured()||!row.enabled)throw new WatchError('Enable push on this browser before testing');const now=this.weather.clock();
    const reserved=await this.weather.statement('UPDATE push_subscriptions SET last_test=? WHERE id=? AND owner=? AND last_test<=? RETURNING id',now,row.id,owner,now-300).first();if(!reserved)throw new WatchError('Wait five minutes between test notifications',429);
    await this.weather.statement('INSERT INTO push_deliveries(id,subscription_id,created_at,payload,quiet_snapshot) SELECT ?,id,?,?,quiet_hours FROM push_subscriptions WHERE id=? AND owner=?',crypto.randomUUID(),now,JSON.stringify({title:'VentusIQ push test',body:'This browser received a test. Watch updates are checked during hourly upkeep and may be delayed.',url:'/#watches',tag:'ventusiq-push-test'}),row.id,owner).run();return {queued:true};
  }
  async dispatch(){
    const now=this.weather.clock();await this.weather.db.batch([
      this.weather.statement("UPDATE push_deliveries SET status='expired',lease_token=NULL,lease_until=0,error='Update expired before delivery' WHERE status='pending' AND created_at<?",now-86400),
      this.weather.statement('DELETE FROM push_deliveries WHERE created_at<?',now-7*86400),
      this.weather.statement('DELETE FROM push_deliveries WHERE id IN (SELECT id FROM (SELECT id,ROW_NUMBER() OVER (PARTITION BY subscription_id ORDER BY created_at DESC,id DESC) AS n FROM push_deliveries) WHERE n>200)'),
    ]);if(!this.configured())return {processed:0,configured:false};
    const rows=await this.weather.statement("SELECT d.id FROM push_deliveries d JOIN push_subscriptions s ON s.id=d.subscription_id WHERE d.status='pending' AND d.next_attempt<=? AND d.lease_until<=? AND s.enabled=1 AND (d.watch_id IS NULL OR EXISTS(SELECT 1 FROM watches w WHERE w.id=d.watch_id AND w.owner=s.owner AND w.enabled=1)) ORDER BY d.created_at,d.id LIMIT 24",now,now).all();
    const signal=AbortSignal.timeout(8000);let cursor=0,processed=0;
    await Promise.all(Array.from({length:Math.min(4,rows.results.length)},async()=>{while(cursor<rows.results.length&&!signal.aborted){if(await this.send(rows.results[cursor++].id,signal))processed++;}}));return {processed,configured:true};
  }
  async send(id,signal){
    const now=this.weather.clock(),token=crypto.randomUUID();const row=await this.weather.statement("UPDATE push_deliveries SET lease_token=?,lease_until=?,attempts=attempts+1 WHERE id=? AND status='pending' AND next_attempt<=? AND lease_until<=? RETURNING *",token,now+30,id,now,now).first();if(!row)return false;
    const sub=await this.weather.statement('SELECT * FROM push_subscriptions WHERE id=? AND enabled=1',row.subscription_id).first();
    if(!sub||(row.watch_id&&!await this.weather.statement('SELECT id FROM watches WHERE id=? AND owner=? AND enabled=1',row.watch_id,sub.owner).first())){await this.weather.statement("UPDATE push_deliveries SET status='cancelled',lease_token=NULL,lease_until=0 WHERE id=? AND lease_token=?",id,token).run();return false;}
    const mute=async (reason,outcome='muted')=>{await this.weather.statement("UPDATE push_deliveries SET status=CASE WHEN status='cancelled' THEN status ELSE ? END,error=CASE WHEN status='cancelled' THEN error ELSE ? END,attempts=MAX(0,attempts-1),lease_token=NULL,lease_until=0 WHERE id=? AND lease_token=?",outcome,reason,id,token).run();return true;};
    const reason=quietReason(row.quiet_snapshot,sub.quiet_hours,row.created_at,this.weather.clock());if(reason)return mute(reason);
    let status='pending',http=null,error=null,next=now+Math.min(3600*2**(row.attempts-1),12*3600),accepted=null;
    let stage='encryption';
    try{
      const subscription={endpoint:sub.endpoint,keys:JSON.parse(sub.keys)},body=await encryptPush(subscription,row.payload);
      stage='authentication';const headers=await vapidHeaders(sub.endpoint,this.jwk,now);
      stage='delivery state check';
      // Recheck after encryption so a boundary or preference change is honored before sending.
      const current=await this.weather.statement('SELECT quiet_hours FROM push_subscriptions WHERE id=? AND enabled=1',sub.id).first();
      const pending=await this.weather.statement("SELECT id FROM push_deliveries WHERE id=? AND lease_token=? AND status='pending'",id,token).first();
      if(!current||!pending)return mute('Device removed or delivery cancelled before sending','cancelled');
      const latestReason=quietReason(row.quiet_snapshot,current.quiet_hours,row.created_at,this.weather.clock());if(latestReason)return mute(latestReason);
      // Workers supports manual redirects; every 3xx remains a rejected delivery.
      stage='transport';const response=await this.fetcher(sub.endpoint,{method:'POST',headers,body,redirect:'manual',signal});http=response.status;
      if(http===201||http===202){status='accepted';accepted=this.weather.clock();}
      else if(http===404||http===410){status='expired';error='Browser subscription expired';await this.weather.db.batch([this.weather.statement('UPDATE push_subscriptions SET enabled=0,error=? WHERE id=?',error,sub.id),this.weather.statement("UPDATE push_deliveries SET status='cancelled',error='Browser subscription expired' WHERE subscription_id=? AND status='pending' AND id<>?",sub.id,id)]);}
      else if(http===429||http>=500){error='Push service temporarily unavailable (HTTP '+http+')';const retry=response.headers?.get('Retry-After');if(retry){const seconds=/^\d+$/.test(retry)?Number(retry):Math.ceil((Date.parse(retry)-now*1000)/1000);if(Number.isFinite(seconds))next=Math.max(next,now+Math.min(86400,Math.max(0,seconds)));}}
      else{status='failed';error='Push service rejected delivery (HTTP '+http+')';}
      await response.body?.cancel();
    }catch(e){const kind=['AbortError','TimeoutError','TypeError','DataError','OperationError','NotSupportedError','SyntaxError','InvalidAccessError'].includes(e?.name)?e.name:'Error';error=`Push ${stage} failed (${kind})${signal?.aborted?' · delivery time budget expired':''}`;}
    if(status==='pending'&&row.attempts>=4){status='failed';error='Delivery retry limit reached';}
    await this.weather.statement("UPDATE push_deliveries SET status=CASE WHEN status='cancelled' AND ?='pending' THEN 'cancelled' ELSE ? END,http_status=?,error=?,next_attempt=?,accepted_at=?,lease_until=0,lease_token=NULL WHERE id=? AND lease_token=?",status,status,http,error,next,accepted,id,token).run();return true;
  }
}
