export const EVENT_LABELS=Object.freeze({
  reviewed_reported_closure_overlap:'Reported full closure overlaps your estimated passage',
  reviewed_reported_impact_overlap:'Reported restriction overlaps your estimated passage',
  reviewed_reported_work_zone_overlap:'Reported work zone overlaps your estimated passage',
  scheduled_impact_overlap:'Scheduled work overlaps your estimated passage',
  boundary_uncertain:'Road-event boundary is uncertain',
  no_reviewed_time_overlap:'No overlap with this reviewed event',
  blocked:'This event could not be assessed',
});
export function eventDepartures(values,now){
  if(!Array.isArray(values)||values.length<1||values.length>3)throw Error('Choose one to three road-event departure times.');
  const dates=values.map(v=>{
    if(typeof v!=='string'||!/(Z|[+-]\d{2}:\d{2})$/.test(v)||!Number.isFinite(Date.parse(v)))throw Error('Road-event departures need an explicit timezone.');
    const t=Date.parse(v);if(t<now||t>now+48*3600000)throw Error('Road-event departures must be within the next 48 hours.');return new Date(t).toISOString();
  });
  if(new Set(dates).size!==dates.length)throw Error('Road-event departures must be distinct.');
  return dates;
}
export function reviewedEventSummary(value){
  if(!value)return 'Reviewed road events not requested.';
  if(value.status==='unavailable')return 'Reviewed road events unavailable: '+value.reason;
  const results=value.results||[],overlaps=results.filter(r=>['reviewed_reported_closure_overlap','reviewed_reported_impact_overlap','reviewed_reported_work_zone_overlap','scheduled_impact_overlap'].includes(r.status)).length;
  const unknown=results.filter(r=>['blocked','boundary_uncertain'].includes(r.status)).length;
  return `${results.length} supplied events assessed · ${overlaps} reported/scheduled overlaps · ${unknown} blocked or uncertain. Other roads and events remain unknown.`;
}
export function selectReviewedEvents(data,route,departures,index){
  if(!data)return null;
  if(data.status==='unavailable')return data;
  if(data.route_revision!==route.revision||data.graph_sha256!==route.network_references?.graph_sha256||
      data.departures?.length!==departures.length||data.departures.some((d,i)=>Date.parse(d.departure)!==Date.parse(departures[i])))
    return {status:'unavailable',reason:'The event assessment does not match this route and departure comparison. Compare again.'};
  return {...data.departures[index],status:'evaluated',evaluated_at:data.evaluated_at,bundle_sha256:data.bundle_sha256};
}
export function renderReviewedEvents(document,value,format){
  const target=document.getElementById('journey-reviewed-events');target.hidden=!value;if(!value){target.replaceChildren();return;}
  const el=(tag,text)=>{const n=document.createElement(tag);n.textContent=text;return n;};
  const details=el('details','');details.append(el('summary','Reviewed road events'),el('p',reviewedEventSummary(value)));
  details.append(el('p','These are operator-reviewed agency reports, not field verification, navigation or an assurance of road access. Stopped-location applicability is not assessed.'));
  if(value.status==='evaluated'){
    details.append(el('p','Snapshot evaluated '+format(value.evaluated_at)+'. Compare again to refresh.'));
    for(const result of value.results){
      const row=el('details','');row.append(el('summary',EVENT_LABELS[result.status]),el('p','Agency event '+result.event_id));
      if(result.legs[0])row.append(el('p','Agency vehicle impact: '+result.legs[0].vehicle_impact+'. This does not establish driving access.'));
      for(const block of result.blocks)row.append(el('p',block));
      for(const passage of result.passages.slice(0,100))row.append(el('p',`Leg ${passage.leg_index+1} · estimated passage ${format(passage.estimated_passage[0])} – ${format(passage.estimated_passage[1])}`));
      if(result.passages.length>100)row.append(el('p','Additional passages are in the journey export.'));
      const source=el('details','');source.append(el('summary','Source & review evidence'));
      const leg=result.legs[0];if(leg)source.append(el('p',`Source collected ${format(leg.source_checked_at)} · feed issued ${format(leg.source_issued_at)} · event updated ${format(leg.event_updated_at)}.`));
      for(const [kind,review] of Object.entries(result.reviews||{})){
        source.append(el('p',`${kind==='association'?'Event':'Road mapping'} review: ${review.reviewer||'unnamed'} · ${review.status} · expires ${format(review.expires_at)}`));
        for(const item of review.evidence||[]){try{const url=new URL(item.url);if(url.protocol!=='https:'||url.username||url.password)continue;const a=el('a','Review source ↗');a.href=url.href;a.target='_blank';a.rel='noopener';source.append(a);}catch{ /* Retained raw input remains in the export. */ }}
      }
      source.append(el('p','Bundle SHA-256: '+value.bundle_sha256));row.append(source);details.append(row);
    }
  }
  target.replaceChildren(details);
}
