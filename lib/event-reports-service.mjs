import {eventAreas} from './event-areas.mjs';
import {EventsService} from './events-service.mjs';
import {REPORT_METHOD,reportURL,parseStormReports,alertReportScope,matchEventReports,inReportArea} from '../public/event-reports-core.mjs';
export class EventReportsService{
  constructor(weather){this.weather=weather;}
  async day(day,at=null,deadline=null){
    const key='event-reports/day/'+day,url=reportURL(day);
    if(at!==null){let old=await this.weather.read(key,at/1000);if(old&&Date.parse(old.data.retrieved_at)>at)old=await this.weather.read(key,Math.floor(at/1000)-1);return old&&Number.isFinite(Date.parse(old.data.retrieved_at))&&Date.parse(old.data.retrieved_at)<=at?{...old.data,revision:old.revision,collected_at:old.collected_at,checked_at:old.checked_at,stale:false,error:null}:null;}
    if(!(await this.weather.state(key)).name){const count=await this.weather.statement("SELECT COUNT(*) AS n FROM datasets WHERE name LIKE 'event-reports/day/%'").first();if(count.n>=256)throw Error('Storm report archive is at capacity');}
    const result=await this.weather.collect(key,900,async signal=>{const r=await this.weather.fetcher(url,{signal:deadline?AbortSignal.any([signal,deadline]):signal,headers:{Accept:'text/csv, text/plain'},redirect:'manual'});if(!r.ok)throw Error('SPC returned HTTP '+r.status);const length=Number(r.headers?.get('content-length'));if(length>2000000)throw Error('Storm report response exceeds its size limit');const data=await parseStormReports(await r.text(),day);return {...data,retrieved_at:new Date(this.weather.eventClock()).toISOString()};});
    return {...result.data,revision:result.revision,collected_at:result.collected_at,checked_at:result.checked_at,stale:result.stale,error:result.error};
  }
  /** @param {string|null} id @param {number|null} [at] @param {number|null} [alertAt] */
  async forEvent(id,at=null,alertAt=null){
    if(at!==null&&alertAt!==null&&at!==alertAt)throw Error('Invalid alert archive time');
    const now=this.weather.eventClock(),cutoff=at===null?now:at;if(!Number.isFinite(cutoff)||cutoff>now||cutoff<0)throw Error('Invalid report archive time');
    const alertCutoff=at??alertAt??cutoff;if(!Number.isFinite(alertCutoff)||alertCutoff>cutoff||alertCutoff<0)throw Error('Invalid alert archive time');
    const story=await new EventsService(this.weather).story(id,alertCutoff/1000);if(!story)return null;
    const scope=alertReportScope(story,cutoff),windows_omitted=Math.max(0,scope.windows.length-30);scope.windows=scope.windows.slice(0,30);
    const deadline=AbortSignal.timeout(40000),products=[],days=[];for(const day of scope.days){try{const data=await this.day(day,at===null?null:cutoff,deadline);if(data){products.push(data);days.push({day,status:data.stale?'delayed':'collected',revision:data.revision,collected_at:data.collected_at,checked_at:data.checked_at,invalid_rows:data.invalid_rows,error:data.error});}else days.push({day,status:'not_collected_by_cutoff'});}catch(error){days.push({day,status:'unavailable',error:String(error.message)});}}
    const areas=await eventAreas(this.weather,scope.windows,{historical:at!==null,cutoff,deadline});
    const evaluated=at===null?this.weather.eventClock():cutoff,matched=matchEventReports(scope,products,areas,evaluated),reports=matched.matches.slice(0,300);
    return {method_version:REPORT_METHOD,event_id:id,as_of:new Date(evaluated).toISOString(),alert_as_of:story.as_of,evaluated_at:new Date(this.weather.eventClock()).toISOString(),historical:at!==null,scope:{windows:scope.windows.map(({feature,...w})=>w),days:scope.days,days_omitted:scope.days_omitted,span_exceeds_limit:scope.span_exceeds_limit,windows_omitted,invalid_windows:scope.invalid_windows,unsupported_events:scope.unsupported_events},days,areas,reports,matched_count:matched.matches.length,reports_omitted:Math.max(0,matched.matches.length-300),future_reports_excluded:matched.future_reports_excluded,evidence:products,story,interpretation:'Preliminary reports overlapping collected alert areas and stated times, shortened by explicit successor messages. Association is not official warning verification, proof of causation, or a complete count of storms, damage or casualties. No matching report does not establish that no event occurred.'};
  }
}
