import {test} from 'node:test';
import assert from 'node:assert/strict';
import {fireSymbolSize,fireDisplay} from '../public/hazards-core.mjs';
const now=Date.parse('2026-10-29T18:00:00Z');
test('reported containment and source record age remain independent',()=>{
  const fresh={contained:100,updated_at:'2026-10-29T17:00:00Z'};
  assert.equal(fireDisplay(fresh,now).className,' fire-contained');
  const old=fireDisplay({...fresh,updated_at:'2026-10-26T17:00:00Z'},now);
  assert.equal(old.className,' fire-contained fire-record-old');assert.match(old.label,/reported 100% contained.*over 48 hours/);
  assert.doesNotMatch(old.label,/safe|extinguished|active/i);
  assert.equal(fireDisplay({...fresh,contained:0},now).className,'');
  assert.match(fireDisplay({...fresh,contained:null},now).label,/containment unreported/);
  for(const updated_at of [null,'bad','2026-10-30T18:00:00Z'])assert.match(fireDisplay({...fresh,updated_at},now).label,/time unknown/);
  assert.doesNotMatch(fireDisplay({...fresh,updated_at:'2026-10-27T18:00:00Z'},now).className,/old/);
});
test('wide zoom reduces crowding without reversing acreage bands or inventing missing acreage',()=>{
  const sizes=[0,100,1000,10000].map(acres=>fireSymbolSize(acres,{zoom:4}));
  assert.deepEqual(sizes,[13,17,21,25]);assert.equal(fireSymbolSize(null,{zoom:4}),12);
  for(const acres of [0,100,1000,10000])assert.ok(fireSymbolSize(acres,{zoom:4})<fireSymbolSize(acres,{zoom:7})&&fireSymbolSize(acres,{zoom:7})<fireSymbolSize(acres,{zoom:9}));
});
