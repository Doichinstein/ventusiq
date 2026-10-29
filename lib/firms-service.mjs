import {loadFirms,firmsURL} from '../public/firms-core.mjs';
export class FirmsService{
  constructor(weather){this.weather=weather;}
  async get(region){firmsURL(region);const w=this.weather,r=await w.collect('hazards/firms/noaa20/'+region,900,async signal=>{
    const {retrieved_at,...data}=await loadFirms(region,w.fetcher,signal,()=>w.clock()*1000);
    // Collection checks already retain timing; unchanged raw products share a revision.
    return data;
  });return {...r.data,revision:r.revision,collected_at:r.collected_at,checked_at:r.checked_at,stale:r.stale,error:r.error};}
}
