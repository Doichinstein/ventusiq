import {test} from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {mountPMComparison} from '../public/pm-comparison.js';import {comparePM} from '../public/pm-comparison-core.mjs';import {fixture,monitor} from './pm-comparison-fixture.mjs';
class Element{constructor(){this.children=[];this.text='';this.disabled=false;}set textContent(v){this.text=String(v);this.children=[];}get textContent(){return this.text+this.children.map(c=>c.textContent).join('');}append(...n){this.children.push(...n);}replaceChildren(...n){this.text='';this.children=n;}click(){this.onclick?.();}}
function setup(mode='hosted'){const nodes=Object.fromEntries([...readFileSync(new URL('../public/index.html',import.meta.url),'utf8').matchAll(/id="([^"]+)"/g)].map(m=>[m[1],new Element()]));let calls=0,place={lat:39,lon:-77},selected=monitor,hold=false,release,broken=false,exported;const value={...comparePM(fixture()),discovery:{stale:false},collection:{}};const window={WEATHER_CONFIG:{mode},WeatherPersonal:{current:()=>place},WeatherAirTrends:{context:()=>({monitor:selected})},URL:{createObjectURL:b=>{exported=b;return 'blob:comparison';},revokeObjectURL(){}},setTimeout:f=>f()};const mounted=mountPMComparison({document:{getElementById:id=>nodes[id],createElement:()=>new Element()},window,fetcher:async()=>{calls++;if(hold){hold=false;await new Promise(r=>release=r);}if(broken)throw Error('offline');return Response.json(value);}});return {nodes,mounted,calls:()=>calls,exported:()=>exported,hold:()=>hold=true,release:()=>release(),place:p=>place=p,monitor:m=>selected=m,break:()=>broken=true,value};}
test('comparison requires explicit action and exports the exact paired and excluded evidence',async()=>{const s=setup();assert.equal(s.calls(),0);await s.mounted.run();assert.match(s.nodes['pm-comparison-results'].textContent,/1\/24 paired hours/);assert.match(s.nodes['pm-comparison-results'].textContent,/same 1 hours/);s.nodes['pm-comparison-export'].onclick();const r=JSON.parse(await s.exported().text());assert.equal(r.sources.forecasts[0].product.raw.hourly.pm2_5[24],8);assert.equal(r.audit.length,24);});
test('place/monitor changes invalidate exports and late replies cannot restore another selection',async()=>{const s=setup();await s.mounted.run();s.hold();const pending=s.mounted.run();s.place({lat:40,lon:-77});s.mounted.refresh();s.release();await pending;assert.equal(s.nodes['pm-comparison-results'].textContent,'');assert.equal(s.nodes['pm-comparison-export'].disabled,true);s.monitor(null);s.mounted.refresh();assert.equal(s.nodes['pm-comparison-run'].disabled,true);});
test('source failures clear old comparison results, and static mode cannot request a nonexistent archive',async()=>{const s=setup();await s.mounted.run();s.break();await s.mounted.run();assert.match(s.nodes['pm-comparison-status'].textContent,/offline/);assert.equal(s.nodes['pm-comparison-results'].textContent,'');assert.equal(s.nodes['pm-comparison-export'].disabled,true);const local=setup('static');await local.mounted.run();assert.equal(local.calls(),0);assert.match(local.nodes['pm-comparison-status'].textContent,/hosted archive/);});

test('empty comparisons explain the completed-hour wait and preserve pending evidence in the download',async()=>{
  const s=setup(),f=fixture();f.checks=[{at:f.now/1000,revision:'forecast-before'}];Object.assign(s.value,comparePM(f));
  await s.mounted.run();const text=s.nodes['pm-comparison-results'].textContent;
  assert.match(text,/0\/24 paired hours/);assert.match(text,/Waiting for a completed measurement hour/);
  assert.match(text,/provider reporting and quality checks may take longer/);assert.match(text,/on demand/);
  assert.doesNotMatch(text,/Mean absolute difference/);s.nodes['pm-comparison-export'].onclick();
  const saved=JSON.parse(await s.exported().text());assert.equal(saved.readiness.period_ends_at,'2026-10-29T09:00:00.000Z');
  assert.equal(saved.readiness.forecast_source.revision,'forecast-before');assert.equal(saved.metrics.count,0);
});

test('missing measurements and unusable forecast archives have distinct empty-state explanations',async()=>{
  const s=setup();s.value.metrics.count=0;
  s.value.readiness={status:'measurement_unavailable',target_at:'2026-10-29T05:00:00Z'};
  await s.mounted.run();assert.match(s.nodes['pm-comparison-results'].textContent,/monitor reading is missing, invalid or conflicting/);
  s.value.readiness={status:'no_pending_forecast'};await s.mounted.run();assert.match(s.nodes['pm-comparison-results'].textContent,/No usable saved forecast/);
  assert.doesNotMatch(s.nodes['pm-comparison-results'].textContent,/Waiting for a completed/);
});
