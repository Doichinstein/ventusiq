import {EventsService} from './events-service.mjs';
import {eventAreas} from './event-areas.mjs';
import {RiversService} from './rivers-service.mjs';
import {gaugeId,loadRiverRegion} from '../public/rivers-core.mjs';
import {alertReportScope} from '../public/event-reports-core.mjs';
import {EVENT_GAUGE_METHOD,FLOOD_EVENTS,eventGaugeBoxes,eventGaugeCandidates,matchEventGauge} from '../public/event-gauges-core.mjs';
export class EventGaugesService{
  constructor(weather){this.weather=weather;}
  async inventory(box,at,deadline){const key='hazards/event-gauges/'+box.join(',');
    if(at!==null){const r=await this.weather.read(key,Math.floor(at/1000)-1);return r?{...r.data,revision:r.revision,checked_at:r.checked_at}:null;}
    if(!(await this.weather.state(key)).name){const count=await this.weather.statement("SELECT COUNT(*) AS n FROM datasets WHERE name LIKE 'hazards/event-gauges/%'").first();if(count.n>=500)throw Error('Event gauge inventory cache is at capacity');}
    const result=await this.weather.collect(key,3600,async signal=>{const data=await loadRiverRegion({key:box.join(','),boxes:[box]},this.weather.fetcher,AbortSignal.any([signal,deadline]));if(data.features.length>2000)throw Error('Gauge inventory exceeds the regional limit');return data;});return {...result.data,revision:result.revision,checked_at:result.checked_at,stale:result.stale,error:result.error};
  }
  /** @param {string|null} id @param {string|null} [gauge] @param {number|null} [at] @param {number|null} [alertAt] */
  async forEvent(id,gauge=null,at=null,alertAt=null){
    if(at!==null&&alertAt!==null&&at!==alertAt)throw Error('Invalid alert archive time');const now=this.weather.eventClock(),cutoff=at??now,alertCutoff=at??alertAt??cutoff;
    if(!Number.isFinite(cutoff)||cutoff<0||cutoff>now||!Number.isFinite(alertCutoff)||alertCutoff<0||alertCutoff>cutoff)throw Error('Invalid gauge archive time');if(gauge!==null)gauge=gaugeId(gauge);
    const story=await new EventsService(this.weather).story(id,alertCutoff/1000);if(!story)return null;
    const scope=alertReportScope(story,cutoff,{supported:FLOOD_EVENTS}),windows_omitted=Math.max(0,scope.windows.length-30);scope.windows=scope.windows.slice(0,30);
    const deadline=AbortSignal.timeout(40000),areas=await eventAreas(this.weather,scope.windows,{historical:at!==null,cutoff,deadline});
    const base={method_version:EVENT_GAUGE_METHOD,event_id:id,alert_as_of:story.as_of,as_of:new Date(cutoff).toISOString(),historical:at!==null,scope:{windows:scope.windows.map(({feature,...w})=>w),windows_omitted,invalid_windows:scope.invalid_windows,unsupported_events:scope.unsupported_events},areas,story,
      interpretation:'NWPS observed primary readings at a gauge inside collected flood-alert geometry and stated valid times. Geographic overlap does not establish watershed membership, local flood impacts or official warning verification. Missing readings do not establish that flooding did not occur.',
      quality_method:'NWPS observed readings only; no forecast values or inferred quality certification. Thresholds and vertical references come from the same collected gauge edition and may differ from those in effect when an older reading was measured. Highest sample is not necessarily the event crest; sample counts are not duration.'};
    if(gauge===null){const search=eventGaugeBoxes(areas),products=[],coverage=[];for(const box of search.boxes){try{const p=await this.inventory(box,at,deadline);if(p)products.push(p);coverage.push({box,status:p?(p.stale?'delayed':'collected'):'not_collected_by_cutoff',error:p?.error||null});}catch(e){coverage.push({box,status:'unavailable',error:e.message});}}
      return {...base,as_of:new Date(at??this.weather.eventClock()).toISOString(),...eventGaugeCandidates(products,areas,scope.windows),coverage,boxes_omitted:search.boxes_omitted,inventory_evidence:products,inventory_scope:'Up to three boundary boxes no larger than 12° longitude by 8° latitude; at most 2,000 gauges per box and 25 matching candidates. Overlarge areas are omitted. This is a bounded inventory; enter a known gauge ID if absent.'};}
    let product=null,error=null;try{if(scope.windows.length){if(at!==null){const r=await this.weather.read('hazards/rivers/gauge/'+gauge,Math.floor(cutoff/1000)-1);if(r)product={...r.data,revision:r.revision,checked_at:r.checked_at,collected_at:r.collected_at};}else product=await new RiversService(this.weather).gauge(gauge);}}catch(e){error=e.message;}
    const evaluated=at??this.weather.eventClock();return {...base,as_of:new Date(evaluated).toISOString(),gauge,status:!scope.windows.length?'not_applicable':product?(product.stale?'delayed':'collected'):at!==null?'not_collected_by_cutoff':'unavailable',error:error||product?.error||null,...matchEventGauge({product,gauge,scope,areas,asOf:evaluated}),evidence:product};
  }
}
