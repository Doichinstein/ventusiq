import {eventAt,eventPolygon,observationContext} from './event-observations.mjs';
export {eventAt,eventPolygon};
export function gaugeProduct(){return {metadata:{lid:'TEST1',name:'Test river',latitude:30,longitude:-100,flood:{stageUnits:'ft',categories:{action:{stage:5},minor:{stage:10}}},datums:{vertical:{value:[{abbrev:'NAVD88',value:100}]}}},series:{observed:{primaryName:'Stage',primaryUnits:'ft',issuedTime:eventAt(0),data:[{validTime:eventAt(-1.5),primary:4},{validTime:eventAt(-1),primary:12},{validTime:eventAt(-.5),primary:8}]},forecast:{primaryName:'Stage',primaryUnits:'ft',issuedTime:eventAt(0),data:[{validTime:eventAt(1),primary:90}]}},checked_at:eventAt(0)};}
export function context(){const c=observationContext();c.scope.windows[0].event='Flood Warning';return c;}
