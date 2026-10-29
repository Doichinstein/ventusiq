import {test} from 'node:test';import assert from 'node:assert/strict';import {mountHrrrTemperature} from '../public/hrrr-temperature.js';
import {hrrrNow,hrrrIssued} from './fixtures/hrrr.mjs';
class Element{constructor(){this.children=[];this.text='';}set textContent(v){this.text=String(v);this.children=[];}get textContent(){return this.text+this.children.map(n=>n.textContent).join('');}append(...n){this.children.push(...n);}replaceChildren(...n){this.text='';this.children=n;}setAttribute(){}click(){}}
function setup(mode='hosted'){
 const nodes=new Map(),get=id=>{if(!nodes.has(id))nodes.set(id,new Element());return nodes.get(id);},place={id:'a',lat:39,lon:-77};let requests=0,hold=false,release,fail=false,exported;
 const p={method:'2026-10-29.1',model:'NOAA HRRR',point:{lat:39,lon:-77},cell:{lat:39,lon:-77,projection_distance_m:0},issued_at:new Date(hrrrIssued).toISOString(),checked_at:new Date(hrrrNow).toISOString(),raw_unit:'K',height_m:2,temporal_semantics:'instantaneous',samples:[{at:new Date(hrrrNow).toISOString(),lead_hours:3,raw_kelvin:273.15}]};
 const window={WEATHER_CONFIG:{mode},WeatherPersonal:{context:()=>({place,scope_generation:0})},setInterval(){},setTimeout:fn=>fn(),URL:{createObjectURL(blob){exported=blob;return 'blob:test';},revokeObjectURL(){}}};
 const ui=mountHrrrTemperature({document:{getElementById:get,createElement:()=>new Element(),createElementNS:()=>new Element()},window,clock:()=>hrrrNow,fetcher:async()=>{requests++;if(hold)await new Promise(r=>release=r);if(fail)throw Error('source down');return {ok:true,json:async()=>p};}});
 return {get,ui,place,requests:()=>requests,hold(){hold=true;},release(){hold=false;release();},fail(){fail=true;},exported:()=>exported};
}
test('explicit temperature load renders run lead, missing hours, chart and raw evidence; failed refresh retains delayed output',async()=>{
 const s=setup();assert.equal(s.requests(),0);await s.ui.load();assert.match(s.get('hrrr-temp-status').textContent,/run/);assert.match(s.get('hrrr-temp-results').textContent,/1\/48/);assert.match(s.get('hrrr-temp-results').textContent,/Unknown/);
 s.get('hrrr-temp-export').onclick();const r=JSON.parse(await s.exported().text());assert.equal(r.rows[0].temperature_f,32);assert.equal(r.evidence.samples[0].raw_kelvin,273.15);
 s.fail();await s.ui.load();assert.match(s.get('hrrr-temp-status').textContent,/updates delayed/);assert.equal(s.get('hrrr-temp-export').disabled,false);
});
test('place and account changes discard late replies; unsupported locations and nonhosted mode do not fetch',async()=>{
 for(const next of [{id:'b',lat:40,lon:-77},null]){const s=setup();s.hold();const pending=s.ui.load();s.ui.updatePlace(next,1);s.release();await pending;assert.equal(s.get('hrrr-temp-export').disabled,true);assert.equal(s.get('hrrr-temp-results').children.length,0);}
 const same=setup();same.hold();const pending=same.ui.load();same.ui.updatePlace(same.place,2);same.release();await pending;assert.equal(same.get('hrrr-temp-export').disabled,true);
 const s=setup();s.ui.updatePlace({id:'alaska',lat:52,lon:-174});await s.ui.load();assert.equal(s.requests(),0);assert.match(s.get('hrrr-temp-status').textContent,/contiguous/);
 const direct=setup('direct');await direct.ui.load();assert.equal(direct.requests(),0);
});
