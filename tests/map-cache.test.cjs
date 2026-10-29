const {test}=require('node:test');const assert=require('node:assert/strict');const vm=require('node:vm');const fs=require('node:fs');
function setup(compression=false){const entries=new Map();let now=1000000000;const cache={async match(k){return entries.get(k)?.clone();},async delete(k){return entries.delete(k);},async put(k,v){entries.set(k,v);},async keys(){return [...entries.keys()];}};const window={caches:{open:async()=>cache}};vm.runInNewContext(fs.readFileSync(require('node:path').join(__dirname,'../public/map-cache.js'),'utf8'),{window,Response,Blob,Date:{now:()=>now},...(compression?{CompressionStream,DecompressionStream}:{})});return {api:window.WeatherMapCache,entries,advance:ms=>now+=ms};}
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
