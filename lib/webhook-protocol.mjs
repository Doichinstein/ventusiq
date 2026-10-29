const encoder=new TextEncoder();
export function webhookEndpoint(value){
  if(typeof value!=='string'||value.length>2048||/[\s\\]/.test(value))throw Error('Invalid webhook URL');
  let u;try{u=new URL(value);}catch{throw Error('Invalid webhook URL');}
  if(u.protocol!=='https:'||u.port||u.username||u.password||u.hash||u.search)throw Error('Use an HTTPS webhook URL without credentials, query parameters, fragments or a custom port');
  const host=u.hostname,label='[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?';
  const zapier=host==='hooks.zapier.com'&&/^\/hooks\/catch\/\d+\/[A-Za-z0-9_-]+\/?$/.test(u.pathname);
  const pipedream=new RegExp('^'+label+'\\.m\\.pipedream\\.net$').test(host);
  const worker=new RegExp('^'+label+'\\.'+label+'\\.workers\\.dev$').test(host);
  if(!zapier&&!pipedream&&!worker)throw Error('Supported destinations: Zapier Catch Hook, Pipedream HTTP endpoint or a Worker on workers.dev');
  return {url:u.href,host,provider:zapier?'Zapier':pipedream?'Pipedream':'Cloudflare Worker'};
}
export function webhookSecret(){return [...crypto.getRandomValues(new Uint8Array(32))].map(x=>x.toString(16).padStart(2,'0')).join('');}
export async function webhookSignature(secret,timestamp,id,body){if(!/^[a-f0-9]{64}$/.test(secret)||!Number.isSafeInteger(timestamp))throw Error('Invalid signing material');const key=await crypto.subtle.importKey('raw',encoder.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);return [...new Uint8Array(await crypto.subtle.sign('HMAC',key,encoder.encode(timestamp+'.'+id+'.'+body)))].map(x=>x.toString(16).padStart(2,'0')).join('');}
export function webhookPayload(watch,event,eventId,at){return JSON.stringify({schema_version:'1',id:eventId,type:'watch.change',created_at:new Date(at*1000).toISOString(),watch:{id:watch.id,label:watch.label,point:watch.point},change:{kind:event.kind,title:String(event.title).slice(0,1000)},dashboard_path:'/#watches',note:'Changes are checked during hourly upkeep and may be delayed. Open the dashboard for source evidence and current guidance.'});}
