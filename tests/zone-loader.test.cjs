const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const source=fs.readFileSync(require('node:path').join(__dirname,'../public/zone-loader.js'),'utf8');
function make(options){const window={};vm.runInNewContext(source,{window,setTimeout:fn=>setImmediate(fn)});return window.createZoneLoader(options);}
const settle=()=>new Promise(resolve=>setImmediate(resolve));
const boundary={geometry:{type:'Polygon',coordinates:[]}};

test('cached boundaries appear while four earlier network misses remain unresolved',async()=>{
  const network=[],seen=[],releases=[];
  const loader=make({readCache:async url=>url==='warm'?boundary:null,fetchZone:url=>{network.push(url);return new Promise(r=>releases.push(r));},onResult:url=>seen.push(url),onError:()=>assert.fail()});
  loader.enqueue(['cold1','cold2','cold3','cold4','cold5','warm','warm']);await settle();
  assert.deepEqual(seen,['warm']);assert.equal(network.length,4);
  for(const resolve of releases.splice(0))resolve(boundary);await settle();
  assert.equal(network.length,5);for(const resolve of releases)resolve(boundary);await settle();
  assert.equal(seen.length,6);
});

test('cache and network work are separately bounded and duplicate requests coalesce',async()=>{
  let active=0,max=0;const releases=[],seen=[];
  const loader=make({readCache:url=>{active++;max=Math.max(max,active);return new Promise(r=>releases.push(()=>{active--;r(boundary);}));},fetchZone:()=>assert.fail(),onResult:url=>seen.push(url),onError:()=>assert.fail()});
  const urls=Array.from({length:30},(_,i)=>String(i));loader.enqueue(urls);loader.enqueue(urls);await settle();
  assert.equal(max,12);assert.equal(active,12);
  while(releases.length){for(const release of releases.splice(0))release();await settle();}
  assert.equal(seen.length,30);assert.equal(new Set(seen).size,30);assert.equal(max,12);
});

test('selecting a queued boundary promotes it without duplicating active fetches',async()=>{
  const network=[],releases=[];
  const loader=make({readCache:async()=>null,fetchZone:url=>{network.push(url);return new Promise(r=>releases.push(r));},onResult:()=>{},onError:()=>assert.fail()});
  loader.enqueue(['a','b','c','d','e','f']);await settle();loader.enqueue(['f'],true);
  releases.shift()(boundary);await settle();assert.deepEqual(network,['a','b','c','d','f']);
  for(const r of releases.splice(0))r(boundary);await settle();for(const r of releases)r(boundary);await settle();
  assert.deepEqual(network,['a','b','c','d','f','e']);
});

test('storage failures fall back to bounded fetches and failed work can be retried',async()=>{
  const failed=[],seen=[];let attempt=0;
  const loader=make({readCache:()=>{throw new Error('storage denied');},fetchZone:()=>{if(!attempt++)throw new Error('offline');return boundary;},onResult:url=>seen.push(url),onError:url=>failed.push(url)});
  loader.enqueue(['a']);await settle();assert.deepEqual(failed,['a']);loader.enqueue(['a']);await settle();assert.deepEqual(seen,['a']);
});

test('shared cached boundaries batch in bounded groups while missing entries fall back once',async()=>{
  const batches=[],releases=[],individual=[],seen=[];let active=0,max=0;
  const loader=make({readCache:async()=>null,fetchBatch:urls=>{batches.push([...urls]);active++;max=Math.max(max,active);return new Promise(resolve=>releases.push(()=>{active--;resolve(new Map(urls.filter(x=>x!=='z0').map(x=>[x,boundary])));}));},fetchZone:async url=>{individual.push(url);return boundary;},onResult:url=>seen.push(url),onError:()=>assert.fail()});
  const urls=Array.from({length:70},(_,i)=>'z'+i);loader.enqueue(urls);loader.enqueue(urls);
  for(let i=0;i<5;i++)await settle();assert.equal(max,2);assert.ok(batches.every(b=>b.length<=16));
  while(releases.length){for(const release of releases.splice(0))release();for(let i=0;i<3;i++)await settle();}
  assert.equal(seen.length,70);assert.equal(new Set(seen).size,70);assert.deepEqual(individual,['z0']);assert.ok(batches.length<=6);
});

test('failed batches fall back to four individual requests and selected waiting zones stay first',async()=>{
  const batchReleases=[],network=[],releases=[],seen=[];
  const loader=make({readCache:async()=>null,fetchBatch:urls=>new Promise((resolve,reject)=>batchReleases.push(()=>reject(Error('batch unavailable')))),fetchZone:url=>{network.push(url);return new Promise(r=>releases.push(r));},onResult:url=>seen.push(url),onError:()=>assert.fail()});
  const urls=Array.from({length:40},(_,i)=>'z'+i);loader.enqueue(urls);for(let i=0;i<4;i++)await settle();loader.enqueue(['z31'],true);
  for(const reject of batchReleases.splice(0))reject();for(let i=0;i<4;i++)await settle();assert.equal(network.length,4);
  releases.shift()(boundary);await settle();assert.equal(network[4],'z31');
  for(const reject of batchReleases.splice(0))reject();await settle();
  while(releases.length){for(const release of releases.splice(0))release(boundary);await settle();}
  assert.equal(seen.length,40);assert.equal(new Set(network).size,40);
});
