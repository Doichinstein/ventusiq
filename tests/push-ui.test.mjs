import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {mountPush,subscriptionId} from '../public/push.js';
import {subscription,pushKeys} from './fixtures/push.mjs';
import {publicVapid} from '../lib/web-push.mjs';
class Element{constructor(){this.children=[];this.value='';this.text='';}set textContent(v){this.text=String(v);this.children=[];}get textContent(){return this.text+this.children.map(c=>c.textContent).join('');}append(...v){this.children.push(...v);}replaceChildren(...v){this.text='';this.children=v;}}
async function setup(){const nodes=Object.fromEntries([...readFileSync(new URL('../public/index.html',import.meta.url),'utf8').matchAll(/id="([^"]+)"/g)].map(m=>[m[1],new Element()]));let devices=[],permission='granted',permissionCalls=0,registered=0,browserSub=null,authenticated=true,posts=[],testError=null;const id=await subscriptionId(subscription.endpoint),key=publicVapid(await pushKeys());
 const reg={active:{},pushManager:{async getSubscription(){return browserSub;},async subscribe(options){assert.equal(options.userVisibleOnly,true);browserSub={endpoint:subscription.endpoint,toJSON:()=>subscription,async unsubscribe(){browserSub=null;return true;}};return browserSub;}}};
 const window={WEATHER_CONFIG:{mode:'hosted'},isSecureContext:true,PushManager:{},Notification:{async requestPermission(){permissionCalls++;return permission;}},navigator:{serviceWorker:{async getRegistration(scope){assert.equal(scope,'/ventusiq-push/');return registered?reg:undefined;},async register(url,options){assert.equal(url,'/push-sw.js');assert.equal(options.scope,'/ventusiq-push/');registered++;return reg;}}},setTimeout,clearTimeout};
 const fetcher=async(url,options={})=>{assert.equal(url,'/api/push');if(!authenticated)return {status:401,ok:false,json:async()=>({authenticated:false})};if(options.body){const body=JSON.parse(options.body);posts.push(body);if(body.action==='test'&&testError)return {ok:false,status:400,json:async()=>({error:testError})};if(body.action==='subscribe'){devices=[{id,label:body.label,enabled:true}];return {ok:true,json:async()=>({id})};}if(body.action==='quiet_hours')devices=devices.map(d=>d.id===body.id?{...d,quiet_hours:body.settings}:d);if(body.action==='remove')devices=[];return {ok:true,json:async()=>({queued:true})};}return {ok:true,json:async()=>({authenticated:true,configured:true,public_key:key,devices,deliveries:[]})};};
 const mounted=mountPush({document:{getElementById:id=>nodes[id],createElement:()=>new Element()},window,fetcher});const settle=async()=>{for(let i=0;i<5;i++)await new Promise(r=>setImmediate(r));};await settle();return {nodes,mounted,window,posts,devices:v=>devices=v,testError:v=>testError=v,permission:v=>permission=v,permissionCalls:()=>permissionCalls,registered:()=>registered,authenticated:v=>authenticated=v,id,settle};
}
test('push initialization never requests permission, registers a worker or enrolls a device',async()=>{const s=await setup();assert.equal(s.permissionCalls(),0);assert.equal(s.registered(),0);assert.equal(s.posts.length,0);assert.equal(s.nodes['push-enable'].disabled,false);});
test('browser push-service failure gives recovery guidance and does not enroll or send a test',async()=>{
 const s=await setup(),register=s.window.navigator.serviceWorker.register;
 s.window.navigator.serviceWorker.register=async(...args)=>{const reg=await register(...args);reg.pushManager.subscribe=async()=>{throw new DOMException('Registration failed - push service error','AbortError');};return reg;};
 await s.mounted.enable();assert.match(s.nodes['push-status'].textContent,/brave:\/\/settings/);assert.equal(s.posts.length,0);assert.equal(s.nodes['push-enable'].disabled,false);
});
test('pending permission and push-service enrollment report their stage without claiming enrollment',async()=>{
 const s=await setup();let allow,connect;
 s.window.Notification.requestPermission=()=>new Promise(resolve=>allow=resolve);
 const register=s.window.navigator.serviceWorker.register;
 s.window.navigator.serviceWorker.register=async(...args)=>{const reg=await register(...args),subscribe=reg.pushManager.subscribe;reg.pushManager.subscribe=options=>new Promise(resolve=>connect=async()=>resolve(await subscribe(options)));return reg;};
 const pending=s.mounted.enable();await s.settle();assert.match(s.nodes['push-status'].textContent,/Waiting for browser notification permission/);assert.equal(s.posts.length,0);
 allow('granted');await s.settle();assert.match(s.nodes['push-status'].textContent,/Connecting this browser to its push service/);assert.equal(s.posts.length,0);assert.equal(s.nodes['push-enable'].disabled,true);
 await connect();await pending;assert.equal(s.posts[0].action,'subscribe');assert.match(s.nodes['push-status'].textContent,/This device is enrolled/);
});
test('explicit enable subscribes with the public key, records the device and supports removal',async()=>{const s=await setup();s.nodes['push-label'].value='Laptop';await s.mounted.enable();assert.equal(s.permissionCalls(),1);assert.equal(s.registered(),1);assert.equal(s.posts[0].action,'subscribe');assert.match(s.nodes['push-devices'].textContent,/Laptop · this browser/);await s.mounted.removeDevice(s.id);assert.equal(s.posts.at(-1).action,'remove');assert.equal(s.nodes['push-devices'].textContent,'');assert.equal(s.nodes['push-local-off'].disabled,true);});
test('permission denial enrolls nothing and sign-out clears device management',async()=>{const s=await setup();s.permission('denied');await s.mounted.enable();assert.equal(s.registered(),0);assert.equal(s.posts.length,0);assert.match(s.nodes['push-status'].textContent,/not granted/);s.authenticated(false);await s.mounted.load();assert.equal(s.nodes['push-enable'].disabled,true);assert.equal(s.nodes['push-devices'].textContent,'');});
test('test delivery is an explicit action and reports queueing rather than display',async()=>{const s=await setup();await s.mounted.enable();await s.mounted.testDevice(s.id);assert.equal(s.posts.at(-1).action,'test');assert.match(s.nodes['push-status'].textContent,/Test queued/);assert.match(s.nodes['push-status'].textContent,/confirm on the device/);});

test('closed-page test is explicit and gives server-delay instructions without claiming display',async()=>{
 const s=await setup();await s.mounted.enable();const button=s.nodes['push-devices'].children[0].children.find(n=>n.textContent==='Test with dashboard closed');assert.ok(button);assert.equal(s.posts.length,1);
 await button.onclick();assert.deepEqual(s.posts.at(-1),{action:'test',id:s.id,delay_seconds:10});assert.match(s.nodes['push-status'].textContent,/Close all VentusIQ tabs/);assert.match(s.nodes['push-status'].textContent,/keep the browser running/);assert.match(s.nodes['push-status'].textContent,/Quiet hours still apply/);assert.equal(s.permissionCalls(),1);
});
test('notification worker shows a bounded message and opens only its own watch dashboard',async()=>{const handlers={},notifications=[],opened=[];const context={URL,self:{location:{origin:'https://example.test'},addEventListener:(name,fn)=>handlers[name]=fn,registration:{showNotification:async(title,options)=>notifications.push({title,options})},clients:{matchAll:async()=>[],openWindow:async url=>opened.push(url)}}};vm.runInNewContext(readFileSync(new URL('../public/push-sw.js',import.meta.url),'utf8'),context);let waiting;handlers.push({data:{json:()=>({title:'x'.repeat(200),body:'change',url:'https://evil.test',tag:'invalid value'})},waitUntil:p=>waiting=p});await waiting;assert.equal(notifications[0].title.length,90);assert.equal(notifications[0].options.data.url,'/#watches');assert.equal(notifications[0].options.tag,'ventusiq-watch-update');handlers.notificationclick({notification:{close(){}},waitUntil:p=>waiting=p});await waiting;assert.deepEqual(opened,['https://example.test/#watches']);assert.equal(handlers.fetch,undefined);});

test('quiet-hours form saves only on submit, restores settings and disables without a permission prompt',async()=>{
 const s=await setup();await s.mounted.enable();const form=()=>s.nodes['push-devices'].children[0].children.at(-1),fields=()=>form().children[0];
 let f=fields();const toggle=f.children[1].children[0],start=f.children[2].children[0],end=f.children[3].children[0],zone=f.children[4].children[0];assert.equal(toggle.checked,false);assert.equal(start.disabled,true);toggle.checked=true;toggle.onchange();start.value='23:00';end.value='06:30';zone.value='UTC';assert.equal(s.posts.length,1);
 await form().onsubmit({preventDefault(){}});assert.equal(s.posts.at(-1).action,'quiet_hours');assert.deepEqual(s.posts.at(-1).settings,{enabled:true,start:'23:00',end:'06:30',time_zone:'UTC'});assert.equal(s.permissionCalls(),1);f=fields();assert.equal(f.children[2].children[0].value,'23:00');assert.equal(f.children[4].children[0].value,'UTC');
 f.children[1].children[0].checked=false;await form().onsubmit({preventDefault(){}});assert.equal(s.posts.at(-1).settings,null);assert.match(s.nodes['push-status'].textContent,/turned off/);
});
test('invalid quiet hours send no mutation and signed-out saving clears owned controls',async()=>{
 const s=await setup();await s.mounted.enable();await s.mounted.setQuietDevice(s.id,{enabled:true,start:'22:00',end:'22:00',time_zone:'UTC'});assert.equal(s.posts.length,1);assert.match(s.nodes['push-status'].textContent,/different start/);
 s.authenticated(false);await s.mounted.setQuietDevice(s.id,null);assert.equal(s.nodes['push-devices'].textContent,'');assert.equal(s.permissionCalls(),1);
});


test('disabled subscriptions are counted separately and expose recovery without silent enrollment',async()=>{
 const s=await setup();s.devices([{id:'expired',label:'Old browser',enabled:false,error:'Browser subscription expired'},{id:'active',label:'Phone',enabled:true}]);await s.mounted.load();
 assert.match(s.nodes['push-status'].textContent,/1 active · 1 disabled · 2 of 2 device slots used/);
 assert.match(s.nodes['push-devices'].textContent,/choose Forever/);
 const expired=s.nodes['push-devices'].children[0];
 assert.equal(expired.children.find(n=>n.textContent==='Send test notification').disabled,true);
 assert.equal(expired.children.find(n=>n.textContent==='Test with dashboard closed').disabled,true);
 assert.equal(s.posts.length,0);assert.equal(s.permissionCalls(),0);
 s.devices([{id:'expired',label:'Old browser',enabled:false,error:'Browser subscription expired'}]);await s.mounted.load();
 assert.match(s.nodes['push-status'].textContent,/0 active · 1 disabled · 1 of 2 device slots used/);
});

test('a test rejected after subscription expiry refreshes stale enabled controls and retains the error',async()=>{
 const s=await setup();await s.mounted.enable();
 s.devices([{id:s.id,label:'Laptop',enabled:false,error:'Browser subscription expired'}]);s.testError('Enable push on this browser before testing');
 await s.mounted.testDevice(s.id,10);
 assert.match(s.nodes['push-status'].textContent,/Enable push on this browser before testing/);
 const box=s.nodes['push-devices'].children[0];assert.match(box.textContent,/Delivery disabled: Browser subscription expired/);
 assert.equal(box.children.find(n=>n.textContent==='Test with dashboard closed').disabled,true);
 assert.equal(s.permissionCalls(),1);assert.equal(s.posts.filter(p=>p.action==='test').length,1);
});
