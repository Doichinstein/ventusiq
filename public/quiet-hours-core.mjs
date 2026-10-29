const formatters=new Map();
export function normalizeQuietHours(input){
  if(input===null||(input&&input.enabled===false))return null;
  if(!input||input.enabled!==true)throw Error('Choose whether quiet hours are enabled');
  const time=/^(?:[01]\d|2[0-3]):[0-5]\d$/;
  if(typeof input.start!=='string'||typeof input.end!=='string'||!time.test(input.start)||!time.test(input.end)||input.start===input.end)throw Error('Choose different start and end times in HH:mm format');
  if(typeof input.time_zone!=='string'||!input.time_zone.trim()||input.time_zone.length>80)throw Error('Enter a supported time zone, such as America/Los_Angeles');
  let zone;try{zone=new Intl.DateTimeFormat('en-GB',{timeZone:input.time_zone.trim()}).resolvedOptions().timeZone;}catch{throw Error('Enter a supported time zone, such as America/Los_Angeles');}
  return {enabled:true,start:input.start,end:input.end,time_zone:zone};
}
export function quietAt(input,seconds){
  const settings=normalizeQuietHours(input);if(!settings)return false;
  if(!Number.isFinite(seconds))throw Error('Invalid notification time');
  let formatter=formatters.get(settings.time_zone);
  if(!formatter){formatter=new Intl.DateTimeFormat('en-GB',{timeZone:settings.time_zone,hourCycle:'h23',hour:'2-digit',minute:'2-digit'});if(formatters.size>=64)formatters.delete(formatters.keys().next().value);formatters.set(settings.time_zone,formatter);}
  const parts=Object.fromEntries(formatter.formatToParts(new Date(seconds*1000)).map(p=>[p.type,p.value]));
  const minute=Number(parts.hour)*60+Number(parts.minute),toMinutes=s=>Number(s.slice(0,2))*60+Number(s.slice(3));
  const start=toMinutes(settings.start),end=toMinutes(settings.end);
  return start<end?minute>=start&&minute<end:minute>=start||minute<end;
}
export function quietReason(snapshot,current,created,now){
  try{
    if(quietAt(snapshot===null?null:JSON.parse(snapshot),created))return 'Muted by quiet hours when this update was queued';
    if(quietAt(current===null?null:JSON.parse(current),now))return 'Muted by current device quiet hours';
    return null;
  }catch{return 'Muted because the stored quiet-hours policy could not be read';}
}
