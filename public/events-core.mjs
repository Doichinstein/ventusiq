export function capId(value){const id=String(value||'').replace(/^https:\/\/api\.weather\.gov\/alerts\//,'');if(!id||id.length>512||/[\x00-\x20]/.test(id))throw new Error('Invalid alert identifier');return id;}
export async function eventId(value){const id=capId(value);return [...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(id)))].map(b=>b.toString(16).padStart(2,'0')).join('');}
export function validEventId(id){if(!/^[a-f0-9]{64}$/.test(id||''))throw new Error('Invalid event identifier');return id;}
export function changedFields(previous,next){
  if(!previous)return [];
  const fields=[['event','Event'],['severity','Severity'],['certainty','Certainty'],['urgency','Urgency'],['onset','Onset'],['ends','End time'],['expires','Expiry'],['areaDesc','Affected area'],['instruction','Official instructions'],['headline','Headline']];
  const changes=fields.filter(([key])=>JSON.stringify(previous.properties[key]??null)!==JSON.stringify(next.properties[key]??null)).map(([,name])=>name);
  if(JSON.stringify(previous.geometry)!==JSON.stringify(next.geometry))changes.push('Alert polygon');return changes;
}
export function timelineEntries(story){
  const previous=new Map();return story.transitions.map(t=>{const feature=t.feature,p=feature.properties,id=capId(p.id||feature.id);let prior=previous.get(id);
    if(!prior)for(const ref of p.references||[]){const candidate=previous.get(capId(ref.identifier||ref['@id']));if(candidate)prior=candidate;}
    const changes=t.present===0?[]:changedFields(prior,feature);if(t.present!==0)previous.set(id,feature);
    return {...t,changes,label:t.present===0?'Left the active feed':p.messageType==='Cancel'?'Official cancellation collected':p.messageType==='Update'?'Official update collected':t.origin==='reference'?'Referenced message retrieved':'Alert collected'};
  });
}
