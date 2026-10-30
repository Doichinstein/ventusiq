import {browserFetch} from './browser-session.mjs';
import {normalizeQuietHours} from './quiet-hours-core.mjs';
const scope='/ventusiq-push/';
const keyBytes=value=>Uint8Array.from(atob(value.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));
export async function subscriptionId(endpoint){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(endpoint))))].map(n=>n.toString(16).padStart(2,'0')).join('');}
export function mountPush({document,window,fetcher=browserFetch(window)}){
  const get=id=>document.getElementById(id),el=(tag,text)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;return n;};
  if(window.WEATHER_CONFIG?.mode!=='hosted'){get('push-card').hidden=true;return null;}
  const supported=!!(window.isSecureContext&&window.navigator?.serviceWorker&&window.PushManager&&window.Notification);
  let data=null,busy=false,generation=0,currentId=null,registration=null;
  async function request(body=null){const response=await fetcher('/api/push',body?{method:'POST',headers:{'Content-Type':'application/json'},credentials:'same-origin',signal:AbortSignal.timeout(30000),body:JSON.stringify(body)}:{credentials:'same-origin',signal:AbortSignal.timeout(30000)});const result=await response.json();if(response.status===401)return {authenticated:false};if(!response.ok)throw Error(result.error||'Push request failed');return result;}
  function render(){
    const authenticated=data?.authenticated;get('push-enable').disabled=busy||!supported||!authenticated||!data?.configured;get('push-local-off').disabled=busy||!currentId;
    get('push-devices').replaceChildren(...(data?.devices||[]).map(d=>{const box=el('article');box.className='river-impact';box.append(el('strong',d.label+(d.id===currentId?' · this browser':'')),el('p',d.enabled?'Enrolled for changes to all your saved watches':'Delivery disabled'+(d.error?': '+d.error:'')));
      const remove=el('button','Remove device');remove.className='text-button';remove.disabled=busy;remove.onclick=()=>removeDevice(d.id);box.append(remove);
      const test=el('button','Send test notification');test.className='text-button';test.disabled=busy||!d.enabled||!data?.configured;test.onclick=()=>testDevice(d.id);box.append(test,quietForm(d));return box;}));
    get('push-history').replaceChildren(...(data?.deliveries||[]).map(d=>{const item=el('p');item.className='small';item.textContent=`${new Date(d.created_at).toLocaleString()} · ${d.label} · ${d.payload.title}: ${d.status==='accepted'?'accepted by push service (display unconfirmed)':d.status} · ${d.attempts} attempt(s)${d.error?' · '+d.error:''}`;return item;}));
  }
  function quietForm(device){
    const form=el('form');form.className='push-quiet';
    const fields=el('fieldset');fields.disabled=busy;fields.append(el('legend','Daily quiet hours'));
    const settings=device.quiet_hours,enabled=el('input');enabled.type='checkbox';enabled.checked=!!settings;
    const toggle=el('label','Mute push notifications during these hours');toggle.append(enabled);fields.append(toggle);
    const input=(label,type,value)=>{const node=el('input');node.type=type;node.value=value;node.required=true;const wrapper=el('label',label);wrapper.append(node);fields.append(wrapper);return node;};
    const start=input('Start (included)','time',settings?.start||'22:00'),end=input('End (excluded)','time',settings?.end||'07:00');
    const zone=input('Time zone','text',settings?.time_zone||Intl.DateTimeFormat().resolvedOptions().timeZone||'UTC');zone.maxLength=80;zone.placeholder='America/Los_Angeles';
    const toggleFields=()=>{start.disabled=end.disabled=zone.disabled=!enabled.checked;};enabled.onchange=toggleFields;toggleFields();
    const note=el('p',settings?.invalid?'Saved schedule could not be read. Notifications remain muted until you save a valid schedule or turn quiet hours off.':'Applies to every alert severity and test notifications. Muted updates remain in watch history and are not sent later. The selected time zone stays fixed when you travel.');note.className='small';fields.append(note);
    const save=el('button','Save quiet hours');save.type='submit';save.className='text-button';fields.append(save);form.append(fields);
    form.onsubmit=event=>{event.preventDefault();return setQuietDevice(device.id,{enabled:enabled.checked,start:start.value,end:end.value,time_zone:zone.value});};return form;
  }
  async function setQuietDevice(id,input){if(busy)return;let settings;try{settings=normalizeQuietHours(input);}catch(e){get('push-status').textContent=e.message;return;}busy=true;render();try{const result=await request({action:'quiet_hours',id,settings});if(result.authenticated===false){await load();return;}await load();get('push-status').textContent=settings?'Quiet hours saved. Updates queued during quiet hours stay muted, even if you change this schedule later. Already-sent notifications may still arrive.':'Quiet hours turned off. Previously muted updates will not be sent.';}catch(e){get('push-status').textContent=e.message;}finally{busy=false;render();}}
  async function local(){if(!supported)return;registration=await window.navigator.serviceWorker.getRegistration(scope);const sub=await registration?.pushManager.getSubscription();currentId=sub?await subscriptionId(sub.endpoint):null;}
  async function load(){const token=++generation;try{const result=await request();if(token!==generation)return;data=result;await local();if(token!==generation)return;
    get('push-status').textContent=!data.authenticated?'Browser key unavailable. Refresh and check site storage.':!supported?'This browser does not expose secure Web Push. You can still manage enrolled devices here.':!data.configured?'Push delivery is not configured on this deployment.':`${data.devices.length} of 2 devices enrolled. Push is optional and separate from updates shown while this page is open.`;render();
  }catch(e){if(token===generation){data=null;get('push-status').textContent=e.message;render();}}}
  async function ready(reg){if(reg.active)return;const worker=reg.installing||reg.waiting;if(!worker)throw Error('Push worker did not start');if(worker.state==='activated')return;await new Promise((resolve,reject)=>{const timer=window.setTimeout(()=>reject(Error('Push worker activation timed out')),15000);worker.addEventListener('statechange',()=>{if(worker.state==='activated'){window.clearTimeout(timer);resolve();}else if(worker.state==='redundant'){window.clearTimeout(timer);reject(Error('Push worker could not activate'));}});});}
  async function enable(){if(busy||!supported||!data?.authenticated||!data.configured)return;busy=true;render();try{
    // Request browser permission only from this explicit button action.
    get('push-status').textContent='Waiting for browser notification permission. If a prompt appears, choose Allow to continue. If nothing appears, check this site’s notification permission in your browser.';
    const permission=await window.Notification.requestPermission();if(permission!=='granted')throw Error('Browser notification permission was not granted. You can change it in browser settings.');
    get('push-status').textContent='Notification permission granted. Starting the background notification worker…';
    registration=await window.navigator.serviceWorker.register('/push-sw.js',{scope});await ready(registration);
    get('push-status').textContent='Connecting this browser to its push service. Some embedded browsers expose push APIs but cannot complete enrollment. If this stays here, reload and try a regular browser.';
    let sub=await registration.pushManager.getSubscription();const expected=keyBytes(data.public_key),prior=sub?.options?.applicationServerKey?new Uint8Array(sub.options.applicationServerKey):null;if(prior&&(prior.length!==expected.length||prior.some((v,i)=>v!==expected[i])))throw Error('Push signing key changed. Disable push in this browser, then enable it again.');if(!sub)sub=await registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:keyBytes(data.public_key)});
    get('push-status').textContent='Browser subscription created. Saving this device to VentusIQ…';
    const result=await request({action:'subscribe',label:get('push-label').value||'This browser',subscription:sub.toJSON()});if(result.authenticated===false)throw Error('Browser key unavailable; refresh before enrolling this device');currentId=result.id;await load();get('push-status').textContent='This device is enrolled for future watch changes. Hourly checks and browser delivery can be delayed. Use Send test notification to check this device.';
  }catch(e){
    get('push-status').textContent=e.name==='AbortError'&&/registration failed.*push service error/i.test(e.message)?'The browser could not register with its push service. In Brave, open brave://settings/?search=push and enable “Use Google services for push messaging”, then reload and try again. If it is already enabled, check your network connection.':e.message;
    // A subscription can exist locally even when the server rejects enrollment.
    // Keep the explicit Disable control available without silently unsubscribing.
    try{await local();}catch{}
  }finally{busy=false;render();}}
  async function removeDevice(id){if(busy)return;busy=true;render();try{const result=await request({action:'remove',id});if(result.authenticated===false){await load();return;}if(id===currentId){await (await registration?.pushManager.getSubscription())?.unsubscribe();currentId=null;}await load();get('push-status').textContent='Device removed. Notifications already accepted by the push service may still arrive.';}catch(e){get('push-status').textContent=e.message;}finally{busy=false;render();}}
  async function testDevice(id){if(busy)return;busy=true;render();try{const result=await request({action:'test',id});if(result.authenticated===false){await load();return;}await load();get('push-status').textContent='Test queued; quiet hours also apply to tests. Refresh delivery status to inspect acceptance; confirm on the device whether it appeared.';}catch(e){get('push-status').textContent=e.message;}finally{busy=false;render();}}
  get('push-enable').onclick=enable;get('push-refresh').onclick=load;
  get('push-local-off').onclick=async()=>{if(busy)return;busy=true;render();try{const id=currentId,sub=await registration?.pushManager.getSubscription();if(sub&&!await sub.unsubscribe())throw Error('Browser could not disable this subscription');currentId=null;if(data?.devices?.some(d=>d.id===id))await request({action:'remove',id});await load();get('push-status').textContent='Push disabled in this browser. Notifications already accepted may still arrive.';}catch(e){get('push-status').textContent='Browser/server unsubscribe status needs checking: '+e.message;}finally{busy=false;render();}};
  load();return {load,enable,removeDevice,testDevice,setQuietDevice};
}
if(typeof window!=='undefined'){const start=()=>mountPush({document,window});if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();}
