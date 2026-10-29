import {persistenceEvidence} from './verification-persistence-service.mjs';
import {comparePersistence} from '../public/verification-persistence.mjs';
import {smokePoint} from '../public/smoke-core.mjs';
import {stationId,verificationHours} from '../public/observations-core.mjs';
import {verificationObservations} from '../public/verification-leads.mjs';
import {hrrrChoices,compareHrrr,HRRR_LEAD_GROUPS} from '../public/hrrr-verification-core.mjs';
import {ObservationsService} from './observations-service.mjs';
import {unpack} from './archive-codec.mjs';
export class HrrrVerificationService{
  constructor(weather){this.weather=weather;}
  async compare(lat,lon,value){
    const point=smokePoint(lat,lon),id=stationId(value),observations=new ObservationsService(this.weather),near=await observations.near(lat,lon),station=near.stations.find(s=>s.id===id);
    if(!station)throw Error('Invalid station for this location');
    const sample=await observations.station(id),now=this.weather.clock()*1000,targets=verificationHours(now),name='hazards/hrrr-temperature/'+point.lat+','+point.lon;
    const checks=(await this.weather.statement('SELECT at,revision FROM checks WHERE dataset=? AND at>=? AND at<=? ORDER BY at LIMIT 2001',name,Math.floor(now/1000)-9*86400,Math.floor(now/1000)).all()).results;
    if(checks.length>2000)throw Error('HRRR history exceeds the comparison limit');
    const choices=hrrrChoices(checks,targets),ids=[...new Set(choices.map(c=>c.check.revision).filter(Boolean))],products=new Map(),invalid=[];
    for(let i=0;i<ids.length;i+=4){
      const rows=(await this.weather.statement('SELECT revision,payload FROM revisions WHERE dataset=? AND revision IN (SELECT value FROM json_each(?))',name,JSON.stringify(ids.slice(i,i+4))).all()).results;
      for(const row of rows){try{products.set(row.revision,await unpack(row.payload));}catch{invalid.push(row.revision);}}
    }
    const audit=verificationObservations(sample,now),report=compareHrrr(targets,choices,products,audit.rows,point,station),first=checks[0]?.at,
      firstTarget=Number.isSafeInteger(first)?Math.ceil((first+3600)/3600)*3600000:null;
    let baseline;try{baseline=await persistenceEvidence(this.weather,id,report.pairs);}catch{baseline={byCheck:new Map(),archive:null,error:'Persistence archive could not be read; forecast comparisons remain available.'};}
    const persistence=comparePersistence(report.pairs,HRRR_LEAD_GROUPS.map(g=>({id:g.min+'-'+g.max,label:g.label,pairs:report.pairs.filter(p=>p.lead_hours>=g.min&&p.lead_hours<g.max)})),baseline);
    return {...report,persistence,point,station,generated_at:new Date(now).toISOString(),window_start:new Date(now-7*86400000).toISOString(),window_end:new Date(now).toISOString(),
      observation_evidence:sample,observation_audit:{time_excluded:audit.time_excluded,conflicting_timestamps:audit.conflicting_timestamps},station_discovery:{revision:near.revision,checked_at:near.checked_at,stale:near.stale},
      stale:near.stale||sample.stale,error:sample.error||near.error,observations_truncated:sample.truncated,
      archive:{dataset:name,retention_days:7,scanned_checks:checks.length,selected_editions:ids.length,invalid_editions:invalid,
        first_retained_check_at:firstTarget===null?null:new Date(first*1000).toISOString(),earliest_target_by_collection_rule:firstTarget===null?null:new Date(firstTarget).toISOString(),earliest_observation_window_end:firstTarget===null?null:new Date(firstTarget+1800000).toISOString(),
        checks,selections:choices,products:[...products].map(([revision,product])=>({revision,product}))},
      method:'Latest successful HRRR archive check at least one hour before each hourly target; initialization lead 1–48 hours and run age at capture at most 18 hours. Nearest station temperature within 30 minutes, QC V or G only. The observation window must be completed. Latest available observation corrections are used. This comparison never requests a new model forecast.',
      interpretation:'Descriptive differences at a nearby station, not calibrated confidence, a model ranking or address-level accuracy. Terrain/elevation, observation timing and grid representation can differ. Adjacent hours and repeated runs are correlated. The persistence benchmark uses only the subset with eligible pre-capture station editions; no climatology benchmark is included. Missing archives and readings stay unknown.'};
  }
}
