const {test}=require('node:test');const assert=require('node:assert/strict');const vm=require('node:vm');const fs=require('node:fs');
function setup(compression=false,{initial=1000000000,compress=CompressionStream}={}){const entries=new Map();let now=initial;const cache={async match(k){return entries.get(k)?.clone();},async delete(k){return entries.delete(k);},async put(k,v){entries.set(k,v);},async keys(){return [...entries.keys()];}};const window={caches:{open:async()=>cache}};vm.runInNewContext(fs.readFileSync(require('node:path').join(__dirname,'../public/map-cache.js'),'utf8'),{window,Response,Blob,Date:{now:()=>now,parse:Date.parse},...(compression?{CompressionStream:compress,DecompressionStream}:{})});return {api:window.WeatherMapCache,entries,advance:ms=>now+=ms};}
test('public map cache restores original collection time, expires entries and excludes private paths',async()=>{
  const s=setup();await s.api.write('alerts',{collected_at:'original',features:[]});assert.equal((await s.api.read('alerts',60000)).collected_at,'original');
  s.advance(60001);assert.equal(await s.api.read('alerts',60000),null);assert.equal(s.entries.size,0);
  await s.api.write('api/places',{private:true});assert.equal(s.entries.size,0);
});
test('boundary cache bounds concurrent writes and tolerates unavailable storage',async()=>{
  const s=setup();await Promise.all(Array.from({length:2052},(_,i)=>s.api.write('zone/county/'+String(i).padStart(6,'0'),{geometry:{type:'Polygon'}})));
  assert.equal(s.entries.size,2048);assert.equal(await s.api.read('zone/county/000000',1e9),null);
  const window={};vm.runInNewContext(fs.readFileSync(require('node:path').join(__dirname,'../public/map-cache.js'),'utf8'),{window,Response,Date});await window.WeatherMapCache.write('alerts',{});assert.equal(await window.WeatherMapCache.read('alerts',1e9),null);
});
test('large geometries obey the byte budget as well as the entry count',async()=>{
  const s=setup();for(let i=0;i<14;i++)await s.api.write('zone/county/'+String(i).padStart(6,'0'),{geometry:'x'.repeat(2000000)});
  const bytes=[...s.entries.values()].reduce((sum,r)=>sum+Number(r.headers.get('X-Cache-Bytes')),0);
  assert.ok(bytes<=24*1024*1024);assert.equal(s.entries.size,12);assert.equal(await s.api.read('zone/county/000000',1e9),null);
});

test('compressed boundaries preserve exact coordinates and unicode, count stored bytes and read legacy JSON',async()=>{
  const s=setup(true),data={geometry:{type:'Polygon',coordinates:[Array.from({length:10000},(_,i)=>[-76.123456789+i/1e6,39.987654321])]},label:'Māui'};
  await s.api.write('zone/forecast/VAZ001',data);
  const response=s.entries.get('/__map_cache__/zone/forecast/VAZ001');
  assert.equal(response.headers.get('X-Cache-Encoding'),'gzip');assert.equal(Number(response.headers.get('X-Cache-Bytes')),(await response.clone().arrayBuffer()).byteLength);
  assert.ok(Number(response.headers.get('X-Cache-Bytes'))<JSON.stringify(data).length/4);
  assert.deepEqual(await s.api.read('zone/forecast/VAZ001',1e9),data);
  s.entries.set('/__map_cache__/zone/forecast/VAZ002',new Response(JSON.stringify(data),{headers:{'X-Saved-At':'1000000000'}}));
  assert.deepEqual(await s.api.read('zone/forecast/VAZ002',1e9),data);
  s.advance(1e9+1);assert.equal(await s.api.read('zone/forecast/VAZ001',1e9),null);
});

test('broken compressed cache is a miss, and private keys stay excluded with compression available',async()=>{
  const s=setup(true);s.entries.set('/__map_cache__/zone/forecast/VAZ001',new Response('broken',{headers:{'X-Saved-At':'1000000000','X-Cache-Encoding':'gzip'}}));
  assert.equal(await s.api.read('zone/forecast/VAZ001',1e9),null);await s.api.write('api/places',{secret:'no'});assert.equal(s.entries.size,1);
});

test('verified server gzip is stored byte-for-byte without recompression and keeps source expiry',async()=>{
  const now=Date.now(),day=86400000,s=setup(true,{initial:now,compress:class {constructor(){assert.fail('must reuse source compression');}}});
  const data={geometry:{type:'Polygon',coordinates:[[[-76.123456789,39.987654321],[-77,40],[-76,41],[-76.123456789,39.987654321]]]},name:'Māui'};
  const packed=await new Response(new Blob([JSON.stringify(data)]).stream().pipeThrough(new CompressionStream('gzip'))).blob();
  const checked=new Date(now-29*day).toISOString(),key='zone/forecast/VAZ001';
  await s.api.writePackedZone(key,packed,checked);
  const stored=s.entries.get('/__map_cache__/'+key);
  assert.deepEqual(Buffer.from(await stored.clone().arrayBuffer()),Buffer.from(await packed.arrayBuffer()));
  assert.equal(stored.headers.get('X-Saved-At'),String(Date.parse(checked)));
  assert.deepEqual(await s.api.read(key,30*day),data);
  s.advance(day+1);assert.equal(await s.api.read(key,30*day),null);
});

test('packed writes reject private keys, stale/future timestamps and oversized bytes without touching storage',async()=>{
  const now=Date.now(),s=setup(true,{initial:now}),payload=new Blob(['gzip']);
  for(const key of ['alerts','api/places','zone/../private'])await s.api.writePackedZone(key,payload,new Date(now).toISOString());
  for(const stamp of ['bad',new Date(now+1).toISOString(),new Date(now-30*86400000-1).toISOString()])await s.api.writePackedZone('zone/forecast/VAZ001',payload,stamp);
  await s.api.writePackedZone('zone/forecast/VAZ001',new Blob(['x'.repeat(262501)]),new Date(now).toISOString());
  assert.equal(s.entries.size,0);
});
