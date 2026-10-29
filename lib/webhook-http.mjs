import {WatchError} from './watch-service.mjs';
const json=(data,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'}});
export async function webhookGet(service,owner){try{return json(await service.list(owner));}catch(e){return json({authenticated:false,error:e.message},e.status||503);}}
export async function webhookPost(request,service,owner){try{
  if(!owner)throw new WatchError('Sign in to manage webhooks',401);const url=new URL(request.url);
  if(request.headers.get('origin')!==url.origin||!request.headers.get('content-type')?.startsWith('application/json'))throw new WatchError('Same-origin JSON request required',403);
  const reader=request.body?.getReader();if(!reader)throw new WatchError('Missing JSON body');let length=0,text='';const decoder=new TextDecoder();for(;;){const {done,value}=await reader.read();if(done)break;length+=value.length;if(length>8192){await reader.cancel();throw new WatchError('Webhook request is too large',413);}text+=decoder.decode(value,{stream:true});}text+=decoder.decode();
  let input;try{input=JSON.parse(text);}catch{throw new WatchError('Invalid JSON');}if(!input||typeof input!=='object'||Array.isArray(input))throw new WatchError('Invalid webhook request');
  if(input.action==='create')return json(await service.create(owner,input));if(['pause','resume','remove'].includes(input.action))return json(await service.change(owner,input.id,input.action));if(input.action==='test')return json(await service.test(owner,input.id));throw new WatchError('Unknown webhook action');
}catch(e){return json({error:e.message},e.status||503);}}
