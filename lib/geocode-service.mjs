import {addressQuery,lookupAddress} from '../public/geocode-core.mjs';
export class GeocodeError extends Error{constructor(message,status=400){super(message);this.status=status;}}
export class GeocodeService{
  constructor(weather){this.weather=weather;}
  async search(value){let query;try{query=addressQuery(value);}catch(e){throw new GeocodeError(e.message);}
    const w=this.weather,now=w.clock(),day=new Date(now*1000).toISOString().slice(0,10);
    const admitted=await w.statement("INSERT INTO datasets(name,next_fetch,lease_until) VALUES ('limits/geocode/request',?,0) ON CONFLICT(name) DO UPDATE SET next_fetch=excluded.next_fetch WHERE datasets.next_fetch<=? RETURNING name",now+2,now).first();
    if(!admitted)throw new GeocodeError('Address search is busy. Retry in a few seconds.',429);
    const budget=await w.statement('INSERT INTO datasets(name,next_fetch,lease_until) VALUES (?,1,0) ON CONFLICT(name) DO UPDATE SET next_fetch=datasets.next_fetch+1 WHERE datasets.next_fetch<1000 RETURNING next_fetch','limits/geocode/day/'+day).first();
    if(!budget)throw new GeocodeError('Today’s shared address-search budget is used. Choose a point on the map or enter coordinates.',429);
    await w.statement("DELETE FROM datasets WHERE name LIKE 'limits/geocode/day/%' AND name<?",'limits/geocode/day/'+new Date((now-30*86400)*1000).toISOString().slice(0,10)).run();
    try{return {...await lookupAddress(query,w.fetcher),checked_at:new Date(w.clock()*1000).toISOString()};}catch{throw new GeocodeError('Census address search is unavailable. Retry or choose a point on the map.',503);}
  }
}
export async function geocodePost(request,service){
  const headers={'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'};
  try{
    if(request.headers.get('origin')!==new URL(request.url).origin||request.headers.get('content-type')?.split(';')[0].trim()!=='application/json')throw new GeocodeError('Same-origin JSON request required.',403);
    const reader=request.body?.getReader();if(!reader)throw new GeocodeError('Missing address request.');let content='',size=0;const decoder=new TextDecoder();
    for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>1024){await reader.cancel();throw new GeocodeError('Address request is too large.',413);}content+=decoder.decode(value,{stream:true});}content+=decoder.decode();
    let input;try{input=JSON.parse(content);}catch{throw new GeocodeError('Invalid JSON.');}if(!input||Array.isArray(input)||typeof input!=='object'||Object.keys(input).some(k=>k!=='address'))throw new GeocodeError('Invalid address request.');
    return Response.json(await service.search(input.address),{headers});
  }catch(error){return Response.json({error:error instanceof GeocodeError?error.message:'Address search is unavailable.'},{status:error.status||503,headers});}
}
