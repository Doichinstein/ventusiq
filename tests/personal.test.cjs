// User-flow tests with DOM doubles. These do not assert visual rendering.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const core=require('../dist/weather-core.js');
class Element{
  constructor(tag='div'){this.tagName=tag.toUpperCase();this.children=[];this.value='';this.hidden=false;this.attributes={};this.text='';this.classList={toggle(){}};}
  set textContent(v){this.text=String(v??'');this.children=[];}
  get textContent(){return this.text+this.children.map(c=>c.textContent).join('');}
  append(...v){this.children.push(...v);}
  replaceChildren(...v){this.text='';this.children=v;}
  setAttribute(k,v){this.attributes[k]=v;}
  focus(){}
}
const start=Math.floor(Date.now()/3600000)*3600000;
function data(temp=60){return {properties:{updateTime:new Date(start).toISOString(),periods:Array.from({length:48},(_,i)=>({startTime:new Date(start+i*3600000).toISOString(),endTime:new Date(start+(i+1)*3600000).toISOString(),temperature:temp,temperatureUnit:'F',windSpeed:'5 mph',probabilityOfPrecipitation:{value:0},shortForecast:'Sunny'}))}};}
async function setup(saved=null){
  const ids=[...fs.readFileSync(require.resolve('../dist/index.html'),'utf8').matchAll(/id="([^"]+)"/g)].map(x=>x[1]);
  const els=Object.fromEntries(ids.map(id=>[id,new Element()]));
  let value=saved,payload=data(),failure=false,identifier=0,clipboard=null,delay=false;
  const pending=[],clock=[Date.now()];
  class Clock extends Date {constructor(...args){super(...(args.length?args:[clock[0]]));}static now(){return clock[0];}}
  const timers=[],requests=[];
  const live={features:[],collected_at:new Date().toISOString()};
  const window={WeatherCore:core,WEATHER_CONFIG:{mode:'direct'},WeatherMap:{live:()=>live,show(){},pick(fn){this.callback=fn;}}};
  const context=vm.createContext({window,document:{getElementById:id=>els[id],createElement:t=>new Element(t)},
    localStorage:{getItem:()=>value,setItem:(_,v)=>{value=v;}},crypto:{randomUUID:()=>String(++identifier)},
    navigator:{clipboard:{writeText:async v=>{clipboard=v;}}},location:{origin:'https://weather.test',pathname:'/',hash:''},URL,URLSearchParams,AbortSignal,
    setInterval:fn=>timers.push(fn),console,Date:Clock,
    fetch:async url=>{requests.push(url);if(failure)throw new Error('Source outage');return {ok:true,json:async()=>url.includes('/points/')?{properties:{forecastHourly:'https://api.weather.gov/gridpoints/MTR/1,1/forecast/hourly',timeZone:'America/Los_Angeles',county:'https://api.weather.gov/zones/county/ABC001'}}:delay?new Promise(resolve=>pending.push(resolve)):payload};}
  });
  vm.runInContext(fs.readFileSync(require.resolve('../dist/personal.js'),'utf8'),context);
  const settle=async()=>{for(let i=0;i<10;i++)await new Promise(r=>setImmediate(r));};
  await settle();
  const add=async(name='Home',lat='37.7',lon='-122.4')=>{els['place-name'].value=name;els['place-lat'].value=lat;els['place-lon'].value=lon;els['place-form'].onsubmit({preventDefault(){}});await settle();};
  return {els,add,settle,window,live,requests,timers,saved:()=>value,clipboard:()=>clipboard,fail:()=>{failure=true;},setData:d=>{payload=d;},delay:()=>{delay=true;},release:(i,temp)=>pending[i](data(temp)),advance:ms=>{clock[0]+=ms;}};
}
test('save a place, load source shape, show windows and restore on reload',async()=>{
  const app=await setup();await app.add();
  assert.equal(app.els['place-title'].textContent,'Home');
  assert.equal(app.els['personal-workspace'].hidden,false);
  assert.match(app.els['place-outlook'].textContent,/60–60°F/);
  assert.match(app.els['plan-results'].textContent,/Earliest windows/);
  assert.match(app.els['place-alerts'].textContent,/No matching alerts/);
  assert.equal(app.requests.length,2);
  const next=await setup(app.saved());next.els['nav-personal'].onclick();
  assert.equal(next.els['place-title'].textContent,'Home');
  assert.equal(next.els['place-list'].children.length,1);
});
test('place removal persists and does not leave the old briefing visible',async()=>{
  const app=await setup();await app.add();app.els['remove-place'].onclick();
  assert.equal(app.els['place-content'].hidden,true);
  assert.equal(JSON.parse(app.saved()).places.length,0);
});
test('missing source blocks planning and distinguishes unknown coverage from no alerts',async()=>{
  const app=await setup();app.fail();await app.add();
  assert.match(app.els['forecast-status'].textContent,/Source outage/);
  assert.match(app.els['plan-results'].textContent,/needs an hourly forecast/);
  assert.match(app.els['place-alerts'].textContent,/zone coverage is unknown/);
});
test('share briefing encodes text and coordinates without markup execution',async()=>{
  const app=await setup();await app.add('Home <script>');await app.els['share-place'].onclick();
  const url=new URL(app.clipboard()),params=new URLSearchParams(url.hash.slice(1));
  assert.equal(params.get('place'),'Home <script>');assert.equal(params.get('lat'),'37.7000');
  assert.equal(app.els['place-title'].children.length,0);
});
test('new geographically relevant alert appears once as a meaningful update',async()=>{
  const app=await setup();await app.add();
  app.live.features=[{id:'https://api.weather.gov/alerts/a',geometry:null,properties:{status:'Actual',event:'Wind Advisory',severity:'Moderate',affectedZones:['https://api.weather.gov/zones/county/ABC001'],expires:'2099-01-01'}}];
  app.window.WeatherPersonal.alertsUpdated();
  assert.match(app.els['place-updates'].textContent,/New for this place: Wind Advisory/);
  assert.match(app.els['plan-results'].textContent,/relevant alerts/);
  app.window.WeatherPersonal.alertsUpdated();assert.equal(app.els['place-updates'].children.length,1);
});
test('map selection fills coordinates without silently saving a place',async()=>{
  const app=await setup();app.els['pick-on-map'].onclick();app.window.WeatherMap.callback(40.123456,-100.987654);
  assert.equal(app.els['place-lat'].value,'40.1235');assert.equal(app.els['place-lon'].value,'-100.9877');
  assert.equal(app.els['place-list'].children.length,0);
});
test('late forecast for previous place cannot overwrite the selected place',async()=>{
  const app=await setup();app.delay();await app.add('Home','37','-122');await app.add('Work','38','-121');
  app.release(1,80);await app.settle();assert.equal(app.els['place-title'].textContent,'Work');
  assert.match(app.els['place-outlook'].textContent,/80–80°F/);
  app.release(0,40);await app.settle();assert.equal(app.els['place-title'].textContent,'Work');
  assert.match(app.els['place-outlook'].textContent,/80–80°F/);
});
test('failed refresh retains hours but pauses favorable planning recommendations',async()=>{
  const app=await setup();await app.add();app.advance(700000);app.fail();app.timers[0]();await app.settle();
  assert.match(app.els['forecast-status'].textContent,/Updates delayed/);
  assert.match(app.els['place-outlook'].textContent,/60–60°F/);
  assert.match(app.els['plan-results'].textContent,/Planning is paused/);
});
test('corrupt saved places do not prevent opening the workspace',async()=>{
  const app=await setup(JSON.stringify({version:1,places:[null,{}],preferences:null}));
  app.els['nav-personal'].onclick();assert.equal(app.els['place-empty'].hidden,false);await app.add();
  assert.equal(app.els['place-title'].textContent,'Home');
});
