import {smokeWindow} from './smoke-core.mjs';

const HOUR=3600000,iso=t=>new Date(t).toISOString();
export const STOP_SMOKE_METHOD='2026-10-30.1';

// An explicit interpolation experiment at a stationary model point. Never join
// different locations/runs, extrapolate, or bridge an absent hourly endpoint.
export function stopSmoke(product,stop,departure,limit=null,now=Date.now()){
  const start=departure+stop.arrival_elapsed*1000,end=departure+stop.departure_elapsed*1000;
  const base={method:STOP_SMOKE_METHOD,stop_index:stop.index,start:Number.isFinite(start)?iso(start):null,end:Number.isFinite(end)?iso(end):null,
    snapped_coordinate:stop.coordinate,source_point:product?.point??null,
    duration_minutes:Number.isFinite(end-start)?(end-start)/60000:null,covered_minutes:0,unknown_minutes:null,complete:false,
    mean_ug_m3:null,minutes_above_limit:null,limit_ug_m3:limit,segments:[],source:null,
    assumption:'Linear interpolation between adjacent hourly instantaneous RAP samples at one rounded stationary point; not measured or validated personal exposure.',reason:null};
  if(!Number.isFinite(start)||!Number.isFinite(end)||start<now||end>now+76*HOUR||end<=start||end-start>2*HOUR)return {...base,reason:'Stop is outside the supported forecast horizon or duration'};
  base.unknown_minutes=base.duration_minutes;
  const source=smokeWindow(product,{lat:stop.coordinate?.[1],lon:stop.coordinate?.[0]},start,end,limit,now);
  base.source=source;
  if(!source.fresh)return {...base,reason:source.reason||'Smoke forecast unavailable'};
  let area=0,above=0,covered=0;
  for(let i=1;i<source.samples.length;i++){
    const a=source.samples[i-1],b=source.samples[i],t0=Date.parse(a.at),t1=Date.parse(b.at),left=Math.max(start,t0),right=Math.min(end,t1);
    if(right<=left)continue;
    const segment={start:iso(left),end:iso(right),minutes:(right-left)/60000,source_samples:[a,b],start_ug_m3:null,end_ug_m3:null,integral_ug_h_m3:null,minutes_above_limit:null,reason:null};
    if(t1-t0!==HOUR||a.smoke_ug_m3===null||b.smoke_ug_m3===null){segment.reason='Missing or invalid adjacent hourly samples';base.segments.push(segment);continue;}
    const delta=b.smoke_ug_m3-a.smoke_ug_m3,x=a.smoke_ug_m3+delta*(left-t0)/HOUR,y=a.smoke_ug_m3+delta*(right-t0)/HOUR;
    segment.start_ug_m3=x;segment.end_ug_m3=y;segment.integral_ug_h_m3=(x+y)/2*(right-left)/HOUR;
    if(limit!==null){const fraction=x===y?(x>limit?1:0):Math.max(0,Math.min(1,(Math.max(x,y)-limit)/Math.abs(y-x)));segment.minutes_above_limit=segment.minutes*fraction;above+=segment.minutes_above_limit;}
    covered+=segment.minutes;area+=segment.integral_ug_h_m3;base.segments.push(segment);
  }
  base.covered_minutes=covered;base.unknown_minutes=Math.max(0,base.duration_minutes-covered);base.complete=base.unknown_minutes<1e-7;
  // A partial mean could look better merely because a smoky interval is missing.
  if(base.complete){base.mean_ug_m3=area/(base.duration_minutes/60);base.minutes_above_limit=limit===null?null:above;}
  else base.reason='Incomplete hourly coverage; whole-stop estimates withheld';
  return base;
}

export function journeyStopSmoke(route,samples,products,departure,limit,now){
  return (route.stops||[]).filter(stop=>stop.duration>0).map(stop=>{
    const i=samples.findIndex(sample=>sample.stop_index===stop.index);
    return stopSmoke(i<0?null:products[i],stop,departure,limit,now);
  });
}
