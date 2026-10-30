import {normalizeRoadwork} from '../public/roadwork-core.mjs';
import {roadRaw} from './roadwork-fixture.mjs';
import {smokeFixture} from './smoke-fixture.mjs';
// DOM and map doubles exercise interactions; rendered browser QA remains separate.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {mountJourney} from '../public/journey.js';
import {normalizeRoute,sampleRoute} from '../public/journey-core.mjs';
import {normalizePinnedRoute} from '../lib/pinned-route.mjs';
class Element{constructor(tag='div'){this.tag=tag;this.children=[];this.value='';this.attrs={};this.text='';this.classList={toggle(){}};}set textContent(v){this.text=String(v);this.children=[];}get textContent(){return this.text+this.children.map(n=>n.textContent).join('');}append(...n){this.children.push(...n);}replaceChildren(...n){this.text='';this.children=n;}setAttribute(k,v){this.attrs[k]=v;}click(){this.onclick?.();}}
const now=Date.parse('2026-10-28T20:00:00Z'),stamp=h=>new Date(now+h*3600000).toISOString();
const route={vertices:[{coordinate:[-77,39],elapsed:0,distance:0},{coordinate:[-76,40],elapsed:3600,distance:100000}],duration:3600,distance:100000,checked_at:stamp(0),revision:'route',timing_method:'No live traffic',waypoints:[{snap_distance:0},{snap_distance:1}],sampling:{samples:[{lat:39,lon:-77,elapsed:0,distance:0},{lat:40,lon:-76,elapsed:3600,distance:100000}],max_gap_km:100,max_gap_minutes:60,coarse:true}};
test('pinned native route renders provider and graph evidence and survives Journey export',async()=>{
  const probe=JSON.parse(readFileSync(new URL('../docs/evidence/route-network-probe-2026-10-30.json',import.meta.url))),points=probe.requests.route.locations.map(p=>[p.lon,p.lat]);
  const base=normalizePinnedRoute({schema:'ventusiq-pinned-route/1',graph_sha256:probe.graph_sha256,engine_version:'3.9.1',checked_at:probe.checked_at,requested_waypoints:points,legs:[probe]},probe.graph_sha256,points,Date.parse(probe.checked_at));
  const s=setup('hosted',false,{...base,checked_at:stamp(0),revision:'pinned-test'});await s.mounted.run();
  assert.equal(s.nodes['journey-comparisons'].children.length,3);assert.equal(s.nodes['journey-routing-provider'].textContent,'Pinned Valhalla / OpenStreetMap');
  assert.match(s.nodes['journey-roads-list'].textContent,new RegExp(probe.graph_sha256));assert.match(s.nodes['journey-route-note'].textContent,/Rounded native/);
  s.nodes['journey-export'].onclick();const saved=JSON.parse(await s.exported().text());assert.deepEqual(saved.route.network_references.legs[0].probe,probe);assert.equal(saved.route.network_references.closure_attribution_verified,false);
});
function setup(mode='hosted',targeted=false,routeOverride=route){
  const nodes=Object.fromEntries([...readFileSync(new URL('../public/index.html',import.meta.url),'utf8').matchAll(/id="([^"]+)"/g)].map(m=>[m[1],new Element()]));let roadworkBroken=false,smokeBroken=false,gustBroken=false,broken=false,missing=false,held=false,release,exported,picker;const requests=[];
  const attached=new Set();let fitted=0,createdMaps=0;
  const layer=()=>({addTo(target){if(target===map)attached.add(this);return this;},getBounds(){return {};},bindPopup(p){this.popup=p;return this;}}),map={removeLayer(l){attached.delete(l);},invalidateSize(){},fitBounds(){fitted++;}};
  const window={WEATHER_CONFIG:{mode},WeatherPersonal:{places:()=>[{id:'home',name:'<script>Home</script>',lat:39,lon:-77}],show(){window.WeatherJourney?.hide();}},WeatherMap:{instance:map,zoneGeometry:()=>null,pick:fn=>picker=fn},setTimeout:fn=>fn(),URL:{createObjectURL(blob){exported=blob;return 'blob:test';},revokeObjectURL(){}}};
  const fetcher=async path=>{requests.push(path);if(path.startsWith('/api/journey/route')){if(held)await new Promise(r=>release=r);if(broken)throw Error('Router unavailable');return {ok:true,json:async()=>routeOverride};}if(path.startsWith('/api/journey/roadwork')){if(roadworkBroken)throw Error('Road agency unavailable');const raw=roadRaw();raw.feed_info.update_date=stamp(0);raw.features[0].properties.start_date=stamp(0);raw.features[0].properties.end_date=stamp(2);return {ok:true,json:async()=>({...normalizeRoadwork(raw,'md'),checked_at:stamp(0),revision:'agency-revision'})};}if(path.startsWith('/api/smoke/')){if(smokeBroken)throw Error('Smoke source unavailable');if(path==='/api/smoke/catalog')return {ok:true,json:async()=>({})};const u=new URL(path,'https://example.test'),p=smokeFixture(now,{lat:Number(u.searchParams.get('lat')),lon:Number(u.searchParams.get('lon'))});return {ok:true,json:async()=>p};}if(path.startsWith('/api/planning/grid')){if(gustBroken)throw Error('Gust source unavailable');return {ok:true,json:async()=>({revision:'gust-revision',checked_at:stamp(0),issued_at:stamp(0),source_url:'https://api.weather.gov/gridpoints/LWX/1,1',grid:{id:'https://api.weather.gov/gridpoints/LWX/1,1',properties:{gridId:'LWX',gridX:1,gridY:1,updateTime:stamp(0),windGust:{uom:'wmoUnit:mi_h-1',values:Array.from({length:10},(_,i)=>({validTime:stamp(i)+'/PT1H',value:20+i*5}))}}}})};}if(path.startsWith('/api/zones/'))return {ok:true,json:async()=>({geometry:{type:'Polygon',coordinates:[[[-78,38],[-75,38],[-75,41],[-78,41],[-78,38]]]}})};if(path==='/api/alerts')return {ok:true,json:async()=>({features:[{id:'a',geometry:null,properties:{status:'Actual',affectedZones:targeted?['https://api.weather.gov/zones/forecast/ABC001']:[],onset:stamp(0),expires:stamp(10),event:'Wind Advisory'}}],collected_at:stamp(0)})};if(missing&&path.includes('lat=40'))throw Error('NWS unavailable');return {ok:true,json:async()=>({revision:'forecast',checked_at:stamp(0),metadata:{properties:{timeZone:'America/New_York',forecastGridData:'https://api.weather.gov/gridpoints/LWX/1,1',forecastZone:targeted?'https://api.weather.gov/zones/forecast/ABC001':null}},forecast:{properties:{periods:Array.from({length:10},(_,i)=>({startTime:stamp(i),endTime:stamp(i+1),temperature:50+i,temperatureUnit:'F',windSpeed:'10 mph',probabilityOfPrecipitation:{value:20},shortForecast:'<script>Clear</script>'}))}}})};};
  const mounted=mountJourney({document:{getElementById:id=>nodes[id],createElement:tag=>new Element(tag)},window,L:{map:()=>map,tileLayer:layer,layerGroup:layer,polyline:layer,circleMarker:layer},fetcher,clock:()=>now});
  for(const [id,v] of [['from-lat',39],['from-lon',-77],['to-lat',40],['to-lon',-76]])nodes['journey-'+id].value=String(v);
  return {nodes,mounted,window,requests,attached,fitted:()=>fitted,roadworkBreak:()=>roadworkBroken=true,smokeBreak:()=>smokeBroken=true,gustBreak:()=>gustBroken=true,break:()=>broken=true,missing:()=>missing=true,hold:()=>held=true,release:()=>{held=false;release();},pick:(lat,lon)=>picker(lat,lon),exported:()=>exported};
}
test('journey renders three departure comparisons, timed sample rows and honest boundary coverage',async()=>{
  const s=setup();s.mounted.show();await s.mounted.run();assert.equal(s.nodes['journey-results'].hidden,false);assert.equal(s.nodes['journey-comparisons'].children.length,3);assert.equal(s.nodes['journey-weather-body'].children.length,2);assert.match(s.nodes['journey-weather-body'].textContent,/51°F/);assert.match(s.nodes['journey-coverage'].textContent,/1 active alerts/);assert.match(s.nodes['journey-route-note'].textContent,/coarser weather sampling/);
  s.nodes['journey-comparisons'].children[1].onclick();assert.match(s.nodes['journey-weather-body'].textContent,/53°F/);assert.equal(s.nodes['journey-comparisons'].children[1].attrs['aria-pressed'],'true');const summary=s.nodes['journey-weather-body'].children[0].children[7];assert.equal(summary.textContent,'<script>Clear</script>');assert.equal(summary.children.length,0);
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

test('road-label view follows departure selection, uses text nodes and survives in the exported route',async()=>{
  const context={method:'2026-10-29.1',status:'available',data_version:null,unavailable_legs:[],direction_verified:false,segments:[{leg_index:0,step_index:0,start_vertex:0,end_vertex:1,start_elapsed:0,end_elapsed:3600,name:'<script>Main Street</script>',ref:'I 95',mode:'driving',source:{name:'<script>Main Street</script>'}}]};
  const s=setup('hosted',false,{...route,road_context:context});await s.mounted.run();
  assert.match(s.nodes['journey-roads-status'].textContent,/1 route steps/);assert.match(s.nodes['journey-roads-list'].textContent,/<script>Main Street<\/script>/);
  assert.equal(s.nodes['journey-roads-list'].children[1].children.length,0);
  const first=s.nodes['journey-roads-list'].textContent;s.nodes['journey-comparisons'].children[1].onclick();assert.notEqual(s.nodes['journey-roads-list'].textContent,first);
  s.nodes['journey-export'].onclick();const data=JSON.parse(await s.exported().text());assert.deepEqual(data.route.road_context,context);assert.equal(data.selected_departure,1);
});

test('old routes disclose missing road labels while retaining weather comparisons',async()=>{
  const s=setup();await s.mounted.run();assert.match(s.nodes['journey-roads-status'].textContent,/unavailable/);assert.match(s.nodes['journey-roads-list'].textContent,/network references are unavailable/);assert.equal(s.nodes['journey-comparisons'].children.length,3);
});

test('router reference caveats are visible and original source evidence survives export',async()=>{
  const network={status:'retained',coordinate_identity_verified:false,agency_crosswalk_verified:false,direction_verified:false,closure_attribution_verified:false,
    legs:[{node_ids:[1,2,2,4],geometry_coordinates:[[-77,39],[-77,39.01],[-77,39.02],[-76,40]],counts_match:true,repeated_ids_at_distinct_interior_positions:[2]}]};
  const s=setup('hosted',false,{...route,legs:[{}],network_references:network});await s.mounted.run();
  assert.match(s.nodes['journey-roads-list'].textContent,/1\/1 legs/);assert.match(s.nodes['journey-roads-list'].textContent,/1 repeated-ID conflicts/);
  assert.match(s.nodes['journey-roads-list'].textContent,/do not verify coordinate identity/);
  s.nodes['journey-export'].onclick();const data=JSON.parse(await s.exported().text());assert.deepEqual(data.route.network_references,network);
});

test('agency card and export show shared road labels without promoting them to verified closures',async()=>{
  const context={method:'2026-10-29.1',status:'available',data_version:null,unavailable_legs:[],direction_verified:false,segments:[{leg_index:0,step_index:0,start_vertex:0,end_vertex:1,start_elapsed:0,end_elapsed:3600,name:'Test road',ref:'',mode:'driving',source:{name:'Test road'}}]};
  const s=setup('hosted',false,{...route,road_context:context});s.nodes['journey-roadwork-md'].checked=true;await s.mounted.run();
  assert.match(s.nodes['journey-roadwork-list'].textContent,/shares a road label/);assert.match(s.nodes['journey-roadwork-list'].textContent,/closure attribution remain unverified/);
  s.nodes['journey-export'].onclick();const data=JSON.parse(await s.exported().text());const labels=data.departures[0].roadwork.feeds[0].candidates[0].road_labels;
  assert.equal(labels.status,'shared_label');assert.equal(labels.direction_verified,false);assert.equal(labels.closure_attribution_verified,false);
});

test('route-relevant alert zones load independently and retain official-zone attribution',async()=>{
  const s=setup('hosted',true);await s.mounted.run();assert.equal(s.requests.filter(p=>p==='/api/zones/forecast/ABC001').length,1);assert.match(s.nodes['journey-alerts'].textContent,/Wind Advisory/);assert.match(s.nodes['journey-alerts'].textContent,/Official zone coverage/);assert.doesNotMatch(s.nodes['journey-coverage'].textContent,/incomplete/);
});

test('entering this workspace suspends the main smoke animation',async()=>{const s=setup(),visibility=[];s.window.WeatherSmokeMap={setVisible:v=>visibility.push(v)};s.nodes['nav-journey'].onclick();assert.deepEqual(visibility,[false]);});

test('gust grids are deduplicated and reused for all departure scenarios with raw evidence',async()=>{const s=setup();s.nodes['journey-gust-limit'].value='25';await s.mounted.run();assert.equal(s.requests.filter(p=>p.startsWith('/api/planning/grid')).length,1);assert.match(s.nodes['journey-comparisons'].textContent,/2\/2 gust samples/);assert.match(s.nodes['journey-comparisons'].textContent,/1\/2 available gust samples exceed/);assert.match(s.nodes['journey-weather-body'].textContent,/NWS gust grid/);s.nodes['journey-export'].onclick();const r=JSON.parse(await s.exported().text());assert.equal(r.departures[0].max_gust,30);assert.equal(r.departures[2].max_gust,50);assert.equal(r.sources.gust[0].grid.properties.windGust.values.length,10);assert.equal(r.departures[0].rows[0].gust_evidence.revision,'gust-revision');});

test('gust outages preserve hourly coverage and explicitly withhold gust comparison',async()=>{const s=setup();s.gustBreak();s.nodes['journey-gust-limit'].value='25';await s.mounted.run();assert.match(s.nodes['journey-comparisons'].textContent,/2\/2 complete hourly/);assert.match(s.nodes['journey-comparisons'].textContent,/0\/2 gust samples/);assert.match(s.nodes['journey-coverage'].textContent,/Gust coverage is incomplete/);assert.match(s.nodes['journey-weather-body'].textContent,/Gust source unavailable/);s.nodes['journey-export'].onclick();const r=JSON.parse(await s.exported().text());assert.equal(r.departures[0].max_gust,null);assert.equal(r.departures[0].rows[0].gust_exceeds,null);});

test('invalid gust ceiling clears prior results before any new upstream work',async()=>{const s=setup();await s.mounted.run();const before=s.requests.length;s.nodes['journey-gust-limit'].value='-1';await s.mounted.run();assert.equal(s.requests.length,before);assert.equal(s.nodes['journey-results'].hidden,true);assert.equal(s.nodes['journey-export'].disabled,true);assert.match(s.nodes['journey-status'].textContent,/gust limit/);});


test('via controls route through the chosen point, retain stop timing in export and reuse forecasts during stops',async()=>{
  const raw={code:'Ok',waypoints:[[-77,39],[-76.5,39.5],[-76,40]].map(location=>({location,distance:0})),routes:[{duration:3600,distance:100000,geometry:{type:'LineString',coordinates:[[-77,39],[-76.5,39.5],[-76,40]]},legs:[{duration:1800,distance:50000,annotation:{duration:[1800],distance:[50000]}},{duration:1800,distance:50000,annotation:{duration:[1800],distance:[50000]}}]}]};const base=normalizeRoute(raw),r={...base,sampling:sampleRoute(base),checked_at:stamp(0),revision:'via-route'},s=setup('hosted',false,r);
  s.nodes['journey-via1-lat'].value='39.5';s.nodes['journey-via1-lon'].value='-76.5';s.nodes['journey-via1-minutes'].value='120';await s.mounted.run();assert.equal(s.nodes['journey-results'].hidden,false);const query=new URL(s.requests[0],'https://example.test');assert.deepEqual(JSON.parse(query.searchParams.get('via')),[{lat:39.5,lon:-76.5}]);assert.match(s.nodes['journey-route-summary'].textContent,/60 minutes driving \+ 120 minutes stopped/);assert.match(s.nodes['journey-weather-body'].textContent,/during stop/);assert.match(s.nodes['journey-stop-summary'].textContent,/Via 1/);assert.equal(s.requests.filter(p=>p.startsWith('/api/forecast')).length,3);s.nodes['journey-export'].onclick();const data=JSON.parse(await s.exported().text());assert.equal(data.route.stops[0].duration,7200);assert.equal(data.route.duration,10800);assert.equal(data.departures[0].rows.filter(r=>r.stop_index).length,5);
});
test('incomplete via input is rejected before network work and clear controls reset its duration',async()=>{const s=setup();s.nodes['journey-via2-lat'].value='39';await s.mounted.run();assert.equal(s.requests.length,0);assert.match(s.nodes['journey-status'].textContent,/coordinates are required/);s.nodes['journey-via2-minutes'].value='90';s.nodes['journey-via2-clear'].onclick();assert.equal(s.nodes['journey-via2-lat'].value,'');assert.equal(s.nodes['journey-via2-minutes'].value,'0');});


test('smoke is optional and enabled comparisons preserve independent coverage and raw model evidence',async()=>{
  const s=setup();await s.mounted.run();assert.equal(s.requests.filter(p=>p.startsWith('/api/smoke')).length,0);assert.equal(s.nodes['journey-smoke-results'].hidden,true);s.nodes['journey-smoke-enabled'].checked=true;s.nodes['journey-smoke-enabled'].onchange();assert.equal(s.nodes['journey-smoke-limit'].disabled,false);s.nodes['journey-smoke-limit'].value='10';await s.mounted.run();assert.equal(s.nodes['journey-smoke-results'].hidden,false);assert.match(s.nodes['journey-smoke-summary'].textContent,/2\/2 complete time brackets/);assert.match(s.nodes['journey-smoke-summary'].textContent,/2 brackets contain a sample above/);assert.match(s.nodes['journey-smoke-body'].textContent,/NOAA RAP smoke source/);assert.match(s.nodes['journey-comparisons'].textContent,/2\/2 complete hourly/);s.nodes['journey-export'].onclick();const r=JSON.parse(await s.exported().text());assert.equal(r.sources.smoke.length,2);assert.equal(r.sources.smoke[0].samples[0].value,'0.000000012');assert.equal(r.departures[0].rows[0].smoke.revision,'smoke-fixture');assert.equal(s.requests.filter(p=>p==='/api/smoke/catalog').length,1);
});
test('smoke outage preserves hourly weather and displays unknown smoke rather than zero',async()=>{const s=setup();s.smokeBreak();s.nodes['journey-smoke-enabled'].checked=true;s.nodes['journey-smoke-limit'].value='10';await s.mounted.run();assert.equal(s.nodes['journey-results'].hidden,false);assert.match(s.nodes['journey-comparisons'].textContent,/2\/2 complete hourly/);assert.match(s.nodes['journey-smoke-summary'].textContent,/0\/2 complete time brackets/);assert.match(s.nodes['journey-smoke-summary'].textContent,/2 unknown limit results/);assert.match(s.nodes['journey-smoke-body'].textContent,/Smoke source unavailable/);assert.match(s.nodes['journey-coverage'].textContent,/cannot be treated as clear air/);});
test('invalid smoke limit prevents network work only when the comparison is enabled',async()=>{const s=setup();s.nodes['journey-smoke-enabled'].checked=true;s.nodes['journey-smoke-limit'].value='-1';await s.mounted.run();assert.equal(s.requests.length,0);assert.match(s.nodes['journey-status'].textContent,/smoke sample limit/);s.nodes['journey-smoke-enabled'].checked=false;await s.mounted.run();assert.equal(s.nodes['journey-results'].hidden,false);});


test('work-zone sources are opt-in and each departure uses the same raw agency edition',async()=>{const s=setup();await s.mounted.run();assert.equal(s.requests.filter(p=>p.includes('/roadwork')).length,0);s.nodes['journey-roadwork-md'].checked=true;await s.mounted.run();assert.equal(s.requests.filter(p=>p.includes('/roadwork')).length,1);assert.equal(s.nodes['journey-roadwork-results'].hidden,false);assert.match(s.nodes['journey-roadwork-list'].textContent,/all lanes closed/);assert.match(s.nodes['journey-roadwork-list'].textContent,/eastbound/);assert.match(s.nodes['journey-roadwork-list'].textContent,/Opposite carriageways/);s.nodes['journey-export'].onclick();const r=JSON.parse(await s.exported().text());assert.equal(r.sources.roadwork[0].raw.features[0].id,'work-1');assert.equal(r.departures[0].roadwork.feeds[0].candidates.length,1);assert.equal(r.departures[1].roadwork.feeds[0].candidates.length,0);assert.equal(r.departures[2].roadwork.feeds[0].revision,'agency-revision');});
test('road-agency failure remains explicit without removing available weather or inferring open roads',async()=>{const s=setup();s.nodes['journey-roadwork-md'].checked=true;s.roadworkBreak();await s.mounted.run();assert.equal(s.nodes['journey-results'].hidden,false);assert.match(s.nodes['journey-roadwork-list'].textContent,/Road agency unavailable/);assert.match(s.nodes['journey-comparisons'].textContent,/0\/1 feeds within freshness/);assert.match(s.nodes['journey-comparisons'].textContent,/2\/2 complete hourly/);});


test('Journey overlays share the existing map, detach on leaving and cannot reappear after a late response',async()=>{
 const s=setup();s.mounted.show();await s.mounted.run();assert.equal(s.attached.size,1);const fit=s.fitted();
 s.mounted.hide();assert.equal(s.attached.size,0);s.mounted.show();assert.equal(s.attached.size,1);assert.equal(s.fitted(),fit);
 s.hold();const pending=s.mounted.run();s.mounted.hide();s.release();await pending;assert.equal(s.attached.size,0);assert.equal(s.fitted(),fit);
 s.mounted.show();assert.equal(s.attached.size,1);
});
