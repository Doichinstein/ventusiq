import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseHTML} from 'linkedom';
import {mountSourceIntelligence} from '../public/source-intelligence.js';
const now=Date.parse('2026-11-01T20:00:00Z'),stamp=h=>new Date(now+h*3600000).toISOString();
function setup(){
  const {document}=parseHTML(readFileSync(new URL('../public/index.html',import.meta.url),'utf8'));let exported,release,hold=false,calls=[];
  let selected={place:{lat:38.9,lon:-77},station:{id:'KDCA',name:'Washington',distance_km:2,time_zone:'America/New_York'},data:{features:[]}};
  const window={WeatherPersonal:{preferences:()=>({minTemp:40,maxTemp:85}),context:()=>({place:selected.place})},URL:{createObjectURL(b){exported=b;return 'blob:example';},revokeObjectURL(){}},setTimeout:fn=>fn()};
  const fetcher=async path=>{calls.push(path);const u=new URL(path,'https://example.org'),isNws=u.pathname==='/api/verification';if(hold&&isNws){hold=false;await new Promise(r=>release=r);}if(u.pathname==='/api/forecast')return {ok:false,status:404,json:async()=>({error:'No archive'})};return {ok:true,json:async()=>({station:{id:u.searchParams.get('station')},point:isNws?'38.9000,-77.0000':u.pathname.includes('ensemble')?{lat:39,lon:-77}:{lat:38.9,lon:-77},generated_at:stamp(0),pairs:[{valid_at:stamp(-1),forecast_checked_at:stamp(-8),forecast_issued_at:stamp(-9),initialization_at:stamp(-9),lead_hours:8,forecast_f:60,median_f:63,observed_f:62,observation_id:'obs1',observation_at:stamp(-1),quality:'V'}]})};};
  const ui=mountSourceIntelligence({document,window,fetcher,clock:()=>now,selection:()=>selected});
  return {ui,document,window,calls,get:id=>document.getElementById(id),exported:()=>exported,hold:()=>hold=true,release:()=>release(),select:id=>{selected={...selected,station:{...selected.station,id}};ui.reset();}};
}
test('local source evaluation validates different grid resolutions and exports the displayed comparison',async()=>{
  const s=setup();await s.ui.update();await s.ui.run();assert.match(s.get('intelligence-sources').textContent,/NWS hourly · 2.0°F/);assert.match(s.get('intelligence-sources').textContent,/GEFS median · 1.0°F/);assert.match(s.get('intelligence-decision').textContent,/1\/1/);
  s.get('intelligence-export').onclick();const r=JSON.parse(await s.exported().text());assert.equal(r.scorecard.shared[1].left_stats.sample_count,1);assert.equal(r.decision.min_f,40);assert.equal(r.today.earlier.length,0);assert.ok(s.calls.every(p=>!p.includes('hrrr-temperature')&&!p.includes('/api/ensemble?')));
  s.get('intelligence-min').value='70';s.get('intelligence-min').oninput();s.get('intelligence-export').onclick();assert.equal(JSON.parse(await s.exported().text()).decision,null);s.get('intelligence-limits').onsubmit({preventDefault(){}});assert.match(s.get('intelligence-decision').textContent,/false alarm/);
});
test('old station evaluation cannot replace the current selection or leak into its planner',async()=>{
  const s=setup();s.hold();const pending=s.ui.run();await new Promise(r=>setTimeout(r,0));s.select('KNEW');s.release();await pending;assert.equal(s.get('intelligence-sources').textContent,'');assert.equal(s.ui.decisionFor({place:{lat:38.9,lon:-77},preferences:{minTemp:40,maxTemp:85}}),null);
});
test('planner reliability applies its current limits without overwriting scorecard draft limits',async()=>{
  const s=setup();await s.ui.run();const r=s.ui.decisionFor({place:{lat:38.9,lon:-77},preferences:{minTemp:61,maxTemp:80}});assert.equal(r.counts.false_exceedance,1);assert.equal(s.get('intelligence-min').value,'40');assert.equal(s.ui.decisionFor({place:{lat:0,lon:0},preferences:{minTemp:40,maxTemp:85}}),null);
});
