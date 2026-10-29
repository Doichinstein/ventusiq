const {test}=require('node:test');const assert=require('node:assert/strict');const vm=require('node:vm');const fs=require('node:fs');
function setup(){const entries=new Map();let now=1000000000;const cache={async match(k){return entries.get(k)?.clone();},async delete(k){return entries.delete(k);},async put(k,v){entries.set(k,v);},async keys(){return [...entries.keys()];}};const window={caches:{open:async()=>cache}};vm.runInNewContext(fs.readFileSync(require('node:path').join(__dirname,'../public/map-cache.js'),'utf8'),{window,Response,Date:{now:()=>now}});return {api:window.WeatherMapCache,entries,advance:ms=>now+=ms};}
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
  const s=setup();for(let i=0;i<6;i++)await s.api.write('zone/county/'+String(i).padStart(6,'0'),{geometry:'x'.repeat(2000000)});
  const bytes=[...s.entries.values()].reduce((sum,r)=>sum+Number(r.headers.get('X-Cache-Bytes')),0);
  assert.ok(bytes<=24*1024*1024);assert.equal(s.entries.size,4);assert.equal(await s.api.read('zone/county/000000',1e9),null);
});
