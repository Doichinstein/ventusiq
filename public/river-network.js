import {loadRiverNetwork,riverNetworkView,riverNetworkURL} from './river-network-core.mjs';

export function mountRiverNetwork({document,window,fetcher=fetch,clock=Date.now}){
  const get=id=>document.getElementById(id),hosted=window.WEATHER_CONFIG?.mode==='hosted';
  const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
  let id=null,report=null,generation=0,busy=false;
  const time=value=>Number.isFinite(Date.parse(value))?new Date(value).toLocaleString():'unavailable';
  function updateGauge(product){
    const next=product?.metadata?.lid||null;if(next===id)return;
    id=next;generation++;busy=false;report=null;get('river-network-results').replaceChildren();get('river-network-export').disabled=true;get('river-network-run').disabled=!id;
    get('river-network-status').textContent=id?'Load NOAA’s upstream and downstream associations for '+id+'.':'Choose a gauge.';
  }
  function render(){
    const view=riverNetworkView(report,id,clock()),nodes=[];
    get('river-network-status').className=view.delayed?'warning-note':'small';
    get('river-network-status').textContent=`${view.delayed?'Updates delayed. Retained associations shown. ':''}NOAA / NWPS · checked ${time(report.checked_at)}. Source issue time is not supplied.${report.error?' '+report.error:''}`;
    for(const [key,title] of [['upstream','Upstream gauges'],['downstream','Downstream gauges'],['ambiguous','Direction unresolved']]){
      if(key==='ambiguous'&&!view.ambiguous.length)continue;
      const section=el('section'),list=el('div',undefined,'river-list');section.append(el('h4',`${title} (${view[key].length})`));
      if(!view[key].length)section.append(el('p','No associations returned in this direction. Coverage may be incomplete.','small'));
      if(key==='ambiguous')section.append(el('p','NOAA listed these gauges in both directions. Direction is unknown.','warning-note'));
      for(const row of view[key]){const button=el('button',undefined,'river-choice');button.type='button';button.append(el('strong',row.name),el('span',row.id+' · Open observations and forecast'));button.onclick=()=>window.WeatherRivers?.openGauge(row.id);list.append(button);}
      section.append(list);nodes.push(section);
    }
    if(view.audit.duplicates||view.audit.self_references)nodes.push(el('p',`${view.audit.duplicates} duplicate entries and ${view.audit.self_references} self references omitted; raw entries are retained in the export.`,'small'));
    const link=el('a','Inspect NOAA connection data ↗');link.href=riverNetworkURL(id);link.target='_blank';link.rel='noopener';nodes.push(link);
    get('river-network-results').replaceChildren(...nodes);get('river-network-export').disabled=false;
  }
  async function run(){
    if(!id||busy)return;const token=++generation,selected=id;busy=true;get('river-network-run').disabled=true;get('river-network-status').textContent='Loading connected gauges…';
    try{
      let next;
      if(hosted){const response=await fetcher('/api/rivers/network?id='+encodeURIComponent(selected),{signal:AbortSignal.timeout(50000)});if(!response.ok)throw Error('Connection lookup returned HTTP '+response.status);next=await response.json();}
      else next={...await loadRiverNetwork(selected,fetcher),checked_at:new Date(clock()).toISOString(),stale:false};
      if(token!==generation)return;riverNetworkView(next,selected,clock());report=next;render();
    }catch(error){if(token!==generation)return;if(report){report={...report,stale:true,error:error.message};render();}else get('river-network-status').textContent='Connections unavailable: '+error.message;}
    finally{if(token===generation){busy=false;get('river-network-run').disabled=!id;}}
  }
  get('river-network-run').onclick=run;
  get('river-network-export').onclick=()=>{
    if(!report)return;const evidence={...report,view:riverNetworkView(report,id,clock()),exported_at:new Date(clock()).toISOString(),limitations:'Provider gauge associations; incomplete coverage possible. No travel times, flood arrival predictions, address watershed membership or between-gauge stage comparisons.'};
    const url=window.URL.createObjectURL(new Blob([JSON.stringify(evidence,null,2)],{type:'application/json'})),a=el('a');a.href=url;a.download='ventusiq-river-connections-'+id+'.json';a.click();window.setTimeout(()=>window.URL.revokeObjectURL(url),1000);
  };
  window.WeatherRiverNetwork={updateGauge};updateGauge(window.WeatherRivers?.currentProduct?.()||null);window.setInterval(()=>{if(report&&!busy)render();},60000);
  return {updateGauge,run};
}
if(typeof window!=='undefined'){const start=()=>mountRiverNetwork({document,window});if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();}
