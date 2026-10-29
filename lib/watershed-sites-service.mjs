import {comidId,usgsSite,loadWatershedSites,resolveNwpsSite} from '../public/watershed-sites-core.mjs';
export class WatershedSitesService{
  constructor(weather){this.weather=weather;}
  network(id){id=comidId(id);return this.collect('network/'+id,signal=>loadWatershedSites(id,this.weather.fetcher,signal));}
  gauge(id){id=usgsSite(id);return this.collect('gauge/'+id,signal=>resolveNwpsSite(id,this.weather.fetcher,signal));}
  async collect(key,loader){const w=this.weather,name='hazards/watershed-sites/v1/'+key;
    await w.statement("INSERT OR IGNORE INTO datasets(name,next_fetch,lease_until) SELECT ?,0,0 WHERE (SELECT COUNT(*) FROM datasets WHERE name LIKE 'hazards/watershed-sites/v1/%')<500",name).run();if(!(await w.state(name)).name)throw Error('Shared river association cache is at capacity. Try an existing lookup.');
    const r=await w.collect(name,86400,async signal=>{const now=w.clock(),day=new Date(now*1000).toISOString().slice(0,10);const gate=await w.statement("INSERT INTO datasets(name,next_fetch,lease_until) VALUES ('limits/watershed-sites/request',?,0) ON CONFLICT(name) DO UPDATE SET next_fetch=excluded.next_fetch WHERE datasets.next_fetch<=? RETURNING name",now+2,now).first();if(!gate)throw Error('River association lookup is busy. Retry in two minutes.');
      const budget=await w.statement('INSERT INTO datasets(name,next_fetch,lease_until) VALUES (?,1,0) ON CONFLICT(name) DO UPDATE SET next_fetch=datasets.next_fetch+1 WHERE datasets.next_fetch<1000 RETURNING next_fetch','limits/watershed-sites/day/'+day).first();if(!budget)throw Error('Today’s river association budget is used. Cached results remain available.');await w.statement("DELETE FROM datasets WHERE name LIKE 'limits/watershed-sites/day/%' AND name<?",'limits/watershed-sites/day/'+new Date((now-30*86400)*1000).toISOString().slice(0,10)).run();return loader(signal);});return {...r.data,checked_at:r.checked_at,collected_at:r.collected_at,revision:r.revision,stale:r.stale,error:r.error};
  }
}
