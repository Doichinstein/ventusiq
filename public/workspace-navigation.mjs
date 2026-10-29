/* Focus and in-workspace navigation; no data fetching or URL changes. Apache-2.0. */
export const WORKSPACES=Object.freeze([
  ['nav-map','map-workspace'],['nav-personal','personal-workspace'],
  ['nav-journey','journey-workspace'],['nav-rivers','river-workspace'],['nav-events','event-workspace'],
]);
export function mountWorkspaceNavigation({document,schedule=queueMicrotask,Observer=globalThis.MutationObserver}){
  const get=id=>document.getElementById(id),main=get('workspace');if(!main)return null;
  const listeners=[],jumps=[...document.querySelectorAll('[data-workspace-jump]')];
  const visible=node=>!!node&&!node.closest('[hidden]');
  const focus=node=>{if(!visible(node))return false;const heading=node===main?node:node.querySelector('h2,h3')||node;if(!visible(heading))return false;heading.setAttribute('tabindex','-1');heading.focus();return true;};
  const listen=(node,fn)=>{if(node){node.addEventListener('click',fn);listeners.push([node,fn]);}};
  const target=link=>get(link.getAttribute('data-workspace-jump'));
  const sync=()=>{for(const link of jumps){const hidden=!visible(target(link));if(link.hidden!==hidden)link.hidden=hidden;}};
  listen(get('skip-workspace'),event=>{
    event.preventDefault();
    const selected=WORKSPACES.find(([nav,panel])=>get(nav)?.getAttribute('aria-pressed')==='true'&&visible(get(panel)));
    if(!selected||!focus(get(selected[1])))focus(main);
  });
  for(const [nav,panel] of WORKSPACES)listen(get(nav),()=>schedule(()=>{
    // Existing view handlers run first. Failed/unsupported switches must not move focus.
    sync();if(visible(get(nav))&&get(nav).getAttribute('aria-pressed')==='true')focus(get(panel));
  }));
  for(const link of jumps)listen(link,event=>{event.preventDefault();if(visible(link))focus(target(link));});
  sync();const observer=Observer?new Observer(sync):null;
  observer?.observe(main,{attributes:true,subtree:true,attributeFilter:['hidden']});
  return {sync,disconnect(){observer?.disconnect();for(const [node,fn] of listeners)node.removeEventListener('click',fn);}};
}
if(typeof window!=='undefined'){
  const start=()=>mountWorkspaceNavigation({document});
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
}
