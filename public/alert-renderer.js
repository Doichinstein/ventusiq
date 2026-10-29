/* Incremental map rendering. Apache-2.0. Pending work always follows the latest view. */
(function(root) {
  'use strict';
  root.createAlertRenderer = function({create, remove, restyle, front, progress,
    schedule = fn => setTimeout(fn, 0), now = () => performance.now(), budget = 8}) {
    const rendered = new Map();
    let desired = [], pending = [], selected = null, scheduled = false;
    const label = f => [f.properties.severity, f.properties.event, f.properties.areaDesc].join('\n');
    function report() { progress({drawn:rendered.size, pending:pending.length}); }
    function order() {
      // Input order is most severe first. Selected geometry is always on top.
      for (let i=desired.length-1;i>=0;i--) {
        const entry=rendered.get(desired[i].id); if(entry) front(entry.layer);
      }
      const entry=rendered.get(selected); if(entry) front(entry.layer);
    }
    function pump() {
      scheduled=false;
      const started=now();
      while(pending.length) {
        const feature=pending.shift(), layer=create(feature);
        rendered.set(feature.id,{layer,geometry:feature.geometry,label:label(feature),selected:feature.id===selected});
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
        pending=features.filter(f=>!rendered.has(f.id)).reverse();
        const priority=pending.findIndex(f=>f.id===selected);
        if(priority>0) pending.unshift(pending.splice(priority,1)[0]);
        // A scheduled callback consumes this replacement queue, never an older filter/replay.
        if(!scheduled) pump(); else { order(); report(); }
      },
    };
  };
})(typeof window !== 'undefined' ? window : globalThis);
