import {test} from 'node:test';import assert from 'node:assert/strict';
import {database} from './fixtures/push.mjs';import {WeatherService} from '../lib/weather-service.mjs';import {mapZones} from '../lib/map-zones.mjs';
import {pack} from '../lib/archive-codec.mjs';import '../public/zone-batch.js';
const now=Math.floor(Date.now()/1000),geometry={type:'Polygon',coordinates:[[[-76.123456789,39.987654321],[-77,40],[-76,41],[-76.123456789,39.987654321]]]};
test('batch reads only recent public zone archives, leaves misses to the collector and preserves exact geometry',async()=>{
  const db=database(),weather=new WeatherService(db,{clock:()=>now,fetcher:()=>assert.fail('batch must not fetch upstream')});
  try{
    for(const id of ['VAZ001','VAZ002','VAZ003','VAZ004'])await weather.collect('/zones/forecast/'+id,30*86400,async()=>({geometry,label:'Māui'}));
    await weather.collect('forecast/private-looking-key',600,async()=>({notPublic:true}));
    await weather.statement('UPDATE datasets SET last_success=? WHERE name=?',now-30*86400-1,'/zones/forecast/VAZ002').run();
    await weather.statement('UPDATE datasets SET error=? WHERE name=?','upstream failed','/zones/forecast/VAZ003').run();
    await weather.statement('UPDATE revisions SET payload=? WHERE dataset=?','x'.repeat(350001),'/zones/forecast/VAZ004').run();
    const result=await mapZones(weather,'forecast/VAZ001,forecast/VAZ002,forecast/VAZ003,forecast/VAZ004,forecast/VAZ005,forecast/VAZ001');
    assert.deepEqual(result.zones.map(x=>x.id),['forecast/VAZ001']);assert.equal(result.encoding,'gzip-base64');
    const url='https://api.weather.gov/zones/forecast/VAZ001';const decoded=await globalThis.fetchZoneBatch([url],async()=>result);assert.deepEqual(decoded.get(url),{geometry});
    const state=await weather.state('/zones/forecast/VAZ005');assert.equal(state.name,undefined);
    for(const ids of [null,'','../private','forecast/VAZ001?x=y',Array(17).fill('forecast/VAZ001').join(','),'forecast/private-looking-key'])await assert.rejects(mapZones(weather,ids),/Invalid boundary batch/);
  }finally{db.close();}
});
test('decoder isolates corrupt, old, oversized, foreign and missing geometry entries',async()=>{
  const url=id=>'https://api.weather.gov/zones/forecast/'+id,stamp=new Date().toISOString(),good=await pack({geometry}),large=await pack({geometry,padding:'x'.repeat(3000001)});
  const rows=[{id:'VAZ001',payload:good},{id:'VAZ002',payload:'broken'},{id:'VAZ003',payload:large},{id:'VAZ004',payload:good,checked_at:'2000-01-01T00:00:00Z'},{id:'VAZ005',payload:await pack({noGeometry:true})},{id:'ZZZ999',payload:good}].map(row=>({...row,id:'forecast/'+row.id,checked_at:row.checked_at||stamp}));
  const result=await globalThis.fetchZoneBatch(['VAZ001','VAZ002','VAZ003','VAZ004','VAZ005'].map(url),async()=>({encoding:'gzip-base64',zones:rows}));
  assert.deepEqual([...result.keys()],[url('VAZ001')]);assert.deepEqual(result.get(url('VAZ001')),{geometry});
});

test('decoder yields verified boundaries and original gzip bytes before batch completion',async()=>{
  const payload=await pack({geometry,label:'Māui'}),stamp=new Date().toISOString(),ready=[];let complete=false;
  const urls=['VAZ001','VAZ002'].map(id=>'https://api.weather.gov/zones/forecast/'+id);
  const found=await globalThis.fetchZoneBatch(urls,async()=>({encoding:'gzip-base64',zones:[
    {id:'forecast/VAZ001',payload,checked_at:stamp},{id:'forecast/VAZ002',payload:'broken',checked_at:stamp}]}),
    (url,data,packed)=>{assert.equal(complete,false);ready.push({url,data,packed});});
  complete=true;
  assert.equal(ready.length,1);assert.equal(ready[0].url,urls[0]);assert.deepEqual(ready[0].data,{geometry});
  assert.equal(ready[0].packed.checked_at,stamp);
  assert.deepEqual(Buffer.from(await ready[0].packed.payload.arrayBuffer()),Buffer.from(payload,'base64'));
  assert.deepEqual([...found.keys()],[urls[0]]);
});
