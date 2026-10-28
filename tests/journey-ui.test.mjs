// DOM and map doubles exercise interactions; rendered browser QA remains separate.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {mountJourney} from '../public/journey.js';
class Element{constructor(tag='div'){this.tag=tag;this.children=[];this.value='';this.attrs={};this.text='';this.classList={toggle(){}};}set textContent(v){this.text=String(v);this.children=[];}get textContent(){return this.text+this.children.map(n=>n.textContent).join('');}append(...n){this.children.push(...n);}replaceChildren(...n){this.text='';this.children=n;}setAttribute(k,v){this.attrs[k]=v;}click(){this.onclick?.();}}
const now=Date.parse('2026-10-28T20:00:00Z'),stamp=h=>new Date(now+h*3600000).toISOString();
const route={vertices:[{coordinate:[-77,39],elapsed:0,distance:0},{coordinate:[-76,40],elapsed:3600,distance:100000}],duration:3600,distance:100000,checked_at:stamp(0),revision:'route',timing_method:'No live traffic',waypoints:[{snap_distance:0},{snap_distance:1}],sampling:{samples:[{lat:39,lon:-77,elapsed:0,distance:0},{lat:40,lon:-76,elapsed:3600,distance:100000}],max_gap_km:100,max_gap_minutes:60,coarse:true}};
function setup(mode='hosted',targeted=false){
  const nodes=Object.fromEntries([...readFileSync(new URL('../public/index.html',import.meta.url),'utf8').matchAll(/id="([^"]+)"/g)].map(m=>[m[1],new Element()]));let broken=false,missing=false,held=false,release,exported,picker;const requests=[];
  const layer=()=>({addTo(){return this;},getBounds(){return {};},bindPopup(p){this.popup=p;return this;}}),map={removeLayer(){},invalidateSize(){},fitBounds(){}};
  const window={WEATHER_CONFIG:{mode},WeatherPersonal:{places:()=>[{id:'home',name:'<script>Home</script>',lat:39,lon:-77}],show(){window.WeatherJourney?.hide();}},WeatherMap:{zoneGeometry:()=>null,pick:fn=>picker=fn},setTimeout:fn=>fn(),URL:{createObjectURL(blob){exported=blob;return 'blob:test';},revokeObjectURL(){}}};
  const fetcher=async path=>{requests.push(path);if(path.startsWith('/api/journey/route')){if(held)await new Promise(r=>release=r);if(broken)throw Error('Router unavailable');return {ok:true,json:async()=>route};}if(path.startsWith('/api/zones/'))return {ok:true,json:async()=>({geometry:{type:'Polygon',coordinates:[[[-78,38],[-75,38],[-75,41],[-78,41],[-78,38]]]}})};if(path==='/api/alerts')return {ok:true,json:async()=>({features:[{id:'a',geometry:null,properties:{status:'Actual',affectedZones:targeted?['https://api.weather.gov/zones/forecast/ABC001']:[],onset:stamp(0),expires:stamp(10),event:'Wind Advisory'}}],collected_at:stamp(0)})};if(missing&&path.includes('lat=40'))throw Error('NWS unavailable');return {ok:true,json:async()=>({revision:'forecast',checked_at:stamp(0),metadata:{properties:{timeZone:'America/New_York',forecastZone:targeted?'https://api.weather.gov/zones/forecast/ABC001':null}},forecast:{properties:{periods:Array.from({length:10},(_,i)=>({startTime:stamp(i),endTime:stamp(i+1),temperature:50+i,temperatureUnit:'F',windSpeed:'10 mph',probabilityOfPrecipitation:{value:20},shortForecast:'<script>Clear</script>'}))}}})};};
  const mounted=mountJourney({document:{getElementById:id=>nodes[id],createElement:tag=>new Element(tag)},window,L:{map:()=>map,tileLayer:layer,layerGroup:layer,polyline:layer,circleMarker:layer},fetcher,clock:()=>now});
  for(const [id,v] of [['from-lat',39],['from-lon',-77],['to-lat',40],['to-lon',-76]])nodes['journey-'+id].value=String(v);
  return {nodes,mounted,window,requests,break:()=>broken=true,missing:()=>missing=true,hold:()=>held=true,release:()=>{held=false;release();},pick:(lat,lon)=>picker(lat,lon),exported:()=>exported};
}
test('journey renders three departure comparisons, timed sample rows and honest boundary coverage',async()=>{
  const s=setup();s.mounted.show();await s.mounted.run();assert.equal(s.nodes['journey-results'].hidden,false);assert.equal(s.nodes['journey-comparisons'].children.length,3);assert.equal(s.nodes['journey-weather-body'].children.length,2);assert.match(s.nodes['journey-weather-body'].textContent,/51°F/);assert.match(s.nodes['journey-coverage'].textContent,/1 active alerts/);assert.match(s.nodes['journey-route-note'].textContent,/coarser weather sampling/);
  s.nodes['journey-comparisons'].children[1].onclick();assert.match(s.nodes['journey-weather-body'].textContent,/53°F/);assert.equal(s.nodes['journey-comparisons'].children[1].attrs['aria-pressed'],'true');const summary=s.nodes['journey-weather-body'].children[0].children[6];assert.equal(summary.textContent,'<script>Clear</script>');assert.equal(summary.children.length,0);
});
test('partial weather failures remain missing and cannot improve a departure comparison',async()=>{
  const s=setup();s.missing();await s.mounted.run();assert.match(s.nodes['journey-comparisons'].textContent,/1\/2 complete/);assert.match(s.nodes['journey-weather-body'].textContent,/Unknown/);assert.match(s.nodes['journey-coverage'].textContent,/Missing coverage/);
});
test('failed rerun clears the old result and export rather than presenting an unrelated route',async()=>{
  const s=setup();await s.mounted.run();s.break();await s.mounted.run();assert.equal(s.nodes['journey-results'].hidden,true);assert.equal(s.nodes['journey-export'].disabled,true);assert.match(s.nodes['journey-status'].textContent,/Router unavailable/);
});
test('late canceled route cannot replace a newer request or start more weather fetches',async()=>{
  const s=setup();s.hold();const first=s.mounted.run();await new Promise(r=>setTimeout(r,0));s.release();s.nodes['journey-departure'].value='not-a-date';await s.mounted.run();await first;assert.equal(s.nodes['journey-results'].hidden,true);assert.equal(s.requests.filter(p=>p.startsWith('/api/forecast')).length,0);
});
test('saved-place and map selection fill coordinates; export retains the selected departure and source revisions',async()=>{
  const s=setup();s.mounted.show();s.nodes['journey-from-place'].value='home';s.nodes['journey-from-place'].onchange();assert.equal(s.nodes['journey-from-lat'].value,39);s.nodes['journey-to-map'].onclick();s.pick(40,-76);assert.equal(s.nodes['journey-to-lat'].value,'40.0000');await s.mounted.run();s.nodes['journey-comparisons'].children[2].onclick();s.nodes['journey-export'].onclick();const data=JSON.parse(await s.exported().text());assert.equal(data.selected_departure,2);assert.equal(data.route.revision,'route');assert.equal(data.departures[2].rows[0].forecast_revision,'forecast');
});
test('unsupported editions do not expose a broken routing control',()=>{assert.equal(setup('direct').nodes['nav-journey'].hidden,true);});

test('route-relevant alert zones load independently and retain official-zone attribution',async()=>{
  const s=setup('hosted',true);await s.mounted.run();assert.equal(s.requests.filter(p=>p==='/api/zones/forecast/ABC001').length,1);assert.match(s.nodes['journey-alerts'].textContent,/Wind Advisory/);assert.match(s.nodes['journey-alerts'].textContent,/Official zone coverage/);assert.doesNotMatch(s.nodes['journey-coverage'].textContent,/incomplete/);
});
