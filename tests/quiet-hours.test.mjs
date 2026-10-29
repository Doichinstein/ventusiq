import {test} from 'node:test';
import assert from 'node:assert/strict';
import {normalizeQuietHours,quietAt,quietReason} from '../public/quiet-hours-core.mjs';
const policy=(start='22:00',end='07:00',time_zone='America/Los_Angeles')=>({enabled:true,start,end,time_zone});
const at=(p,t)=>quietAt(p,Date.parse(t)/1000);
test('quiet hours use the selected local zone, wrap midnight, include start and exclude end',()=>{
  const p=policy();assert.equal(at(p,'2026-10-29T04:59:59Z'),false);assert.equal(at(p,'2026-10-29T05:00:00Z'),true);assert.equal(at(p,'2026-10-29T07:00:00Z'),true);assert.equal(at(p,'2026-10-29T13:59:59Z'),true);assert.equal(at(p,'2026-10-29T14:00:00Z'),false);
  assert.equal(at(policy('09:00','17:00','UTC'),'2026-10-29T09:00:00Z'),true);assert.equal(at(policy('09:00','17:00','UTC'),'2026-10-29T17:00:00Z'),false);assert.equal(at(policy('09:00','17:00','UTC'),'2026-10-29T00:00:00Z'),false);
});
test('both repeated daylight-saving hours are quiet and skipped hours invent no instants',()=>{
  const fall=policy('01:00','02:00');assert.equal(at(fall,'2026-11-01T08:30:00Z'),true);assert.equal(at(fall,'2026-11-01T09:30:00Z'),true);assert.equal(at(fall,'2026-11-01T10:00:00Z'),false);
  const spring=policy('02:00','03:00');assert.equal(at(spring,'2026-03-08T09:59:59Z'),false);assert.equal(at(spring,'2026-03-08T10:00:00Z'),false);
});
test('invalid or ambiguous schedules are rejected and corrupt stored policies fail closed',()=>{
  for(const p of [undefined,{},policy('24:00'),policy('22:00','22:00'),policy('9:00'),policy('22:00','07:00','Not/AZone'),policy(['22:00'])])assert.throws(()=>normalizeQuietHours(p));
  assert.equal(normalizeQuietHours({enabled:false}),null);assert.equal(at(null,'2026-10-29T05:00:00Z'),false);
  assert.match(quietReason('{broken',null,0,0),/could not be read/);assert.match(quietReason(null,'{}',0,0),/could not be read/);
});
