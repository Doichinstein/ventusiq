import {smokeAtTime,smokePoint} from './smoke-core.mjs';
export function journeySmokeLimit(value){
  if(value===null||value===undefined||String(value).trim()==='')return null;
  const n=Number(value);if(!Number.isFinite(n)||n<0||n>10000)throw Error('Choose a smoke sample limit between 0 and 10,000 µg/m³.');return n;
}
export function journeySmoke(product,point,at,limit=null,now=Date.now()){
  const r=smokeAtTime(product,point,at,now),ceiling=journeySmokeLimit(limit);
  return {...r,limit_ug_m3:ceiling,exceeds:ceiling===null||!r.fresh||r.maximum_ug_m3===null?null:r.maximum_ug_m3>ceiling?true:r.complete?false:null};
}
export async function collectJourneySmoke(samples,request,{signal,onProgress=()=>{}}={}){
  const products=new Array(samples.length),points=new Map();
  for(const [i,s] of samples.entries())try{const p=smokePoint(s.lat,s.lon),key=p.lat+','+p.lon;if(!points.has(key))points.set(key,{point:p,indices:[]});points.get(key).indices.push(i);}catch(error){products[i]={error:error.message};}
  if(!points.size)return products;
  // Warm the shared catalog before parallel point reads to avoid cold-cache lease races.
  try{const catalog=await request('/api/smoke/catalog',signal);if(catalog.stale||catalog.error)throw Error(catalog.error||'Smoke catalog updates are delayed');}
  catch(error){for(const {indices} of points.values())for(const i of indices)products[i]={error:error.message};return products;}
  const queue=[...points.values()];let next=0,done=0;
  const work=async()=>{while(next<queue.length&&!signal?.aborted){const {point,indices}=queue[next++];let product;try{product=await request('/api/smoke/forecast?lat='+point.lat+'&lon='+point.lon,signal);}catch(error){product={error:error.message};}for(const i of indices)products[i]=product;onProgress(++done,queue.length);}};
  await Promise.all([work(),work(),work()]);return products;
}
export const smokeValue=n=>n===null||n===undefined?'Unknown':n>0&&n<.001?'<0.001 µg/m³':n.toLocaleString(undefined,{maximumFractionDigits:3})+' µg/m³';
