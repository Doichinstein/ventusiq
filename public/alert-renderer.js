/* Incremental map rendering. Apache-2.0. Pending work always follows the latest view. */
(function(root) {
  'use strict';
  root.createAlertRenderer = function({create, remove, restyle, front, back, progress,
    schedule = fn => setTimeout(fn, 0), now = () => performance.now(), budget = 8}) {
    const rendered = new Map();
    let desired = [], pending = [], stack = [], selected = null, scheduled = false;
    const label = f => [f.properties.severity, f.properties.event, f.properties.areaDesc].join('\n');
    function report() { progress({drawn:rendered.size, pending:pending.length}); }
    function order() {
      // Keep the longest already-ordered prefix/suffix. Moving only the other
      // end avoids restacking the entire map after every small drawing batch.
      const target=[];
      for (let i=desired.length-1;i>=0;i--) {
        const id=desired[i].id;if(rendered.has(id) && id!==selected)target.push(id);
      }
      if(rendered.has(selected))target.push(selected);
      let prefix=0,suffix=0;
      for(const id of stack)if(id===target[prefix])prefix++;
      for(let i=stack.length-1;i>=0;i--)if(stack[i]===target[target.length-1-suffix])suffix++;
      if(back && suffix>prefix) {
        for(let i=target.length-suffix-1;i>=0;i--)back(rendered.get(target[i]).layer);
      } else {
        for(let i=prefix;i<target.length;i++)front(rendered.get(target[i]).layer);
      }
      stack=target;
    }
    function pump() {
      scheduled=false;
      const started=now();
      while(pending.length) {
        const feature=pending.shift(), layer=create(feature);
        rendered.set(feature.id,{layer,geometry:feature.geometry,label:label(feature),selected:feature.id===selected});
        stack.push(feature.id);
        if(now()-started>=budget) break;
      }
      order(); report();
      if(pending.length) { scheduled=true; schedule(pump); }
    }
    return {
      update(features, selectedId) {
        desired=features; selected=selectedId;
        const byId=new Map(features.map(f=>[f.id,f]));
        for(const [id,entry] of rendered) {
          const next=byId.get(id);
          if(!next || entry.geometry!==next.geometry || entry.label!==label(next)) {
            remove(entry.layer); rendered.delete(id);
          } else if(entry.selected !== (id===selected)) {
            restyle(entry.layer,next); entry.selected=id===selected;
          }
        }
        stack=stack.filter(id=>rendered.has(id));
        // Input order is highest severity/newest first. Paint those first;
        // final stacking still keeps them above lower-priority coverage.
        pending=features.filter(f=>!rendered.has(f.id));
        const priority=pending.findIndex(f=>f.id===selected);
        if(priority>0) pending.unshift(pending.splice(priority,1)[0]);
        // A scheduled callback consumes this replacement queue, never an older filter/replay.
        if(!scheduled) pump(); else { order(); report(); }
      },
    };
  };
})(typeof window !== 'undefined' ? window : globalThis);
