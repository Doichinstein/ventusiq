import {test} from 'node:test';import assert from 'node:assert/strict';
import {mountMapControls} from '../public/map-controls.js';
test('layer preferences restore independent combinations, dispatch to modules, and close accessibly',()=>{
  const handlers={},inputs=['alerts','fires','aqi'].map(name=>({id:'layer-'+name,checked:name==='alerts',listeners:{},addEventListener(type,fn){this.listeners[type]=fn;},dispatchEvent(e){this.events=(this.events||0)+1;this.listeners[e.type]?.();}}));
  let focused=0,stored=JSON.stringify({'layer-alerts':false,'layer-fires':true,'layer-aqi':true});
  const summary={focus(){focused++;}},menu={open:true,querySelectorAll:()=>inputs,querySelector:()=>summary,contains:target=>target===summary,addEventListener:(name,fn)=>handlers[name]=fn};
  const nodes={'layer-menu':menu,'layer-count':{},'active-layer-summary':{},'layer-details':{},'hazard-controls':{scrollIntoView(){}}};
  const document={readyState:'complete',getElementById:id=>nodes[id],addEventListener:(name,fn)=>handlers[name]=fn};
  const window={Event:class{constructor(type){this.type=type;}},localStorage:{getItem:()=>stored,setItem:(key,value)=>stored=value}};
  mountMapControls({document,window});assert.deepEqual(inputs.map(i=>i.checked),[false,true,true]);assert.ok(inputs.every(i=>i.events===1));assert.equal(nodes['layer-count'].textContent,'2');assert.equal(nodes['active-layer-summary'].textContent,'Fires · AQI');
  handlers.keydown({key:'Escape',stopPropagation(){}});assert.equal(menu.open,false);assert.equal(focused,1);
  nodes['layer-details'].onclick();assert.equal(nodes['hazard-controls'].open,true);
});
