import {ensemblePoint} from '../public/ensemble-core.mjs';
import {stationId} from '../public/observations-core.mjs';
import {verificationObservations} from '../public/verification-leads.mjs';
import {ensembleTargets,ensembleChoices,temperatureEvidence,compareEnsemble} from '../public/ensemble-verification-core.mjs';
import {ObservationsService} from './observations-service.mjs';
import {unpack} from './archive-codec.mjs';
import {distanceKm} from '../public/hazards-core.mjs';
export class EnsembleVerificationService{
  constructor(weather){this.weather=weather;}
  async compare(lat,lon,value){
    const point=ensemblePoint(lat,lon),id=stationId(value),observations=new ObservationsService(this.weather),near=await observations.near(lat,lon),station=near.stations.find(s=>s.id===id);
    if(!station)throw Error('Invalid station for this location');
    const sample=await observations.station(id),now=this.weather.clock()*1000,targets=ensembleTargets(now),name='hazards/ensemble-run/gfs025/'+point.key;
    const checks=(await this.weather.statement('SELECT at,revision FROM checks WHERE dataset=? AND at>=? AND at<=? ORDER BY at LIMIT 2001',name,Math.floor(now/1000)-12*86400,Math.floor(now/1000)).all()).results;
    if(checks.length>2000)throw Error('Ensemble history exceeds the comparison limit');
    const choices=ensembleChoices(checks,targets),ids=[...new Set(choices.map(c=>c.check.revision))],forecasts=new Map(),invalid=[];
    // Decode four editions at once, keeping only the temperature evidence needed by this window.
    for(let i=0;i<ids.length;i+=4){const rows=(await this.weather.statement('SELECT revision,payload FROM revisions WHERE dataset=? AND revision IN (SELECT value FROM json_each(?))',name,JSON.stringify(ids.slice(i,i+4))).all()).results;for(const row of rows){try{const projected=temperatureEvidence(await unpack(row.payload),point,now),needed=new Set(choices.filter(c=>c.check.revision===row.revision).map(c=>c.at));projected.rows=projected.rows.filter(r=>needed.has(r.at));forecasts.set(row.revision,projected);}catch{invalid.push(row.revision);}}}
    const audit=verificationObservations(sample,now),report=compareEnsemble(targets,choices,forecasts,audit.rows);
    return {...report,point,station,grid_station_distance_km:distanceKm(point.lat,point.lon,station.lat,station.lon),generated_at:new Date(now).toISOString(),window_start:new Date(now-7*86400000).toISOString(),window_end:new Date(now).toISOString(),station_discovery:{revision:near.revision,checked_at:near.checked_at,stale:near.stale},observation_evidence:sample,observation_audit:{time_excluded:audit.time_excluded,conflicting_timestamps:audit.conflicting_timestamps},stale:near.stale||sample.stale,error:sample.error||near.error,observations_truncated:sample.truncated,archive:{dataset:name,retention_days:7,scanned_checks:checks.length,selected_editions:ids.length,invalid_editions:invalid,projection:'Matched temperature members and provenance only; original source editions are retained in the shared archive while available.'},method:'Latest identified daily GEFS edition actually collected at least six hours before each three-hour valid time; initialization lead 6 to 120 hours. Nearest station temperature within 30 minutes, QC V or G only. Latest available observation corrections are used. No forecast is fetched or reconstructed by this comparison.',interpretation:'Descriptive local comparison, not calibrated probabilities or a model ranking. Members, adjacent times and repeated runs are correlated. Station terrain and elevation can differ from the uncorrected model grid. Counts inside the member range do not establish future coverage. Missing archives, members and readings remain unknown.'};
  }
}
