import {loadRiverNetwork} from '../public/river-network-core.mjs';
import {riverRegion,loadRiverRegion,gaugeId,loadGauge} from '../public/rivers-core.mjs';
import {forecastIdentity,compareRiverForecasts} from '../public/river-changes-core.mjs';
import {unpack} from './archive-codec.mjs';
export class RiversService{
  constructor(weather){this.weather=weather;}
  async near(lat,lon){const region=riverRegion(lat,lon);return this.collect('hazards/rivers/near/'+region.key,signal=>loadRiverRegion(region,this.weather.fetcher,signal));}
  async gauge(id){id=gaugeId(id);return this.collect('hazards/rivers/gauge/'+id,signal=>loadGauge(id,this.weather.fetcher,signal));}
  async network(id){id=gaugeId(id);return this.collect('hazards/rivers/network/'+id,signal=>loadRiverNetwork(id,this.weather.fetcher,signal));}
  async changes(value){
    const id=gaugeId(value),current=await this.gauge(id),name='hazards/rivers/gauge/'+id,now=this.weather.clock()*1000,identity=forecastIdentity(current,now),cutoff=Date.parse(current.checked_at)/1000;
    const rows=await this.weather.statement('SELECT r.revision,r.first_seen,MAX(c.at) AS checked FROM checks c JOIN revisions r ON c.dataset=r.dataset AND c.revision=r.revision WHERE c.dataset=? AND c.at<? AND c.at>=? GROUP BY r.revision ORDER BY checked DESC LIMIT 129',name,cutoff,cutoff-7*86400).all();
    let previous=null,scanned=0;for(let offset=0;offset<Math.min(128,rows.results.length)&&!previous;offset+=8){const batch=rows.results.slice(offset,Math.min(offset+8,128));const payloads=await this.weather.statement('SELECT revision,payload FROM revisions WHERE dataset=? AND revision IN (SELECT value FROM json_each(?))',name,JSON.stringify(batch.map(r=>r.revision))).all();const byId=new Map(payloads.results.map(r=>[r.revision,r.payload]));for(const row of batch){scanned++;if(!byId.has(row.revision))continue;const data=await unpack(byId.get(row.revision));if(forecastIdentity(data,now)===identity)continue;previous={...data,revision:row.revision,collected_at:new Date(row.first_seen*1000).toISOString(),checked_at:new Date(row.checked*1000).toISOString()};break;}}
    return {...compareRiverForecasts(current,previous,now),archive:{retention_days:7,scanned_products:scanned,scan_limit:128,truncated:!previous&&rows.results.length>128}};
  }
  async collect(key,loader){const result=await this.weather.collect(key,900,loader);return {...result.data,collected_at:result.collected_at,checked_at:result.checked_at,stale:result.stale,error:result.error,revision:result.revision};}
}
