import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mountForecastStability} from '../public/forecast-stability.js';
class Element{
  constructor(tag='div'){this.tag=tag;this.children=[];this.text='';this.value='';}
  set textContent(v){this.text=String(v);this.children=[];}get textContent(){return this.text+this.children.map(n=>n.textContent).join('');}
  append(...n){this.children.push(...n);}replaceChildren(...n){this.text='';this.children=n;}click(){}
}
const place={id:'a',lat:39,lon:-77},at='2026-11-01T05:00:00Z';
function setup(mode='hosted'){
  const nodes=new Map(),get=id=>{if(!nodes.has(id))nodes.set(id,new Element());return nodes.get(id);};get('stability-hours').value='24';
  const requests=[];let fail=false,held=false,release,exported;
  const payload=hours=>({method:'2026-10-29.2',point:'39.0000,-77.0000',comparison_mode:hours==='previous'?'previous_version':'cutoff',lookback_hours:hours==='previous'?null:Number(hours),search_since:at,collection_gap_hours:18.5,status:'compared',evaluated_at:at,earlier_cutoff:hours==='previous'?null:at,time_zone:'America/New_York',interpretation:'Changes are not accuracy.',same_revision:false,current_delayed:false,source_issue_moved_back:false,
    evidence:{current:{checked_at:at,issued_at:null,revision:'<img src=x>'},earlier:null},summary:{temperature_paired_hours:1,rain_paired_hours:1,largest_absolute_temperature_change_f:2,largest_absolute_rain_change_percentage_points:10},
    rows:[{at,earlier:{temperature_f:50,rain_percent:20},current:{temperature_f:52,rain_percent:30},temperature_change_f:2,rain_change_percentage_points:10}]});
  const window={WEATHER_CONFIG:{mode},WeatherPersonal:{context:()=>({place,scope_generation:0})},URL:{createObjectURL(blob){exported=blob;return 'blob:test';},revokeObjectURL(){}},setTimeout:fn=>fn()};
  const mounted=mountForecastStability({document:{getElementById:get,createElement:t=>new Element(t)},window,fetcher:async path=>{requests.push(path);if(held)await new Promise(r=>release=r);if(fail)throw Error('Archive failed');return {ok:true,json:async()=>payload(new URL(path,'https://example.test').searchParams.get('hours'))};}});
  return {get,mounted,requests,hold(){held=true;},release(){held=false;release();},fail(){fail=true;},exported:()=>exported};
}
test('forecast changes load explicitly, render source text safely and export the fixed comparison',async()=>{
  const s=setup();assert.equal(s.requests.length,0);await s.mounted.run();assert.match(s.requests[0],/hours=24/);
  assert.match(s.get('stability-results').textContent,/1\/48 temperature/);assert.match(s.get('stability-results').textContent,/percentage points/);
  const all=n=>[n,...n.children.flatMap(all)],p=all(s.get('stability-results')).find(n=>n.tag==='p'&&n.text.includes('<img'));assert.ok(p);assert.equal(p.children.length,0);
  s.get('stability-export').onclick();const result=JSON.parse(await s.exported().text());assert.equal(result.evaluated_at,at);assert.equal(result.rows[0].temperature_change_f,2);
});
test('previous-version choice renders actual collection spacing and exports its distinct selection method',async()=>{
  const s=setup();s.get('stability-hours').value='previous';s.get('stability-hours').onchange();await s.mounted.run();
  assert.match(s.requests[0],/hours=previous/);assert.match(s.get('stability-results').textContent,/18.5 hours apart/);
  assert.match(s.get('stability-results').textContent,/not a fixed forecast-update interval/);assert.doesNotMatch(s.get('stability-results').textContent,/Earlier cutoff:/);
  s.get('stability-export').onclick();const exported=JSON.parse(await s.exported().text());assert.equal(exported.comparison_mode,'previous_version');assert.equal(exported.lookback_hours,null);
  s.get('stability-hours').value='24';s.get('stability-hours').onchange();assert.equal(s.get('stability-export').disabled,true);
});
test('changed windows and account scopes invalidate pending comparisons even at identical coordinates',async()=>{
  for(const change of [s=>{s.get('stability-hours').value='6';s.get('stability-hours').onchange();},s=>s.mounted.updatePlace({...place},1),s=>s.mounted.updatePlace({...place,id:'b'},0),s=>s.mounted.updatePlace(null,0)]){
    const s=setup();s.hold();const pending=s.mounted.run();change(s);s.release();await pending;assert.equal(s.get('stability-export').disabled,true);assert.equal(s.get('stability-results').children.length,0);
  }
});
test('failed reruns clear prior exports and unsupported editions do not start requests',async()=>{
  const s=setup();await s.mounted.run();s.fail();await s.mounted.run();assert.equal(s.get('stability-export').disabled,true);assert.match(s.get('stability-status').textContent,/Archive failed/);assert.equal(s.get('stability-results').children.length,0);
  const direct=setup('direct');await direct.mounted.run();assert.equal(direct.requests.length,0);assert.equal(direct.get('stability-controls').hidden,true);
});
