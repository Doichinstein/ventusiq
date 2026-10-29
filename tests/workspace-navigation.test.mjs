import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mountWorkspaceNavigation,WORKSPACES} from '../public/workspace-navigation.mjs';

function setup(){
  const nodes=new Map(),queue=[],focused=[];let observer;
  class Element{
    constructor(id,parent=null){this.id=id;this.parent=parent;this.hidden=false;this.attrs={};this.listeners=[];nodes.set(id,this);}
    setAttribute(key,value){this.attrs[key]=value;}
    getAttribute(key){return this.attrs[key]??null;}
    closest(){for(let n=this;n;n=n.parent)if(n.hidden)return n;return null;}
    querySelector(){return this.heading||null;}
    addEventListener(type,fn){this.listeners.push(fn);}
    removeEventListener(type,fn){this.listeners=this.listeners.filter(f=>f!==fn);}
    focus(){assert.equal(this.closest(),null,'Must never focus a hidden target');focused.push(this.id);}
    click(){const event={prevented:false,preventDefault(){this.prevented=true;}};for(const fn of this.listeners)fn(event);this.onclick?.();return event;}
  }
  class Observer{constructor(fn){this.fn=fn;observer=this;}observe(target,options){assert.equal(target.id,'workspace');assert.deepEqual(options.attributeFilter,['hidden']);}disconnect(){this.stopped=true;}}
  const main=new Element('workspace'),skip=new Element('skip-workspace'),jumps=[];
  for(const [nav,panel] of WORKSPACES){const button=new Element(nav),region=new Element(panel,main);region.hidden=nav!=='nav-map';button.setAttribute('aria-pressed',String(nav==='nav-map'));region.heading=new Element(panel+'-heading',region);button.onclick=()=>activate(nav);}
  const content=new Element('place-content',nodes.get('personal-workspace'));
  for(const id of ['activity-card','observation-card','missing-card']){
    const jump=new Element('jump-'+id,content);jump.setAttribute('data-workspace-jump',id);jumps.push(jump);
    if(id!=='missing-card'){const card=new Element(id,content);card.heading=new Element(id+'-heading',card);}
  }
  const location={hash:'#event=abc&at=2026-10-28T00%3A00%3A00Z'};
  const document={getElementById:id=>nodes.get(id),querySelectorAll:()=>jumps,location};
  function activate(nav){for(const [button,panel] of WORKSPACES){nodes.get(button).setAttribute('aria-pressed',String(nav===button));nodes.get(panel).hidden=nav!==button;}}
  const mounted=mountWorkspaceNavigation({document,schedule:fn=>queue.push(fn),Observer});
  return {nodes,main,skip,jumps,content,focused,location,mounted,activate,observer,flush(){while(queue.length)queue.shift()();}};
}

test('all five workspace switches focus their visible heading after existing view handlers run',()=>{
  const s=setup();for(const [nav,panel] of WORKSPACES){s.nodes.get(nav).click();s.flush();assert.equal(s.focused.at(-1),panel+'-heading');assert.equal(s.nodes.get(panel+'-heading').getAttribute('tabindex'),'-1');}
});
test('skip follows the active workspace and preserves an event share URL instead of targeting the hidden alert list',()=>{
  const s=setup(),hash=s.location.hash;
  for(const [nav,panel] of WORKSPACES){s.activate(nav);assert.equal(s.skip.click().prevented,true);assert.equal(s.focused.at(-1),panel+'-heading');}
  assert.equal(s.location.hash,hash);
  for(const [nav,panel] of WORKSPACES){s.nodes.get(nav).setAttribute('aria-pressed','false');s.nodes.get(panel).hidden=true;}
  s.skip.click();assert.equal(s.focused.at(-1),'workspace');
});
test('tool links focus visible card headings without changing the place URL or revealing unsupported tools',()=>{
  const s=setup();s.location.hash='#lat=39&lon=-77&name=Home';s.activate('nav-personal');s.observer.fn();
  assert.equal(s.nodes.get('jump-activity-card').hidden,false);assert.equal(s.nodes.get('jump-missing-card').hidden,true);
  assert.equal(s.nodes.get('jump-activity-card').click().prevented,true);assert.equal(s.focused.at(-1),'activity-card-heading');assert.equal(s.location.hash,'#lat=39&lon=-77&name=Home');
  s.nodes.get('observation-card').hidden=true;s.observer.fn();assert.equal(s.nodes.get('jump-observation-card').hidden,true);
  const count=s.focused.length;s.nodes.get('jump-observation-card').click();assert.equal(s.focused.length,count);assert.equal(s.nodes.get('observation-card').hidden,true);
});
test('place visibility and background card updates change shortcut availability without stealing focus',()=>{
  const s=setup();s.activate('nav-personal');s.content.hidden=true;s.observer.fn();assert.equal(s.nodes.get('jump-activity-card').hidden,true);
  s.content.hidden=false;s.observer.fn();assert.equal(s.nodes.get('jump-activity-card').hidden,false);assert.equal(s.focused.length,0);
  s.nodes.get('observation-card').hidden=true;s.observer.fn();s.nodes.get('observation-card').hidden=false;s.observer.fn();assert.equal(s.nodes.get('jump-observation-card').hidden,false);assert.equal(s.focused.length,0);
});
test('rapid switches and unsupported or failed navigation cannot focus an obsolete hidden panel',()=>{
  const s=setup();s.nodes.get('nav-journey').click();s.nodes.get('nav-events').click();s.flush();assert.deepEqual(s.focused,['event-workspace-heading']);
  s.nodes.get('nav-rivers').onclick=()=>{};s.nodes.get('nav-rivers').click();s.flush();assert.deepEqual(s.focused,['event-workspace-heading']);
  s.nodes.get('nav-journey').hidden=true;s.nodes.get('nav-journey').click();s.flush();assert.deepEqual(s.focused,['event-workspace-heading']);
});
test('disconnect removes observers and click behavior without changing the current view',()=>{
  const s=setup();s.mounted.disconnect();assert.equal(s.observer.stopped,true);assert.equal(s.skip.click().prevented,false);s.nodes.get('nav-personal').click();s.flush();assert.equal(s.focused.length,0);
});
