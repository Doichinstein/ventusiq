import {EventsService} from './events-service.mjs';
import {ObservationsService} from './observations-service.mjs';
import {eventAreas} from './event-areas.mjs';
import {alertReportScope} from '../public/event-reports-core.mjs';
import {stationId} from '../public/observations-core.mjs';
import {loadEventStationInventory} from './event-station-inventory.mjs';
import {EVENT_OBSERVATION_METHOD,eventStates,eventStationCandidates,matchEventObservations} from '../public/event-observations-core.mjs';
export class EventObservationsService{
  constructor(weather){this.weather=weather;}
  async inventory(state,at,deadline){
    if(!/^[A-Z]{2}$/.test(state))throw Error('Invalid station state');const key='observations/event-stations-v2/'+state,legacy='observations/event-stations/'+state;
    if(at!==null){const cutoff=Math.floor(at/1000)-1,r=await this.weather.read(key,cutoff)||await this.weather.read(legacy,cutoff);return r?{...r.data,revision:r.revision,checked_at:r.checked_at,stale:false}:null;}
    let result;try{result=await this.weather.collect(key,86400,signal=>loadEventStationInventory(state,(url,combined)=>this.weather.source(url,combined),AbortSignal.any([signal,deadline])));}
    catch(error){const old=await this.weather.read(legacy);if(!old)throw error;return {...old.data,revision:old.revision,checked_at:old.checked_at,stale:true,error:error.message};}
    return {...result.data,revision:result.revision,checked_at:result.checked_at,stale:result.stale,error:result.error};
  }
  /** @param {string|null} id @param {string|null} [station] @param {number|null} [at] @param {number|null} [alertAt] */
  async forEvent(id,station=null,at=null,alertAt=null){
    if(at!==null&&alertAt!==null&&at!==alertAt)throw Error('Invalid alert archive time');const now=this.weather.eventClock(),cutoff=at??now,alertCutoff=at??alertAt??cutoff;
    if(!Number.isFinite(cutoff)||cutoff<0||cutoff>now||!Number.isFinite(alertCutoff)||alertCutoff<0||alertCutoff>cutoff)throw Error('Invalid observation archive time');
    if(station!==null)station=stationId(station);
    const story=await new EventsService(this.weather).story(id,alertCutoff/1000);if(!story)return null;
    const scope=alertReportScope(story,cutoff,{supported:null}),windows_omitted=Math.max(0,scope.windows.length-30);scope.windows=scope.windows.slice(0,30);
    const deadline=AbortSignal.timeout(40000),areas=await eventAreas(this.weather,scope.windows,{historical:at!==null,cutoff,deadline});
    const result={method_version:EVENT_OBSERVATION_METHOD,event_id:id,alert_as_of:story.as_of,as_of:new Date(cutoff).toISOString(),historical:at!==null,scope:{windows:scope.windows.map(({feature,...w})=>w),windows_omitted,invalid_windows:scope.invalid_windows},areas,story,
      interpretation:'Station measurements overlapping collected alert areas and stated times. These are sampled conditions at the station, not proof of impacts throughout the area, causation or official warning verification. No matching measurement does not establish that no event occurred.'};
    if(station===null){const states=eventStates(scope.windows),products=[],coverage=[];for(const state of states.slice(0,2)){try{const p=await this.inventory(state,at,deadline);if(p)products.push(p);coverage.push({state,status:p?(p.stale?'delayed':'collected'):'not_collected_by_cutoff',truncated:p?.truncated||false,pages:p?p.pages?.length??1:null,records:p?.features?.length??0,legacy_inventory:!!p&&!p.inventory_method,error:p?.error||null});}catch(error){coverage.push({state,status:'unavailable',error:error.message});}}
      return {...result,as_of:new Date(at??this.weather.eventClock()).toISOString(),...eventStationCandidates(products,areas),coverage,states_omitted:Math.max(0,states.length-2),inventory_evidence:products,inventory_scope:'Up to four pages (2,000 listed records) per alert UGC state, two states and 25 matching candidates. Older inventory editions may contain only the first 500 records. Four-letter station codes appear first; order does not establish data availability or quality. This bounded search is not a complete station inventory.'};
    }
    let product=null,error=null;try{if(at!==null){const r=await this.weather.read('observations/station/'+station,Math.floor(cutoff/1000)-1);if(r)product={...r.data,revision:r.revision,collected_at:r.collected_at,checked_at:r.checked_at,stale:false};}else product=await new ObservationsService(this.weather).station(station,deadline);}catch(e){error=e.message;}
    const evaluated=at??this.weather.eventClock(),matched=matchEventObservations({scope,areas,collection:product||{features:[]},station,asOf:evaluated});
    return {...result,as_of:new Date(evaluated).toISOString(),station,status:product?(product.stale?'delayed':'collected'):at!==null?'not_collected_by_cutoff':'unavailable',error:error||product?.error||null,...matched,evidence:product,quality_method:'Temperature, sustained wind and gust values require supported units and NWS QC V or G. Conflicting eligible values at the same station timestamp are withheld. Missing gusts never mean calm.'};
  }
}
