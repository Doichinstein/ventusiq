/* A single layer selector controls the same inputs used by each map module. */
export function mountMapControls({document,window}) {
  const get=id=>document.getElementById(id), menu=get('layer-menu');
  const inputs=[...menu.querySelectorAll('input[type="checkbox"]')];
  const names={alerts:'Alerts',fires:'Fires',aqi:'AQI',air:'Monitors',smoke:'Smoke',satellite:'Satellite',firms:'Detections'};
  function summarize(){
    const enabled=inputs.filter(input=>input.checked).map(input=>names[input.id.slice(6)]);
    get('layer-count').textContent=String(enabled.length);
    get('active-layer-summary').textContent=enabled.length?enabled.join(' · '):'No map layers selected';
    try{window.localStorage.setItem('ventusiq-map-layers-v1',JSON.stringify(Object.fromEntries(inputs.map(i=>[i.id,i.checked]))));}catch{}
  }
  for(const input of inputs)input.addEventListener('change',summarize);
  document.addEventListener('click',event=>{if(!menu.contains(event.target))menu.open=false;});
  menu.addEventListener('keydown',event=>{if(event.key==='Escape'){event.stopPropagation();menu.open=false;menu.querySelector('summary').focus();}});
  get('layer-details').onclick=()=>{menu.open=false;get('hazard-controls').open=true;get('hazard-controls').scrollIntoView({behavior:'smooth',block:'nearest'});};
  // Wait for source modules to install their onchange handlers before restoring preferences.
  function restore(){
    try{const saved=JSON.parse(window.localStorage.getItem('ventusiq-map-layers-v1')||'null');
      if(saved&&typeof saved==='object')for(const input of inputs)if(typeof saved[input.id]==='boolean'&&input.checked!==saved[input.id]){input.checked=saved[input.id];input.dispatchEvent(new window.Event('change',{bubbles:true}));}
    }catch{}
    summarize();
  }
  if(document.readyState==='complete')restore();else window.addEventListener('load',restore,{once:true});
  return {summarize};
}
if(typeof window!=='undefined'){
  const start=()=>mountMapControls({document,window});
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
}
