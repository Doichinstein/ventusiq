const {test}=require('node:test');
const assert=require('node:assert/strict');
const core=require('./load-core.cjs');
const start=Date.parse('2026-10-28T12:00:00Z');
const polygon={type:'Polygon',coordinates:[[[-123,37],[-121,37],[-121,39],[-123,39],[-123,37]],[[-122.5,37.5],[-121.5,37.5],[-121.5,38.5],[-122.5,38.5],[-122.5,37.5]]]};
const forecast=(changes={})=>({forecast:{properties:{periods:Array.from({length:5},(_,i)=>({startTime:new Date(start+i*3600000).toISOString(),endTime:new Date(start+(i+1)*3600000).toISOString(),temperature:60,temperatureUnit:'F',windSpeed:'5 to 10 mph',probabilityOfPrecipitation:{value:10},...changes}))}}});
const prefs={duration:2,minTemp:40,maxTemp:85,wind:15,rain:30};

test('place matching respects polygon holes, boundaries, and date line',()=>{
  assert.equal(core.contains(polygon,37.25,-122),true);
  assert.equal(core.contains(polygon,38,-122),false);
  assert.equal(core.contains(polygon,37,-122),true);
  const dateline={type:'Polygon',coordinates:[[[179,10],[-179,10],[-179,12],[179,12],[179,10]]]};
  assert.equal(core.contains(dateline,11,179.5),true);
  assert.equal(core.contains(dateline,11,-179.5),true);
  assert.equal(core.contains(dateline,11,0),false);
});
test('official polygon takes precedence over broader county membership',()=>{
  const metadata={properties:{county:'county-one'}};
  const a={id:'a',geometry:polygon,properties:{status:'Actual',affectedZones:['county-one'],expires:'2099-01-01'}};
  assert.equal(core.relevantAlerts([a],{lat:38,lon:-122},metadata,start).length,0);
  a.geometry=null;
  assert.equal(core.relevantAlerts([a],{lat:38,lon:-122},metadata,start)[0].coverage,'Official zone coverage');
  assert.equal(core.relevantAlerts([a],{lat:38,lon:-122},null,start).length,0);
});
test('windows cover full duration and obey every user limit',()=>{
  const result=core.plan(forecast(),prefs,start);
  assert.equal(result.filter(w=>w.fits).length,4);
  assert.equal(result[0].start,start);
  assert.equal(result[0].end,start+2*3600000);
  assert.equal(core.plan(forecast({windSpeed:'20 mph'}),prefs,start).some(w=>w.fits),false);
  assert.throws(()=>core.plan(forecast(),{...prefs,minTemp:70,maxTemp:60},start),/Check the planning/);
});
test('unknown rain and missing hours never become a favorable recommendation',()=>{
  assert.equal(core.plan(forecast({probabilityOfPrecipitation:{value:null}}),prefs,start).some(w=>w.fits),false);
  const gap=forecast();gap.forecast.properties.periods.splice(1,1);
  assert.equal(core.plan(gap,prefs,start).find(w=>w.start===start).fits,false);
  const zero=forecast({probabilityOfPrecipitation:{value:0}});
  assert.equal(core.plan(zero,prefs,start)[0].rain,0);
});
test('metric forecasts convert consistently and range wind uses upper bound',()=>{
  assert.equal(core.hours(forecast({temperature:0,temperatureUnit:'C'}))[0].temperature,32);
  assert.equal(core.windMph('10 to 20 mph'),20);
  assert.equal(core.windMph('Calm'),0);
  assert.equal(core.windMph('unknown'),null);
});
test('reference-linked updates are not duplicated as new alerts',()=>{
  const a={id:'one',properties:{id:'cap-one',event:'Wind Advisory',severity:'Moderate',onset:'2026-10-28T18:00:00Z'}};
  const b={id:'two',properties:{...a.properties,id:'cap-two',references:[{identifier:'cap-one'}],onset:'2026-10-28T16:00:00Z'}};
  assert.deepEqual(core.alertChanges(null,[a]),[]);
  const changes=core.alertChanges([a],[b]);
  assert.equal(changes.length,1);assert.equal(changes[0].kind,'updated');
  assert.equal(changes[0].fields[0].before,a.properties.onset);
  assert.equal(core.alertChanges([a],[])[0].kind,'left');
});
test('forecast changes compare the same valid hour, not a sliding array index',()=>{
  const previous=forecast(),next=forecast({temperature:70});
  next.forecast.properties.periods.shift();
  const changes=core.forecastChanges(previous,next,start);
  assert.equal(changes[0].at,start+3600000);
  assert.equal(changes[0].before,60);assert.equal(changes[0].after,70);
  assert.equal(core.forecastChanges(previous,forecast({temperature:61}),start).length,0);
});
