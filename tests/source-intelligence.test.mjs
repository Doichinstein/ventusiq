import {test} from 'node:test';
import assert from 'node:assert/strict';
import {localDay,dayComparison,eligiblePairs,sourceScorecard,thresholdStats} from '../public/source-intelligence-core.mjs';
const H=3600000,now=Date.parse('2026-11-01T20:00:00Z'),stamp=h=>new Date(now+h*H).toISOString();
const pair=(f=60,o=62,extra={})=>({valid_at:stamp(-1),forecast_checked_at:stamp(-8),forecast_issued_at:stamp(-9),lead_hours:8,forecast_f:f,observed_f:o,observation_at:stamp(-1),observation_id:'obs-1',quality:'V',...extra});
test('local days follow DST and station timezone instead of browser date',()=>{
  const fall=localDay(now,'America/Los_Angeles');assert.equal(fall.start,Date.parse('2026-11-01T07:00:00Z'));assert.equal(fall.end-fall.start,25*H);
  const spring=localDay(Date.parse('2026-03-08T20:00:00Z'),'America/Los_Angeles');assert.equal(spring.end-spring.start,23*H);
  const offset=localDay(now,'Asia/Kathmandu');assert.equal(new Date(offset.start).toISOString(),'2026-11-01T18:15:00.000Z');
});
test('today separates a pre-day forecast, accepted readings, and future-only outlook',()=>{
  const period=h=>({startTime:stamp(h),endTime:stamp(h+1),temperature:60+h,temperatureUnit:'F'}),edition={checked_at:stamp(-14),forecast:{properties:{updateTime:stamp(-15),periods:[period(-5),period(1)]}}};
  const obs=(h,q='V',t=10)=>({id:'o'+h,properties:{timestamp:stamp(h),temperature:{value:t,unitCode:'wmoUnit:degC',qualityControl:q}}});
  const r=dayComparison({now,zone:'America/Los_Angeles',earlier:edition,current:{...edition,checked_at:stamp(0)},observed:{features:[obs(-14),obs(-3),obs(-2,'S'),obs(-1,'V',15),obs(1)]}});
  assert.equal(r.earlier.length,2);assert.equal(r.remaining.length,1);assert.equal(r.remaining[0].at,now+H);assert.equal(r.readings.length,2);assert.equal(r.observed_min_f,50);assert.equal(r.observed_max_f,59);
  const invalid=dayComparison({now,zone:'America/Los_Angeles',earlier:{...edition,checked_at:stamp(-1)},current:null,observed:{features:[]}});assert.deepEqual(invalid.earlier,[]);assert.equal(invalid.observed_min_f,null);assert.equal(invalid.outlook_delayed,true);
});
test('failed, conflicting, future and timezone-less readings never establish a daily extreme',()=>{
  const obs=(timestamp,t,q='V')=>({id:timestamp+t,properties:{timestamp,temperature:{value:t,unitCode:'wmoUnit:degF',qualityControl:q}}});
  const r=dayComparison({now,zone:'UTC',observed:{features:[obs(stamp(-1),55),obs(stamp(-1),90),obs(stamp(-2),150,'X'),obs(stamp(1),180),obs('2026-11-01T12:00:00',170)]}});
  assert.equal(r.observed_max_f,null);assert.equal(r.observation_audit.conflicting_timestamps,1);assert.equal(r.observation_audit.time_excluded,1);
});
test('scorecard joins identical station truth and lead bands, never unequal aggregate samples',()=>{
  const a=pair(),b=pair(63,62,{initialization_at:stamp(-9),median_f:63,forecast_issued_at:undefined});
  const score=sourceScorecard({nws:{pairs:[a]},hrrr:{pairs:[pair(60,62,{observation_id:'different'})]},gefs:{pairs:[b,pair(100,40,{median_f:100,valid_at:stamp(-2),observation_at:stamp(-2),observation_id:'obs-2',lead_hours:7,initialization_at:stamp(-9),forecast_issued_at:undefined})]}});
  assert.equal(score.shared[0].left_stats.sample_count,0);assert.equal(score.shared[1].left_stats.sample_count,1);assert.equal(score.shared[1].right_stats.mae_f,1);assert.equal(score.sources[2].mae_f,30.5);
  assert.equal(sourceScorecard({nws:{pairs:[a]},gefs:{pairs:[{...b,initialization_at:stamp(-15),lead_hours:14}]}}).shared[1].left_stats.sample_count,0);
});
test('future capture, malformed lead, disallowed quality and duplicate source cases are excluded',()=>{
  for(const extra of [{forecast_checked_at:stamp(0)},{lead_hours:7},{quality:'S'},{observation_at:stamp(-2)},{lead_hours:24}])assert.equal(eligiblePairs({pairs:[pair(60,62,extra)]},'nws').length,0);
  assert.equal(eligiblePairs({pairs:[pair(),pair()]},'nws').length,0);
});
test('threshold checks use declared inclusive limits and explicit denominators; absent evidence is unknown',()=>{
  const r=thresholdStats([pair(40,40),pair(85,86),pair(39,50),pair(86,90)],40,85);
  assert.deepEqual(r.counts,{within_both:1,missed_exceedance:1,false_exceedance:1,outside_both:1});assert.equal(r.within_hit_fraction,.5);assert.equal(r.miss_fraction,.5);assert.equal(r.false_alarm_fraction,.5);
  assert.equal(thresholdStats([],40,85).within_hit_fraction,null);assert.throws(()=>thresholdStats([],85,40));
});
