import {test} from 'node:test';
import assert from 'node:assert/strict';
import {BROWSER_KEY,browserKey,browserFetch} from '../public/browser-session.mjs';
import {browserOwner} from '../lib/browser-owner.mjs';
function browser(){const values=new Map();return {crypto,location:new URL('https://example.test/'),localStorage:{getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v)}};}
test('browser credentials persist locally, differ between browsers, and hash to a separate owner namespace',async()=>{
 const a=browser(),b=browser(),key=browserKey(a);assert.match(key,/^viq1_[a-f0-9]{64}$/);assert.equal(browserKey(a),key);assert.notEqual(browserKey(b),key);
 const req=value=>new Request('https://example.test/api/watches',{headers:{authorization:value}});
 const owner=await browserOwner(req('Bearer '+key));assert.match(owner,/^browser:[a-f0-9]{64}$/);assert.ok(!owner.includes(key.slice(5)));
 assert.equal(await browserOwner(req('Bearer '+owner)),null);assert.equal(await browserOwner(req('Bearer user-123')),null);assert.equal(await browserOwner(req('')),null);
});
test('browser storage failures cannot silently create ephemeral watch ownership',()=>{
 const w=browser();w.localStorage.setItem=()=>{throw Error('blocked');};assert.throws(()=>browserKey(w),/storage is unavailable/);
 const corrupt=browser();corrupt.localStorage.setItem(BROWSER_KEY,'bad');assert.throws(()=>browserKey(corrupt),/storage is unavailable/);assert.equal(corrupt.localStorage.getItem(BROWSER_KEY),'bad');
});
test('capabilities attach only to same-origin private tools, never to redirects, cookies or URLs',async()=>{
 const w=browser(),calls=[],request=browserFetch(w,async(...args)=>{calls.push(args);return Response.json({authenticated:true});});
 for(const path of ['/api/watches','/api/push','/api/webhooks'])await request(path,{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});
 assert.equal(calls.length,3);
 for(const [url,options] of calls){assert.equal(options.headers.get('authorization'),'Bearer '+browserKey(w));assert.equal(options.headers.get('content-type'),'application/json');assert.equal(options.redirect,'error');assert.equal(options.credentials,'omit');assert.equal(options.cache,'no-store');assert.ok(!url.includes(browserKey(w)));}
 for(const path of ['https://other.test/api/watches','//other.test/api/push','/api/alerts','/api/places','/api/watches/extra'])assert.throws(()=>request(path),/cannot be sent/);
 assert.equal(calls.length,3);
});
