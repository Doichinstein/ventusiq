/* RFC 8291 encryption and RFC 8292 VAPID, using Web Crypto. Apache-2.0. */
const utf8=s=>new TextEncoder().encode(s);
export const b64=bytes=>btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
export function unb64(value){if(typeof value!=='string'||!value||!/^[A-Za-z0-9_-]+$/.test(value))throw Error('Invalid push key');const bytes=Uint8Array.from(atob(value.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));if(b64(bytes)!==value)throw Error('Invalid push key');return bytes;}
const join=(...parts)=>{const out=new Uint8Array(parts.reduce((n,p)=>n+p.length,0));let offset=0;for(const p of parts){out.set(p,offset);offset+=p.length;}return out;};
export function pushEndpoint(value){
  if(typeof value!=='string'||value.length>2048)throw Error('Invalid push endpoint');let u;try{u=new URL(value);}catch{throw Error('Invalid push endpoint');}
  const allowed=u.hostname==='fcm.googleapis.com'||u.hostname==='updates.push.services.mozilla.com'||u.hostname==='web.push.apple.com'||/^[a-z0-9-]+\.notify\.windows\.com$/.test(u.hostname);
  if(!allowed||u.protocol!=='https:'||u.port||u.username||u.password||u.hash||u.pathname==='/')throw Error('Unsupported push service endpoint');return u.href;
}
export async function validateSubscription(input){
  const endpoint=pushEndpoint(input?.endpoint),p256dh=unb64(input?.keys?.p256dh),auth=unb64(input?.keys?.auth);
  if(p256dh.length!==65||p256dh[0]!==4||auth.length!==16)throw Error('Invalid push keys');
  await crypto.subtle.importKey('raw',p256dh,{name:'ECDH',namedCurve:'P-256'},false,[]);
  return {endpoint,keys:{p256dh:b64(p256dh),auth:b64(auth)}};
}
async function hkdf(secret,salt,info,length){const key=await crypto.subtle.importKey('raw',secret,'HKDF',false,['deriveBits']);return new Uint8Array(await crypto.subtle.deriveBits({name:'HKDF',hash:'SHA-256',salt,info},key,length*8));}
export async function encryptPush(subscription,plaintext,{salt=crypto.getRandomValues(new Uint8Array(16)),keyPair=null}={}){
  const message=typeof plaintext==='string'?utf8(plaintext):plaintext;if(message.length>3000||salt.length!==16)throw Error('Push payload exceeds supported bounds');
  const ua=unb64(subscription.keys.p256dh),receiver=await crypto.subtle.importKey('raw',ua,{name:'ECDH',namedCurve:'P-256'},false,[]);
  const pair=keyPair||await crypto.subtle.generateKey({name:'ECDH',namedCurve:'P-256'},true,['deriveBits']),sender=new Uint8Array(await crypto.subtle.exportKey('raw',pair.publicKey));
  const shared=new Uint8Array(await crypto.subtle.deriveBits({name:'ECDH',public:receiver},pair.privateKey,256));
  const ikm=await hkdf(shared,unb64(subscription.keys.auth),join(utf8('WebPush: info\0'),ua,sender),32);
  const cek=await hkdf(ikm,salt,utf8('Content-Encoding: aes128gcm\0'),16),nonce=await hkdf(ikm,salt,utf8('Content-Encoding: nonce\0'),12);
  const key=await crypto.subtle.importKey('raw',cek,'AES-GCM',false,['encrypt']);
  const ciphertext=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv:nonce},key,join(message,new Uint8Array([2]))));
  const header=new Uint8Array(21);header.set(salt);new DataView(header.buffer).setUint32(16,4096);header[20]=sender.length;return join(header,sender,ciphertext);
}
export function publicVapid(jwk){if(jwk?.kty!=='EC'||jwk.crv!=='P-256'||typeof jwk.d!=='string')throw Error('Push signing key unavailable');const x=unb64(jwk.x),y=unb64(jwk.y);if(x.length!==32||y.length!==32||unb64(jwk.d).length!==32)throw Error('Invalid push signing key');return b64(join(new Uint8Array([4]),x,y));}
export async function vapidHeaders(endpoint,jwk,now=Math.floor(Date.now()/1000)){
  const publicKey=publicVapid(jwk),head=b64(utf8(JSON.stringify({typ:'JWT',alg:'ES256'}))),claims=b64(utf8(JSON.stringify({aud:new URL(pushEndpoint(endpoint)).origin,exp:now+12*3600,sub:'https://github.com/Doichinstein/ventusiq'}))),message=head+'.'+claims;
  const key=await crypto.subtle.importKey('jwk',jwk,{name:'ECDSA',namedCurve:'P-256'},false,['sign']),signature=await crypto.subtle.sign({name:'ECDSA',hash:'SHA-256'},key,utf8(message));
  return {Authorization:`vapid t=${message}.${b64(signature)}, k=${publicKey}`,'Content-Encoding':'aes128gcm','Content-Type':'application/octet-stream',TTL:'3600',Urgency:'normal'};
}
