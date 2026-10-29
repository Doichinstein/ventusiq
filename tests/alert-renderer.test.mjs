import {test} from 'node:test';
import assert from 'node:assert/strict';
import '../public/alert-renderer.js';
const feature = id => ({id,geometry:{type:'Point',coordinates:[-100,40]},properties:{severity:'Moderate',event:'Test',areaDesc:id}});
function setup(cost=1) {
  let time=0; const jobs=[],visible=new Set(),made=[],removed=[],styled=[],order=[],reports=[];
  const renderer=globalThis.createAlertRenderer({
    create:f=>{time+=cost;const layer={id:f.id};made.push(f.id);visible.add(layer);return layer;},
    remove:l=>{removed.push(l.id);visible.delete(l);},restyle:l=>styled.push(l.id),front:l=>order.push(l.id),
    progress:s=>reports.push(s),schedule:fn=>jobs.push(fn),now:()=>time,budget:8,
  });
  const finish=()=>{while(jobs.length) jobs.shift()();};
  return {renderer,jobs,visible,made,removed,styled,order,reports,finish};
}

test('large initial maps yield after the time budget and report actual drawing progress',()=>{
  const s=setup(),features=Array.from({length:300},(_,i)=>feature(String(i)));
  s.renderer.update(features,null);
  assert.equal(s.made.length,8);assert.equal(s.jobs.length,1);
  assert.deepEqual(s.reports.at(-1),{drawn:8,pending:292});
  s.finish();assert.equal(s.visible.size,300);assert.equal(s.made.length,300);
  assert.deepEqual(s.reports.at(-1),{drawn:300,pending:0});
});

test('new boundaries and selection retain existing layers and severity stacking',()=>{
  const s=setup(),a=feature('severe'),b=feature('minor'),c=feature('new');a.properties.severity='Severe';
  s.renderer.update([a,b],null);s.renderer.update([a,b,c],null);s.finish();
  assert.equal(s.made.length,3);assert.equal(s.removed.length,0);
  s.renderer.update([a,b,c],'minor');assert.equal(s.made.length,3);
  assert.deepEqual(s.styled,['minor']);assert.equal(s.order.at(-1),'minor');
  s.renderer.update([a,b,c],null);assert.deepEqual(s.styled,['minor','minor']);assert.equal(s.order.at(-1),'severe');
});

test('filter/replay replacement cancels queued old shapes and prioritizes the selected alert',()=>{
  const s=setup(10),old=Array.from({length:40},(_,i)=>feature('old'+i));
  s.renderer.update(old,null);assert.equal(s.made.length,1);
  const live=[feature('live1'),feature('live2'),feature('live3')];
  s.renderer.update(live,'live2');s.jobs.shift()();
  assert.equal(s.made.at(-1),'live2');
  s.finish();assert.deepEqual([...s.visible].map(x=>x.id).sort(),live.map(x=>x.id).sort());
  assert.equal(s.made.filter(id=>id.startsWith('old')).length,1);
  s.renderer.update([],null);s.finish();assert.equal(s.visible.size,0);
});

test('changed geometry or tooltip replaces only that alert, including removal before queued drawing',()=>{
  const s=setup(),a=feature('a'),b=feature('b');s.renderer.update([a,b],null);
  const revised={...a,geometry:{...a.geometry,coordinates:[-101,40]}};
  s.renderer.update([revised,b],null);assert.equal(s.made.length,3);assert.deepEqual(s.removed,['a']);
  const relabeled={...b,properties:{...b.properties,areaDesc:'Revised'}};
  s.renderer.update([revised,relabeled],null);assert.equal(s.made.length,4);assert.deepEqual(s.removed,['a','b']);
  s.renderer.update([{...revised},{...relabeled}],null);assert.equal(s.made.length,4);
});
