import {ROADWORK_FEEDS,normalizeRoadwork} from '../public/roadwork-core.mjs';
export class RoadworkService{
  constructor(weather){this.weather=weather;}
  async feed(id){const provider=Object.hasOwn(ROADWORK_FEEDS,id)?ROADWORK_FEEDS[id]:null;if(!provider)throw Error('Invalid work-zone provider');const w=this.weather,key='roadwork/wzdx/'+id,result=await w.collect(key,300,async signal=>{
    const r=await w.fetcher(provider.url,{signal,redirect:'manual',headers:{Accept:'application/geo+json, application/json'}});if(!r.ok)throw Error('Road agency returned HTTP '+r.status);const reader=r.body?.getReader();if(!reader)throw Error('Missing road-agency response');const parts=[];let size=0;for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>4*1024*1024){await reader.cancel();throw Error('Work-zone feed exceeds 4 MiB');}parts.push(value);}const bytes=new Uint8Array(size);let offset=0;for(const part of parts){bytes.set(part,offset);offset+=part.length;}return normalizeRoadwork(JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes)),id);
  });
    await w.db.batch([
      w.statement('DELETE FROM revisions WHERE dataset=? AND revision NOT IN (SELECT revision FROM revisions WHERE dataset=? ORDER BY first_seen DESC,revision DESC LIMIT 12) AND revision<>(SELECT revision FROM datasets WHERE name=?)',key,key,key),
      w.statement('DELETE FROM checks WHERE dataset=? AND (at<? OR NOT EXISTS(SELECT 1 FROM revisions r WHERE r.dataset=checks.dataset AND r.revision=checks.revision))',key,w.clock()-86400),
    ]);
    return {...result.data,revision:result.revision,collected_at:result.collected_at,checked_at:result.checked_at,stale:result.stale,error:result.error};
  }
}
