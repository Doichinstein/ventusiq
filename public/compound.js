import {evaluateCompound} from './compound-core.mjs';
export function mountCompound({document,window,clock=Date.now}){
  const get=id=>document.getElementById(id),el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
  let report=null,signature=null,lastPlace=null,details=new Map();
  const time=at=>at?new Date(at).toLocaleString(undefined,{month:'short',day:'numeric',hour:'numeric',minute:'2-digit',timeZoneName:'short'}):'Unavailable';
  const link=(label,url)=>{const a=el('a',label);if(typeof url==='string'&&url.startsWith('https://')){a.href=url;a.target='_blank';a.rel='noopener';}return a;};
  function evidenceNode(e){const box=el('div',undefined,'compound-evidence');box.append(el('strong',`${e.kind} · ${e.coverage}`),el('p',`Valid ${time(e.valid_from)}${e.valid_to!==e.valid_from?' – '+time(e.valid_to):' (observation instant)'}`,'small'),el('p',`Issued ${time(e.issued_at)} · collected ${time(e.collected_at)}`,'small'));
    const values=el('dl');for(const [key,v] of Object.entries(e.values)){const labels={temperature_f:'Air temperature °F',sustained_wind_max_mph:'Sustained wind / range maximum mph',precipitation_probability_percent:'Precipitation chance %',aqi:'PM2.5 AQI',pm25_ug_m3:'PM2.5 µg/m³',distance_km:'Monitor distance km'};values.append(el('dt',labels[key]||key.replaceAll('_',' ')),el('dd',v===null||v===undefined?'Unknown':String(v)));}box.append(values,link('Source ↗',e.source_url),el('p','Revision: '+(e.revision||'Not supplied by this edition; captured values are included in the export.'),'event-meta'));return box;
  }
  function refresh(){
    const context=window.WeatherPersonal?.context?.();if(!context?.place){report=null;signature=null;lastPlace=null;details.clear();get('compound-status').textContent='Select a saved place to evaluate overlapping conditions.';get('compound-findings').replaceChildren();get('compound-audit').replaceChildren();get('compound-export').disabled=true;return;}
    try{report=evaluateCompound({...context,air:window.WeatherHazards?.snapshot?.('air'),core:window.WeatherCore,now:clock()});}
    catch(error){report=null;signature=null;get('compound-status').textContent='Overlap evaluation unavailable: '+error.message;get('compound-findings').replaceChildren();get('compound-audit').replaceChildren();get('compound-export').disabled=true;return;}
    get('compound-export').disabled=false;get('compound-time').textContent=`Evaluated ${time(report.evaluated_at)} · next 48 hours · rule set ${report.ruleset_version}. Times below use your browser timezone.`;
    const nextSignature=JSON.stringify([report.place,report.sources,report.rules,report.evidence]);if(nextSignature===signature)return;signature=nextSignature;
    const placeKey=report.place.lat+','+report.place.lon,open=new Map(placeKey===lastPlace?[...details].map(([id,node])=>[id,node.open]):[]);lastPlace=placeKey;details=new Map();
    const matched=report.rules.filter(r=>r.status==='matched'),unknown=report.rules.filter(r=>!r.coverage_complete).length;
    get('compound-status').textContent=`${matched.length} of ${report.rules.length} rule${report.rules.length===1?'':'s'} found overlapping conditions for ${report.place.name}. ${unknown} rule${unknown===1?' has':'s have'} incomplete inputs. This is not an all-clear or a combined risk probability.`;
    const nodes=matched.map(rule=>{const box=el('article',undefined,'compound-finding'),badge=el('span',rule.kind,'eyebrow');box.append(badge,el('h3',rule.title));
      for(const w of rule.windows)box.append(el('p',rule.kind==='observed context'?`Observed ${time(w.start)}; no projection into future hours.`:`${time(w.start)} – ${time(w.end)}`,'compound-window'));
      box.append(el('p',rule.mechanism),el('p',rule.action,'compound-action'));if(!rule.coverage_complete)box.append(el('p','Partial coverage: '+rule.coverage_note,'warning-note'));
      const detail=el('details'),summary=el('summary','Why this appeared · source evidence');detail.open=open.get(rule.id)||false;details.set(rule.id,detail);detail.append(summary,el('p',rule.threshold,'small'));
      const ids=new Set(rule.windows.flatMap(w=>w.segments.flatMap(s=>s.premises)));for(const id of ids){const evidence=report.evidence.find(e=>e.id===id);if(evidence)detail.append(evidenceNode(evidence));}
      const links=el('div',undefined,'compound-links');for(const [label,url] of rule.guidance)links.append(link(label+' ↗',url));detail.append(links);box.append(detail);return box;});
    if(!nodes.length)nodes.push(el('p',unknown?'No combinations were established from the available inputs. Open the rule checks below to see missing coverage.':'No listed combinations were detected in the checked sources. Other hazards and later warnings can still occur.'));
    get('compound-findings').replaceChildren(...nodes);
    get('compound-audit').replaceChildren(...report.rules.map(rule=>{const row=el('tr'),name=el('th',rule.title);name.append(el('p',rule.threshold,'small'));row.append(name,el('td',rule.status==='matched'?'Detected':rule.status==='unknown'?'Unknown':'Not detected'),el('td',rule.coverage_note));return row;}));
  }
  get('compound-export').onclick=()=>{if(!report)return;const url=window.URL.createObjectURL(new Blob([JSON.stringify(report,null,2)],{type:'application/json'})),a=el('a');a.href=url;a.download='ventusiq-compound-evidence.json';a.click();window.setTimeout(()=>window.URL.revokeObjectURL(url),1000);};
  window.WeatherCompound={refresh};refresh();window.setInterval(refresh,60000);return {refresh};
}
if(typeof window!=='undefined'){const start=()=>mountCompound({document,window});if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();}
