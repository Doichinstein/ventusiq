// UI state doubles do not establish rendered layout or browser compatibility.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {mountCompound} from '../public/compound.js';
const core=createRequire(import.meta.url)('./load-core.cjs');
class Element{constructor(tag='div'){this.tag=tag;this.children=[];this.text='';this.open=false;}set textContent(v){this.text=String(v);this.children=[];}get textContent(){return this.text+this.children.map(c=>c.textContent).join('');}append(...children){this.children.push(...children);}replaceChildren(...children){this.text='';this.children=children;}click(){this.onclick?.();}}
const now=Date.parse('2026-10-28T20:00:00Z'),stamp=h=>new Date(now+h*3600000).toISOString(),zone='https://api.weather.gov/zones/forecast/ABC001';
function setup(){
  const nodes=Object.fromEntries([...readFileSync(new URL('../public/index.html',import.meta.url),'utf8').matchAll(/id="([^"]+)"/g)].map(m=>[m[1],new Element()]));let time=now,exported;
  const context={place:{name:'<script>Home</script>',lat:0,lon:0},forecast:{issued_at:stamp(-1),checked_at:stamp(0),revision:'forecast-one',metadata:{properties:{forecastZone:zone}},forecast:{properties:{periods:Array.from({length:50},(_,i)=>({startTime:stamp(i),endTime:stamp(i+1),temperature:32,temperatureUnit:'F',windSpeed:'25 mph',probabilityOfPrecipitation:{value:i<2?60:0,unitCode:'wmoUnit:percent'},shortForecast:'<script>Weather</script>'}))}}},alerts:{collected_at:stamp(0),revision:'alerts-one',features:[]}};
  const window={WeatherCore:core,WeatherPersonal:{context:()=>context},WeatherHazards:{snapshot:()=>null},setInterval(){},setTimeout:fn=>fn(),URL:{createObjectURL(blob){exported=blob;return 'blob:report';},revokeObjectURL(){}}};
  const mounted=mountCompound({document:{getElementById:id=>nodes[id],createElement:tag=>new Element(tag)},window,clock:()=>time});return {nodes,context,mounted,window,advance:ms=>time+=ms,exported:()=>exported};
}
test('compound UI distinguishes matches from unknown checks and renders captured source text safely',()=>{
  const s=setup();assert.match(s.nodes['compound-status'].textContent,/2 of 6/);assert.equal(s.nodes['compound-status'].children.length,0);assert.equal(s.nodes['compound-audit'].children.length,6);assert.match(s.nodes['compound-audit'].textContent,/Unknown/);assert.match(s.nodes['compound-findings'].textContent,/planning thresholds/);assert.match(s.nodes['compound-findings'].textContent,/<script>Weather<\/script>/);assert.match(s.nodes['compound-findings'].textContent,/forecast-one/);
});
test('evidence stays expanded across clock ticks and source updates without persisting across places',()=>{
  const s=setup(),detail=s.nodes['compound-findings'].children[0].children.find(n=>n.tag==='details');detail.open=true;s.advance(60000);s.mounted.refresh();assert.equal(s.nodes['compound-findings'].children[0].children.find(n=>n.tag==='details').open,true);
  s.context.forecast.revision='forecast-two';s.mounted.refresh();assert.equal(s.nodes['compound-findings'].children[0].children.find(n=>n.tag==='details').open,true);s.context.place={name:'Other',lat:1,lon:1};s.mounted.refresh();assert.equal(s.nodes['compound-findings'].children[0].children.find(n=>n.tag==='details').open,false);
});
test('source outage removes current positive conclusions and export contains the current unknown state',async()=>{
  const s=setup();s.context.forecast.stale=true;s.context.alerts.stale=true;s.mounted.refresh();assert.match(s.nodes['compound-findings'].textContent,/No combinations were established/);s.nodes['compound-export'].onclick();const report=JSON.parse(await s.exported().text());assert.ok(report.rules.every(r=>r.status==='unknown'));assert.equal(report.evidence.length,0);assert.equal(report.sources.forecast.fresh,false);
});
test('export preserves rule version, original hourly values and revision provenance',async()=>{
  const s=setup();s.nodes['compound-export'].onclick();const report=JSON.parse(await s.exported().text());assert.ok(report.ruleset_version);assert.equal(report.place.name,'<script>Home</script>');assert.equal(report.evidence[0].source_snapshot.temperature,32);assert.equal(report.evidence[0].revision,'forecast-one');assert.equal(report.rules.find(r=>r.id==='precip-wind').windows[0].segments.length,2);
});
test('removing the place clears findings and disables exporting the old place',()=>{
  const s=setup();s.context.place=null;s.mounted.refresh();assert.equal(s.nodes['compound-export'].disabled,true);assert.equal(s.nodes['compound-findings'].children.length,0);assert.match(s.nodes['compound-status'].textContent,/Select a saved place/);
});
