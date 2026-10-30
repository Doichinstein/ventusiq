import {addressQuery,geocodeResult} from './geocode-core.mjs';
export function coordinateQuery(value){
  const text=String(value??'').trim();
  const match=text.match(/^([+-]?(?:\d+(?:\.\d*)?|\.\d+))\s*,\s*([+-]?(?:\d+(?:\.\d*)?|\.\d+))$/);
  if(!match){if(text.includes(',')&&!/[a-z]/i.test(text))throw Error('Use latitude, longitude — for example 38.90, -77.04.');return null;}
  const lat=Number(match[1]),lon=Number(match[2]);
  if(lat< -90||lat>90||lon< -180||lon>180)throw Error('Latitude must be −90 to 90 and longitude −180 to 180.');
  return {lat,lon,address:`${lat.toFixed(4)}, ${lon.toFixed(4)}`,kind:'coordinates'};
}
export async function locationMatches(query,{fetcher=fetch,signal,mode='hosted'}={}){
  const point=coordinateQuery(query);if(point)return [point];
  if(!['hosted','daemon'].includes(mode))throw Error('Use coordinates or the map on this static edition. Address lookup requires the hosted site or daemon.');
  query=addressQuery(query);
  const response=await fetcher('/api/geocode',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({address:query}),signal});
  const data=await response.json();if(!response.ok)throw Error(data.error||'Address lookup failed.');
  return geocodeResult(data.raw,query).matches.map(match=>({...match,kind:'address',evidence:data}));
}
