/* Same-valid-hour changes in previously collected NWS forecasts. Apache-2.0. */
export const STABILITY_METHOD='2026-10-29.1';
const HOUR=3600000;
const stamp=value=>typeof value==='string'&&/(Z|[+-]\d\d:\d\d)$/.test(value)&&Number.isFinite(Date.parse(value))?Date.parse(value):null;
const finite=value=>typeof value==='number'&&Number.isFinite(value);
function series(product){
  const periods=product?.data?.forecast?.properties?.periods;
  if(!Array.isArray(periods)||!periods.length||periods.length>2000)return {error:'Hourly periods missing or oversized',periods:[]};
  const rows=periods.map((p,index)=>({raw:p,index,start:stamp(p.startTime),end:stamp(p.endTime)}));
  if(rows.some(p=>p.start===null||p.end===null||p.end<=p.start))return {error:'A source period has invalid timing',periods:[]};
  return {error:null,periods:rows};
}
function sample(series,at){
  const overlap=series.periods.filter(p=>p.start<at+HOUR&&p.end>at);
  if(series.error||overlap.length!==1||overlap[0].start!==at||overlap[0].end!==at+HOUR)return {temperature_f:null,rain_percent:null,period_index:null,reason:series.error||'Missing, overlapping or non-hourly source period'};
  const {raw:p,index}=overlap[0],temp=finite(p.temperature)?p.temperatureUnit==='F'?p.temperature:p.temperatureUnit==='C'?p.temperature*9/5+32:null:null,rain=p.probabilityOfPrecipitation;
  return {temperature_f:finite(temp)&&temp>=-130&&temp<=140?temp:null,rain_percent:rain?.unitCode==='wmoUnit:percent'&&finite(rain.value)&&rain.value>=0&&rain.value<=100?rain.value:null,period_index:index,reason:null};
}
const grid=product=>{
  const url=product?.data?.source_url;
  return typeof url==='string'&&/^https:\/\/api\.weather\.gov\/gridpoints\/[A-Z0-9]+\/\d+,\d+\/forecast\/hourly$/.test(url)&&product.data.metadata?.properties?.forecastHourly===url?url:null;
};
export function forecastStability({point,current,earlier,now,lookback_hours}){
  if(!Number.isSafeInteger(now)||![6,12,24].includes(lookback_hours))throw Error('Invalid forecast comparison window');
  const cutoff=now-lookback_hours*HOUR,currentCheck=stamp(current?.checked_at),earlierCheck=stamp(earlier?.checked_at);
  let reason=null;
  if(!current||currentCheck===null||currentCheck>now)reason='No forecast collected by the evaluation time';
  else if(!earlier||earlierCheck===null||earlierCheck>cutoff)reason='No forecast collected by the earlier cutoff';
  else if(cutoff-earlierCheck>3*HOUR)reason='The earlier archived check is more than three hours before the requested cutoff';
  else if(!grid(current)||grid(current)!==grid(earlier))reason='Forecast grid identity is missing or changed';
  else if([current,earlier].some(p=>stamp(p.issued_at)!==null&&stamp(p.issued_at)>stamp(p.checked_at)+60000))reason='A source issue time is later than its archived collection';
  const currentSeries=series(current),earlierSeries=series(earlier),start=Math.ceil(now/HOUR)*HOUR;
  const rows=Array.from({length:48},(_,i)=>{
    const at=start+i*HOUR,a=sample(earlierSeries,at),b=sample(currentSeries,at);
    return {at:new Date(at).toISOString(),end:new Date(at+HOUR).toISOString(),earlier:a,current:b,
      temperature_change_f:!reason&&a.temperature_f!==null&&b.temperature_f!==null?b.temperature_f-a.temperature_f:null,
      rain_change_percentage_points:!reason&&a.rain_percent!==null&&b.rain_percent!==null?b.rain_percent-a.rain_percent:null};
  });
  const temperature=rows.filter(r=>r.temperature_change_f!==null),rain=rows.filter(r=>r.rain_change_percentage_points!==null);
  const issuedCurrent=stamp(current?.issued_at),issuedEarlier=stamp(earlier?.issued_at);
  return {method:STABILITY_METHOD,point,evaluated_at:new Date(now).toISOString(),earlier_cutoff:new Date(cutoff).toISOString(),lookback_hours,
    status:reason?'unavailable':'compared',reason,current_delayed:currentCheck===null||now-currentCheck>2*HOUR||!!current?.error,
    same_revision:!!current&&!!earlier&&current.revision===earlier.revision,source_issue_moved_back:issuedCurrent!==null&&issuedEarlier!==null&&issuedCurrent<issuedEarlier,
    time_zone:current?.data?.metadata?.properties?.timeZone||null,rows,
    summary:{expected_hours:48,temperature_paired_hours:temperature.length,rain_paired_hours:rain.length,
      largest_absolute_temperature_change_f:temperature.length?Math.max(...temperature.map(r=>Math.abs(r.temperature_change_f))):null,
      largest_absolute_rain_change_percentage_points:rain.length?Math.max(...rain.map(r=>Math.abs(r.rain_change_percentage_points))):null},
    interpretation:'Changes compare the same future hours in two collected NWS editions. Stable forecasts can still be wrong; changes are not measured errors or calibrated confidence. Missing values stay unknown.',
    evidence:{current,earlier}};
}
