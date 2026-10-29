import {networkExplanation} from './journey-network.mjs';
export function renderRouteRoads(document,route,departure,format){
  const el=(tag,text)=>{const n=document.createElement(tag);n.textContent=text;return n;},context=route.road_context;
  document.getElementById('journey-roads-status').textContent=context?.segments?.length?
    `${context.segments.length} route steps aligned to the road geometry; ${context.unavailable_legs.length} legs without usable labels. Map data version: ${context.data_version||'not supplied by router'}. Times include planned stops; stop intervals themselves have no assigned road label.`:
    'Road labels are unavailable for this route. Weather and agency proximity remain separate.';
  const evidence=el('details','');evidence.append(el('summary','Agency matching & routing evidence'),el('p',networkExplanation(route.network_references,route.legs?.length||0)));
  const nodes=[evidence];
  for(const s of (context?.segments||[]).slice(0,100))nodes.push(el('p',
    `Leg ${s.leg_index+1}, step ${s.step_index+1}: ${s.name||'Unnamed road'}${s.ref?' · '+s.ref:''} · ${s.mode}. ${format(Date.parse(departure)+s.start_elapsed*1000)} – ${format(Date.parse(departure)+s.end_elapsed*1000)} (UTC).`));
  if(context?.segments.length>100)nodes.push(el('p','Additional steps are retained in the journey JSON export.'));
  document.getElementById('journey-roads-list').replaceChildren(...nodes);
}
export function roadLabelExplanation(evidence){
  if(evidence?.status==='shared_label')return 'At least one nearby route step shares a road label with this agency record. Road identity, carriageway, signed direction and closure attribution remain unverified.';
  if(evidence?.status==='no_shared_label')return 'Available nearby route labels do not share the agency’s label. Alternate names and incomplete maps mean this does not exclude an effect on the route.';
  return 'No usable route-road label for this passage. Junction touches and stop-only intervals do not establish a road identity.';
}
