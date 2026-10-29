import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import {WeatherService} from '../lib/weather-service.mjs';
import {FirmsService} from '../lib/firms-service.mjs';
import {parseFirms,loadFirms,selectFirms,firmsURL} from '../public/firms-core.mjs';
import {firmsNow,firmsHeader,firmsRow,firmsCSV} from './firms-fixture.mjs';
test('NASA CSV preserves raw fields, UTC acquisition, units and zero FRP',()=>{
  const result=parseFirms(firmsCSV(),firmsNow),p=result.features[0].properties;
  assert.equal(p.observed_at,'2026-10-29T07:00:00.000Z');assert.equal(p.frp_mw,0);assert.equal(p.brightness_i4_k,310.5);assert.equal(p.scan_km,0.4);assert.equal(p.raw.acq_time,'700');assert.equal(p.confidence,'nominal');
});
test('missing and negative measurements stay unknown while usable acquisition survives',()=>{
  const p=parseFirms(firmsCSV(firmsRow({frp:'',scan:'-1',bright_ti4:'NaN'})),firmsNow).features[0].properties;
  assert.equal(p.frp_mw,null);assert.equal(p.scan_km,null);assert.equal(p.brightness_i4_k,null);
});
test('invalid dates, future acquisitions, unsupported satellites and confidence are audited',()=>{
  const r=parseFirms(firmsCSV(firmsRow(),firmsRow({acq_date:'2026-02-30'}),firmsRow({acq_time:'2400'}),firmsRow({acq_time:'0900'}),firmsRow({satellite:'N21'}),firmsRow({confidence:'constructor'})),firmsNow);
  assert.equal(r.features.length,1);assert.equal(r.audit.invalid,4);assert.equal(r.audit.future,1);
  assert.throws(()=>parseFirms(firmsCSV(firmsRow({acq_time:'0900'})),firmsNow),/no usable rows/);
});
test('exact duplicates collapse; conflicting same-pixel editions are all omitted',()=>{
  const r=parseFirms(firmsCSV(firmsRow(),firmsRow(),firmsRow({longitude:'-78'}),firmsRow({longitude:'-78',frp:'1'})),firmsNow);
  assert.equal(r.features.length,1);assert.equal(r.audit.duplicates,1);assert.equal(r.audit.conflicting,2);
});
test('empty source is distinct from malformed or oversized data',()=>{
  assert.equal(parseFirms(firmsHeader+'\n',firmsNow).features.length,0);
  for(const csv of ['<html>Unavailable</html>',firmsCSV()+'bad\n',firmsCSV(...Array(10001).fill(firmsRow())),'x'.repeat(2*1024*1024+1)])assert.throws(()=>parseFirms(csv,firmsNow));
});
test('time, quality and place filters never turn old source detections into recent ones',()=>{
  const data=parseFirms(firmsCSV(firmsRow(),firmsRow({longitude:'-78',confidence:'low',acq_date:'2026-10-28',acq_time:'1200'}),firmsRow({longitude:'-100',confidence:'high'})),firmsNow);
  assert.equal(selectFirms(data,{now:firmsNow,hours:6}).length,2);
  assert.equal(selectFirms(data,{now:firmsNow,confidence:'nominal-high'}).length,2);
  assert.equal(selectFirms(data,{now:firmsNow,near:true,place:{lat:39,lon:-77}}).length,2);
  assert.equal(selectFirms(data,{now:firmsNow+25*3600000}).length,0);
  assert.equal(selectFirms(data,{now:firmsNow,near:true}).length,0);
});
test('fetch is bounded, fixed-origin, redirect-free and hashes exact source bytes',async()=>{
  let request;const data=await loadFirms('alaska',async(url,options)=>{request={url,options};return new Response('\uFEFF'+firmsCSV());},undefined,()=>firmsNow);
  assert.equal(request.url,firmsURL('alaska'));assert.equal(request.options.redirect,'manual');assert.equal(data.raw_csv[0],'\uFEFF');
  const digest=[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(data.raw_csv)))].map(b=>b.toString(16).padStart(2,'0')).join('');assert.equal(data.source_sha256,digest);
  assert.throws(()=>firmsURL('__proto__'),/Invalid/);await assert.rejects(loadFirms('conus',async()=>new Response('x'.repeat(2*1024*1024+1))),/size|limit/);
  await assert.rejects(loadFirms('conus',async()=>new Response('',{status:302})),/302/);
});
test('shared FIRMS archive deduplicates requests, isolates regions and preserves outage provenance',async t=>{
  const sqlite=new DatabaseSync(':memory:');t.after(()=>sqlite.close());for(const f of readdirSync(new URL('../drizzle/',import.meta.url)).filter(f=>f.endsWith('.sql')).sort())sqlite.exec(readFileSync(new URL('../drizzle/'+f,import.meta.url),'utf8'));
  const db={prepare(sql){const s=sqlite.prepare(sql);let args=[];return {bind(...v){args=v;return this;},async first(){return s.get(...args)||null;},async all(){return {results:s.all(...args)};},async run(){return s.run(...args);}};},async batch(statements){sqlite.exec('BEGIN');try{const values=[];for(const s of statements)values.push(await s.run());sqlite.exec('COMMIT');return values;}catch(e){sqlite.exec('ROLLBACK');throw e;}}};
  let now=firmsNow/1000,calls=0,broken=false;
  const w=new WeatherService(db,{clock:()=>now,fetcher:async()=>{calls++;if(broken)throw Error('NASA unavailable');return new Response(firmsCSV());}}),service=new FirmsService(w);
  const first=await service.get('conus');await new FirmsService(w).get('conus');assert.equal(calls,1);
  await service.get('alaska');assert.equal(calls,2);now+=901;const unchanged=await service.get('conus');assert.equal(unchanged.revision,first.revision);assert.notEqual(unchanged.checked_at,first.checked_at);now+=901;broken=true;
  const fallback=await service.get('conus');assert.equal(fallback.stale,true);assert.equal(fallback.checked_at,unchanged.checked_at);assert.equal(fallback.revision,first.revision);assert.match(fallback.error,/NASA unavailable/);
  await assert.rejects(service.get('world'),/Invalid/);assert.equal(calls,4);
});
