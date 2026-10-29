/* Opt-in transitions over the shared compound rules. Apache-2.0. */
import {COMPOUND_RULES,RULESET_VERSION} from './compound-core.mjs';
export const COMPOUND_WATCH_METHOD='2026-10-29.1';
export function compoundWatchSetting(value){
  if(value===undefined||value===null)return [];
  if(!Array.isArray(value)||value.length>COMPOUND_RULES.length||value.some(id=>!COMPOUND_RULES.some(r=>r.id===id)))throw Error('Invalid compound watch rules');
  return COMPOUND_RULES.filter(r=>value.includes(r.id)).map(r=>r.id);
}
export function evaluateCompoundWatch({selected,report,previous=null}){
  const ids=compoundWatchSetting(selected),rules=[],changes=[];
  const compatible=previous?.method_version===COMPOUND_WATCH_METHOD&&previous?.ruleset_version===RULESET_VERSION;
  for(const id of ids){
    const definition=COMPOUND_RULES.find(r=>r.id===id),found=report?.rules?.find(r=>r.id===id),valid=report?.ruleset_version===RULESET_VERSION&&found&&['matched','not_detected','unknown'].includes(found.status);
    const status=valid?found.status:'unknown',prior=compatible?previous.rules?.find(r=>r.id===id):null,last=prior?.status&&prior.status!=='unknown'?prior.status:prior?.last_known??null;
    const premises=new Set((found?.windows||[]).flatMap(w=>w.segments.flatMap(s=>s.premises)));
    // Retain the normalized values/times/revisions used by each premise, not full national polygons.
    const evidence=(report?.evidence||[]).filter(e=>premises.has(e.id)).map(({source_snapshot,...e})=>e);
    const current={...definition,status,coverage_complete:!!(valid&&found.coverage_complete),coverage_note:valid?found.coverage_note:'Compound evaluation unavailable.',windows:valid?found.windows:[],evidence:valid?evidence:[],last_known:status==='unknown'?last:status};
    rules.push(current);
    if(previous){
      if(status!=='unknown'&&last===null)changes.push({kind:'baseline_compound',key:id,title:'First usable compound check: '+definition.title,after:current});
      else if(status!=='unknown'&&last!==status)changes.push({kind:'compound',key:id,title:definition.title+(status==='matched'?' — now detected':' — no longer detected; not an all-clear'),before:prior,after:current});
      if(prior&&prior.coverage_complete!==current.coverage_complete)changes.push({kind:'compound_coverage',key:id,title:'Compound coverage '+(current.coverage_complete?'available again: ':'incomplete or delayed: ')+definition.title,before:prior,after:current});
    }
  }
  return {snapshot:{method_version:COMPOUND_WATCH_METHOD,ruleset_version:RULESET_VERSION,evaluated_at:report?.evaluated_at||null,horizon_end:report?.horizon_end||null,rules,sources:report?.sources||null,limitations:'Changes in selected source-overlap rules, not observed impacts, joint probabilities or all-clear conditions. Forecast rules use 48 hours; measured air is an observation instant. Normalized premise evidence is retained; raw products follow their own archive retention.'},changes,covered:rules.every(r=>r.coverage_complete)};
}
