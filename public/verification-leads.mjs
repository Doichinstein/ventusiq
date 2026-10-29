import {forecastChoices,compareTemperatures,observations} from './observations-core.mjs';
export const VERIFICATION_LEAD_METHOD='2026-10-29.1';
export const LEAD_GROUPS=[
  {id:'6-12',label:'6–<12 hours',minLead:6,maxLead:12,maxExclusive:true},
  {id:'12-24',label:'12–<24 hours',minLead:12,maxLead:24,maxExclusive:true},
  {id:'24-48',label:'24–<48 hours',minLead:24,maxLead:48,maxExclusive:true},
  {id:'48-72',label:'48–72 hours',minLead:48,maxLead:72,maxExclusive:false},
];
export function leadChoices(checks,targets){return LEAD_GROUPS.map(group=>({group,choices:forecastChoices(checks,targets,group)}));}
export function verificationObservations(collection,now){
  const byTime=new Map();let time_excluded=0;
  for(const feature of collection.features||[]){
    const timestamp=feature.properties?.timestamp;if(typeof timestamp!=='string'||!/(Z|[+-]\d{2}:\d{2})$/.test(timestamp)||!Number.isFinite(Date.parse(timestamp))){time_excluded++;continue;}
    const row=observations({features:[feature]},now)[0];if(!row)continue;
    if(!byTime.has(row.at))byTime.set(row.at,[]);byTime.get(row.at).push(row);
  }
  let conflicting_timestamps=0;
  const rows=[...byTime.values()].map(group=>{
    group.sort((a,b)=>String(a.id).localeCompare(String(b.id)));const first=group[0];
    const conflict=group.some(r=>r.temperature!==first.temperature||r.temperature_qc!==first.temperature_qc);
    if(conflict)conflicting_timestamps++;
    return conflict?{...first,temperature:null,verification_conflict:true}:first;
  }).sort((a,b)=>a.at-b.at);
  return {rows,time_excluded,conflicting_timestamps};
}
function daily(pairs){
  const days=new Map();for(const p of pairs){const day=p.valid_at.slice(0,10);if(!days.has(day))days.set(day,[]);days.get(day).push(p);}
  return [...days].map(([date,rows])=>({date,sample_count:rows.length,mae_f:rows.reduce((sum,r)=>sum+Math.abs(r.error_f),0)/rows.length,bias_f:rows.reduce((sum,r)=>sum+r.error_f,0)/rows.length}));
}
export function compareLeadGroups(targets,selections,forecasts,rows){
  const groups=selections.map(({group,choices})=>{const result=compareTemperatures(targets,choices,forecasts,rows,group);return {...group,...result,daily:daily(result.pairs)};});
  const anchor=groups.find(g=>g.id==='6-12'),byTime=new Map((anchor?.pairs||[]).map(p=>[p.valid_at,p]));
  const shared=groups.filter(g=>g.id!=='6-12').map(group=>{
    const pairs=[];for(const longer of group.pairs){const shorter=byTime.get(longer.valid_at);if(!shorter||shorter.observation_id!==longer.observation_id||shorter.observation_at!==longer.observation_at||shorter.observed_f!==longer.observed_f)continue;
      pairs.push({valid_at:longer.valid_at,observation_id:longer.observation_id,observation_at:longer.observation_at,observed_f:longer.observed_f,shorter_error_f:shorter.error_f,longer_error_f:longer.error_f,shorter_revision:shorter.forecast_revision,longer_revision:longer.forecast_revision,absolute_error_difference_f:Math.abs(longer.error_f)-Math.abs(shorter.error_f)});
    }
    const n=pairs.length,mean=key=>n?pairs.reduce((sum,p)=>sum+Math.abs(p[key]),0)/n:null;
    return {shorter_id:'6-12',longer_id:group.id,longer_label:group.label,sample_count:n,days:new Set(pairs.map(p=>p.valid_at.slice(0,10))).size,shorter_mae_f:mean('shorter_error_f'),longer_mae_f:mean('longer_error_f'),difference_f:n?pairs.reduce((sum,p)=>sum+p.absolute_error_difference_f,0)/n:null,pairs};
  });
  return {method:VERIFICATION_LEAD_METHOD,groups,shared,scope:'Descriptive station-temperature errors by source lead, using forecasts actually collected before the decision cutoff. Different groups can cover different hours. Shared comparisons require the same valid hour and identical verifying observation. No calibrated confidence or causal skill claim.'};
}
