/* Notification-only worker: no fetch interception or private response caching. */
self.addEventListener('install',event=>event.waitUntil(self.skipWaiting()));
self.addEventListener('push',event=>{
  let data={};try{data=event.data?.json()||{};}catch{}
  const title=typeof data.title==='string'?data.title.slice(0,90):'VentusIQ watch update';
  const body=typeof data.body==='string'?data.body.slice(0,400):'Open VentusIQ to review your saved-watch updates and source freshness.';
  const tag=typeof data.tag==='string'&&/^ventusiq-[a-z0-9-]+$/.test(data.tag)?data.tag:'ventusiq-watch-update';
  event.waitUntil(self.registration.showNotification(title,{body,tag,icon:'/assets/ventusiq-icon.png',data:{url:'/#watches'}}));
});
self.addEventListener('notificationclick',event=>{
  event.notification.close();event.waitUntil((async()=>{
    const url=new URL('/#watches',self.location.origin).href,windows=await self.clients.matchAll({type:'window',includeUncontrolled:true});
    for(const client of windows)if(new URL(client.url).origin===self.location.origin){await client.navigate(url);await client.focus();return;}
    await self.clients.openWindow(url);
  })());
});
