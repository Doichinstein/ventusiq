import {test} from 'node:test';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import {Miniflare,createFetchMock} from 'miniflare';

test('shared collection and delivery fetchers preserve Cloudflare native fetch invocation',async()=>{
  const compiled=await build({stdin:{contents:`
    import {WeatherService} from './lib/weather-service.mjs';
    import {PushService} from './lib/push-service.mjs';
    import {WebhookService} from './lib/webhook-service.mjs';
    export default {async fetch(){
      const weather=new WeatherService(null),results=[];
      const clients=[weather,new PushService(weather),new WebhookService(weather),new PushService(weather,{fetcher:fetch}),new WebhookService(weather,{fetcher:fetch})];
      for(let i=0;i<clients.length;i++){
        try{const response=await clients[i].fetcher('https://delivery.test/'+i,{method:'POST',body:'probe-'+i,headers:{'X-Probe':'native-fetch'},redirect:'manual'});results.push({status:response.status,body:await response.text()});}
        catch(e){results.push({error:e.message});}
      }
      return Response.json(results);
    }};`,resolveDir:fileURLToPath(new URL('../',import.meta.url))},bundle:true,format:'esm',platform:'browser',write:false});
  const fetchMock=createFetchMock();fetchMock.disableNetConnect();
  for(let i=0;i<5;i++)fetchMock.get('https://delivery.test').intercept({path:'/'+i,method:'POST'}).reply(202,'received-'+i);
  const mf=new Miniflare({modules:true,compatibilityDate:'2026-05-15',script:compiled.outputFiles[0].text,fetchMock});
  try{const response=await mf.dispatchFetch('https://app.test/');assert.deepEqual(await response.json(),Array.from({length:5},(_,i)=>({status:202,body:'received-'+i})));fetchMock.assertNoPendingInterceptors();}
  finally{await mf.dispose();}
});
