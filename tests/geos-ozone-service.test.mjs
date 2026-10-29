import {test} from 'node:test';
import assert from 'node:assert/strict';
import {OzoneService} from '../lib/ozone-service.mjs';
import {WeatherService} from '../lib/weather-service.mjs';
import {database} from './fixtures/push.mjs';
import {geosFixture,GEOS_TEST_NOW} from './geos-cf-fixture.mjs';
import {monitor,reading,HOUR} from './ozone-fixture.mjs';
const target=Date.parse('2026-10-29T22:00:00Z'),now=target+1.5*HOUR,key='hazards/air-forecast/geos-cf/39.0,-77.0';
function setup(){const db=database();let at=GEOS_TEST_NOW/1000;const calls=[];const w=new WeatherService(db,{clock:()=>at,fetcher:async url=>{calls.push(url);assert.match(url,/services\.arcgis\.com/);return Response.json(url.includes('/query?')?{type:'FeatureCollection',features:[reading(target)]}:{editingInfo:{lastEditDate:now}});}});return {db,w,service:new OzoneService(w),calls,time:t=>at=t/1000};}
test('NASA comparison uses the monitor cell, excludes a current correction and does not request CAMS or create a watch',async()=>{
  const s=setup();try{const prior=await s.w.collect(key,3600,async()=>geosFixture());s.time(now);const corrected=geosFixture();corrected.raw.series.o3=corrected.raw.series.o3.replace(/(\[\d+\]\[0\]\[0\], )[^\n]+/g,'$10');const current=await s.w.collect(key,3600,async()=>corrected);assert.notEqual(current.revision,prior.revision);
    const r=await s.service.history(39.1,-77,monitor.id,true,'geos'),row=r.comparison.rows.find(r=>r.paired);assert.equal(r.comparison.source,'geos');assert.equal(row.forecast_check.revision,prior.revision);assert.ok(Math.abs(row.model_mean_ppb-49.360096)<1e-8);assert.equal(r.comparison.collection.point.lat,39);assert.equal(r.place.lat,39.1);assert.equal(r.comparison.paired_hours,1);assert.equal(s.calls.length,4);assert.equal((await s.w.statement('SELECT COUNT(*) AS n FROM watches').first()).n,0);
    await assert.rejects(s.service.history(39,-77,monitor.id,true,'bad'),/Unsupported/);
  }finally{s.db.close();}
});
test('a current NASA outage is disclosed without destroying eligible archived comparisons',async()=>{
  const s=setup();try{await s.w.collect(key,3600,async()=>geosFixture());s.time(now);await s.w.statement("INSERT INTO datasets(name,next_fetch,lease_until) VALUES ('limits/geos-cf/request',?,0)",now/1000+300).run();const r=await s.service.history(39,-77,monitor.id,true,'geos');assert.equal(r.comparison.paired_hours,1);assert.match(r.comparison.collection.error,/busy/);assert.equal(s.calls.length,4);
  }finally{s.db.close();}
});
