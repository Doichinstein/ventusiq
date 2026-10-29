import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {evaluateCompound,RULESET_VERSION} from '../public/compound-core.mjs';
const core=createRequire(import.meta.url)('./load-core.cjs');
const now=Date.parse('2026-10-28T20:00:00Z'),H=3600000,stamp=h=>new Date(now+h*H).toISOString(),zone='https://api.weather.gov/zones/forecast/ABC001';
const polygon={type:'Polygon',coordinates:[[[-1,-1],[1,-1],[1,1],[-1,1],[-1,-1]]]};
const alert=(id,event,start=-2,end=4,geometry=polygon)=>({id:'https://api.weather.gov/alerts/'+id,type:'Feature',geometry,properties:{id,event,status:'Actual',messageType:'Alert',onset:stamp(start),expires:stamp(end),sent:stamp(-3),affectedZones:[zone],instruction:'Official instructions.'}});
const monitor=(id,aqi=151,lon=0,at=-1)=>({id,type:'Feature',geometry:{type:'Point',coordinates:[lon,0]},properties:{name:'Monitor '+id,aqi,pm25:56,observed_at:stamp(at)}});
function input(features=[]){return {core,now,place:{name:'Here',lat:0,lon:0},alerts:{collected_at:stamp(0),revision:'alerts-rev',features},air:{checked_at:stamp(0),revision:'air-rev',features:[monitor('one')]},forecast:{checked_at:stamp(0),issued_at:stamp(-1),revision:'forecast-rev',metadata:{properties:{forecastZone:zone}},source_url:'https://api.weather.gov/gridpoints/ABC/1,1/forecast/hourly',forecast:{properties:{periods:Array.from({length:50},(_,i)=>({startTime:stamp(i),endTime:stamp(i+1),temperature:65,temperatureUnit:'F',windSpeed:'10 mph',probabilityOfPrecipitation:{value:10,unitCode:'wmoUnit:percent'},shortForecast:'Clear'}))}}}};}
const rule=(result,id)=>result.rules.find(r=>r.id===id);
test('official overlap uses the intersection in space and time and carries every premise revision',()=>{
  const result=evaluateCompound(input([alert('heat','Heat Advisory',-1,5),alert('air','Air Quality Alert',2,6)])),found=rule(result,'heat-air-alerts');assert.equal(found.status,'matched');assert.equal(found.windows[0].start,stamp(2));assert.equal(found.windows[0].end,stamp(5));assert.equal(found.windows[0].segments[0].premises.length,2);assert.equal(result.evidence[0].revision,'alerts-rev');assert.equal(result.ruleset_version,RULESET_VERSION);
});
test('non-overlapping and merely touching validity windows do not establish a combination',()=>{
  for(const start of [4,5]){const result=evaluateCompound(input([alert('heat','Heat Advisory',0,4),alert('air','Air Quality Alert',start,8)]));assert.equal(rule(result,'heat-air-alerts').status,'not_detected');}
});
test('an explicit polygon overrides zone membership, including holes and outside points',()=>{
  const donut={...polygon,coordinates:[...polygon.coordinates,[[[-0.5,-0.5],[0.5,-0.5],[0.5,0.5],[-0.5,0.5],[-0.5,-0.5]]][0]]};
  const result=evaluateCompound(input([alert('heat','Heat Advisory'),alert('air','Air Quality Alert',0,4,donut)]));assert.equal(rule(result,'heat-air-alerts').status,'not_detected');
  const byZone=evaluateCompound(input([alert('heat','Heat Advisory',0,4,null),alert('air','Air Quality Alert',0,4,null)]));assert.equal(rule(byZone,'heat-air-alerts').status,'matched');assert.equal(byZone.evidence[0].coverage,'Official zone coverage');
});
test('missing zone lookup or invalid validity remains unknown, while a valid polygon can still prove a positive overlap',()=>{
  const data=input([alert('heat','Heat Advisory',0,4,null),alert('air','Air Quality Alert',0,4,null)]);delete data.forecast.metadata;assert.equal(rule(evaluateCompound(data),'heat-air-alerts').status,'unknown');
  data.alerts.features=[alert('heat','Heat Advisory'),alert('air','Air Quality Alert')];const partial=rule(evaluateCompound(data),'heat-air-alerts');assert.equal(partial.status,'matched');assert.equal(partial.coverage_complete,false);
  data.forecast.metadata={properties:{forecastZone:zone}};data.alerts.features[0].properties.onset='bad';assert.equal(rule(evaluateCompound(data),'heat-air-alerts').status,'unknown');
});
test('stale sources suppress positives and cannot become no-hazard claims',()=>{
  const data=input([alert('heat','Heat Advisory'),alert('air','Air Quality Alert')]);data.alerts.stale=true;data.forecast.stale=true;data.air.stale=true;const result=evaluateCompound(data);assert.ok(result.rules.every(r=>r.status==='unknown'));assert.equal(result.evidence.length,0);
});
test('cancelled, test, duplicate and unrelated alerts do not generate extra combinations',()=>{
  const heat=alert('heat','Heat Advisory'),air=alert('air','Air Quality Alert');const testAlert=alert('test','Air Quality Alert');testAlert.properties.status='Test';const cancel=alert('cancel','Air Quality Alert');cancel.properties.messageType='Cancel';const result=evaluateCompound(input([heat,heat,air,testAlert,cancel,alert('wind','Wind Advisory')]));assert.equal(rule(result,'heat-air-alerts').windows[0].segments.length,1);assert.equal(rule(result,'winter-wind').status,'not_detected');
});
test('winter/wind and inland/coastal rules require distinct named alert families',()=>{
  const result=evaluateCompound(input([alert('winter','Winter Storm Warning'),alert('wind','High Wind Warning'),alert('inland','Flash Flood Warning'),alert('coast','Coastal Flood Warning')]));assert.equal(rule(result,'winter-wind').status,'matched');assert.equal(rule(result,'inland-coastal-flood').status,'matched');const alone=evaluateCompound(input([alert('coast','Coastal Flood Warning')]));assert.equal(rule(alone,'inland-coastal-flood').status,'not_detected');
});
test('observed heat/particles uses the closest recent monitor, not the most alarming one, and never projects an observation forward',()=>{
  const data=input([alert('heat','Heat Advisory')]);data.air.features=[monitor('near',50),monitor('far',200,0.1)];assert.equal(rule(evaluateCompound(data),'heat-pm25').status,'not_detected');data.air.features[0].properties.aqi=101;const result=evaluateCompound(data),found=rule(result,'heat-pm25');assert.equal(found.status,'matched');assert.equal(found.windows[0].start,stamp(-1));assert.equal(found.windows[0].end,stamp(-1));assert.equal(result.evidence.find(e=>e.kind==='observation').values.aqi,101);
});
test('old, future, distant and pre-heat measurements cannot establish observed overlap',()=>{
  for(const feature of [monitor('old',151,0,-4),monitor('future',151,0,0.1),monitor('far',151,1,-1)]){const data=input([alert('heat','Heat Advisory')]);data.air.features=[feature];assert.equal(rule(evaluateCompound(data),'heat-pm25').status,'unknown');}
  const data=input([alert('heat','Heat Advisory',-0.5,3)]);assert.equal(rule(evaluateCompound(data),'heat-pm25').status,'not_detected');data.alerts.features=[alert('heat','Heat Advisory',1,3)];assert.equal(rule(evaluateCompound(data),'heat-pm25').status,'not_detected');
});
test('hourly rules merge adjacent matches, preserve gaps and retain separate same-hour premises',()=>{
  const data=input(),periods=data.forecast.forecast.properties.periods;for(const i of [0,1,3]){periods[i].temperature=0;periods[i].temperatureUnit='C';periods[i].windSpeed='15 to 25 mph';periods[i].probabilityOfPrecipitation.value=60;}
  const result=evaluateCompound(data),wind=rule(result,'precip-wind'),cold=rule(result,'freezing-precip');assert.equal(wind.windows.length,2);assert.equal(wind.windows[0].end,stamp(2));assert.equal(wind.windows[0].segments.length,2);assert.equal(cold.windows.length,2);assert.equal(result.evidence[0].values.temperature_f,32);
});
test('missing hourly inputs are unknown, not zero probability, and mismatched hours are not combined',()=>{
  const data=input(),p=data.forecast.forecast.properties.periods;p[0].temperature=20;p[1].probabilityOfPrecipitation.value=90;assert.equal(rule(evaluateCompound(data),'freezing-precip').status,'not_detected');p[0].probabilityOfPrecipitation.value=null;assert.equal(rule(evaluateCompound(data),'freezing-precip').status,'unknown');assert.equal(rule(evaluateCompound(data),'precip-wind').coverage_complete,false);
});
test('missing or future forecast issue times suppress hourly findings, and no combined probability is returned',()=>{
  const data=input();data.forecast.issued_at=stamp(2);const result=evaluateCompound(data);assert.equal(rule(result,'precip-wind').status,'unknown');assert.equal(Object.hasOwn(result,'risk_score'),false);assert.equal(Object.hasOwn(result,'probability'),false);assert.match(result.limitations,/not joint probabilities/);
});
function unlocated(event){const f=alert('unlocated',event,0,4,null);f.properties.affectedZones=[];return f;}
test('unresolved geography on a known unrelated alert does not contaminate compound-rule coverage',()=>{
  const r=evaluateCompound(input([unlocated('Law Enforcement Warning')]));assert.equal(r.sources.alerts.unresolved_local_coverage,1);assert.equal(r.sources.alerts.unresolved_local_alerts[0].event,'Law Enforcement Warning');
  for(const id of ['heat-air-alerts','heat-pm25','winter-wind','inland-coastal-flood']){assert.equal(rule(r,id).status,'not_detected');assert.deepEqual(rule(r,id).unresolved_alerts,[]);}
});
test('unresolved relevant families keep exactly their dependent rules unknown',()=>{
  for(const [event,affected] of [['Heat Advisory',['heat-air-alerts','heat-pm25']],['Air Quality Alert',['heat-air-alerts']],['High Wind Warning',['winter-wind']],['Winter Storm Warning',['winter-wind']],['Flood Warning',['inland-coastal-flood']],['Coastal Flood Warning',['inland-coastal-flood']]]){
    const r=evaluateCompound(input([unlocated(event)]));for(const id of ['heat-air-alerts','heat-pm25','winter-wind','inland-coastal-flood']){
      const result=rule(r,id);assert.equal(result.status,affected.includes(id)?'unknown':'not_detected',event+' / '+id);assert.equal(result.unresolved_alerts.length,affected.includes(id)?1:0);
    }
  }
});
test('unclassified unresolved alerts remain unknown for every alert-dependent rule',()=>{
  for(const event of [undefined,null,'']){const r=evaluateCompound(input([unlocated(event)]));for(const id of ['heat-air-alerts','heat-pm25','winter-wind','inland-coastal-flood'])assert.equal(rule(r,id).status,'unknown');assert.equal(rule(r,'precip-wind').status,'not_detected');}
});
test('a supported positive overlap remains complete with unrelated missing geography, partial with a relevant one',()=>{
  const known=[alert('heat','Heat Advisory'),alert('air','Air Quality Alert')];
  const complete=rule(evaluateCompound(input([...known,unlocated('Law Enforcement Warning')])),'heat-air-alerts');assert.equal(complete.status,'matched');assert.equal(complete.coverage_complete,true);
  const partial=rule(evaluateCompound(input([...known,unlocated('Heat Advisory')])),'heat-air-alerts');assert.equal(partial.status,'matched');assert.equal(partial.coverage_complete,false);assert.equal(partial.unresolved_alerts.length,1);
});
