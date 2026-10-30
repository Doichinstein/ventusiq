import {test} from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {parseHTML} from 'linkedom';
import {fileURLToPath} from 'node:url';
import {normalizePinnedRoute} from '../lib/pinned-route.mjs';
import {JourneyService} from '../lib/journey-service.mjs';
import {reviewedEvents,validateReviewedEvents} from '../lib/journey-events.mjs';
import {WeatherService} from '../lib/weather-service.mjs';
import {database} from './fixtures/push.mjs';
import {eventDepartures,renderReviewedEvents,selectReviewedEvents,reviewedEventSummary} from '../public/journey-events.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
// The real Python evaluator emits this response; the JavaScript contract is not tested against a hand-written lookalike.
const fixture=JSON.parse(execFileSync(process.env.PYTHON||(process.platform==='win32'?'python':'python3'),['tests/test_pinned_events.py','--emit'],{cwd:root,encoding:'utf8'}));
const now=Date.parse(fixture.now),request=fixture.request,graph=request.route.graph_sha256;
const route=normalizePinnedRoute(request.route,graph,request.route.requested_waypoints,now);
const contract={...request,route,graph};
test('Python bundle evaluation survives the hosted contract with both closure overlap and later non-overlap',()=>{
  const value=validateReviewedEvents(fixture.result,contract,now);
  assert.equal(value.departures[0].results[0].status,'reviewed_reported_closure_overlap');
  assert.equal(value.departures[1].results[0].status,'no_reviewed_time_overlap');
  assert.equal(value.departures[0].results[0].passages[0].leg_index,1);
});
test('mismatched identity, timing, stops, falsely verified access, missing evidence and stale results are rejected',()=>{
  const mutations=[v=>v.request_id='other',v=>v.graph_sha256='f'.repeat(64),v=>v.stop_minutes=[30],v=>v.bundle_sha256='invalid',
    v=>v.departures.reverse(),v=>v.evaluated_at=new Date(now-60001).toISOString(),v=>v.driving_access_established=true,
    v=>v.departures[0].results[0].arrival=new Date(now).toISOString(),v=>v.departures[0].results[0].status='open',
    v=>v.departures[0].results[0].blocks=['stale'],v=>v.departures[0].results[0].inputs=[],
    v=>v.departures[0].results[0].passages[0].leg_index=3,v=>v.departures[0].results[0].passages=[],
    v=>v.departures[0].results[0].field_closure_verified=true];
  for(const mutate of mutations){const value=structuredClone(fixture.result);mutate(value);assert.throws(()=>validateReviewedEvents(value,contract,now));}
});
test('server forwards its retained route with opt-in timing, binds revision, never caches event assessments, and keeps secrets out of results',async()=>{
  const db=database(),calls=[],config={graph,url:'https://router.example.test/route',token:'synthetic_not_a_secret_1234567890'};
  let bad=false;
  const weather=new WeatherService(db,{clock:()=>now/1000,fetcher:async(url,options)=>{
    const body=JSON.parse(options.body);calls.push({url,body});assert.equal(options.headers.Authorization,'Bearer '+config.token);
    if(url===config.url)return Response.json(request.route);
    assert.equal(url,'https://router.example.test/route-events');assert.deepEqual(body.route.legs,request.route.legs);
    assert.deepEqual(body.route.requested_waypoints,request.route.requested_waypoints);assert.deepEqual(body.stop_minutes,[0]);
    return Response.json({...fixture.result,request_id:bad?'wrong':body.request_id});
  }}),service=new JourneyService(weather,{pinnedRouter:config}),points=request.route.requested_waypoints,
  args=[points[0][1],points[0][0],points.at(-1)[1],points.at(-1)[0],[{lat:points[1][1],lon:points[1][0],minutes:0}]];
  try{
    const base=await service.route(...args),result=await reviewedEvents(service,...args,request.departures,base.revision);
    assert.equal(result.route_revision,base.revision);assert.equal(result.request_id,undefined);assert.equal(JSON.stringify(result).includes(config.token),false);
    assert.equal((await weather.statement('SELECT COUNT(*) AS n FROM revisions').first()).n,1);
    await assert.rejects(reviewedEvents(service,...args,request.departures,'wrong'),/changed/);
    await assert.rejects(reviewedEvents(service,...args,request.departures,base.revision),/busy/);
    await weather.statement("DELETE FROM datasets WHERE name='routing/events-limit'").run();bad=true;
    await assert.rejects(reviewedEvents(service,...args,request.departures,base.revision),/contract/);
    assert.equal(calls.filter(c=>c.url.endsWith('/route-events')).length,2);
  }finally{db.close();}
});
test('unconfigured deployments report unknown coverage without routing or fetching',async()=>{
  const value=await reviewedEvents({pinnedRouter:null,weather:{clock:()=>now/1000}},0,0,1,1,[],request.departures,'unused');
  assert.equal(value.status,'unavailable');assert.match(reviewedEventSummary(value),/unavailable/);
});
test('source details are collapsed, text escaped, only HTTPS evidence linked and departure mismatch is unavailable',()=>{
  const {document}=parseHTML('<section id="journey-reviewed-events"></section>'),r={...route,revision:'retained'},data={...structuredClone(fixture.result),route_revision:'retained'};
  const value=selectReviewedEvents(data,r,request.departures,0);value.results[0].event_id='<script>bad</script>';
  value.results[0].reviews.association.evidence.push({url:'javascript:alert(1)'});
  renderReviewedEvents(document,value,s=>s);
  assert.equal(document.querySelectorAll('details[open]').length,0);assert.equal(document.querySelectorAll('script').length,0);
  assert.equal(document.querySelectorAll('a[href^="javascript:"]').length,0);
  assert.match(document.body?.textContent||document.documentElement.textContent,/Reported full closure/);
  assert.equal(selectReviewedEvents({...data,route_revision:'changed'},r,request.departures,0).status,'unavailable');
  renderReviewedEvents(document,{status:'unavailable',reason:'Source unavailable'},s=>s);
  assert.doesNotMatch(document.documentElement.textContent,/Reported full closure/);
  renderReviewedEvents(document,null,s=>s);assert.equal(document.getElementById('journey-reviewed-events').hidden,true);
});
test('departure validation honors explicit DST offsets and a bounded horizon',()=>{
  assert.equal(eventDepartures(['2026-11-01T01:15:00-04:00','2026-11-01T01:15:00-05:00'],Date.parse('2026-11-01T04:00:00Z')).length,2);
  for(const value of [[],[fixture.now,fixture.now],['2026-10-30T01:00'],['2026-11-03T00:00:00Z']])assert.throws(()=>eventDepartures(value,now));
});
