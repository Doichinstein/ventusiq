import {gustIntervals} from './planning-core.mjs';
export const JOURNEY_METHOD='2026-10-29.2';
const timestamp=value=>typeof value==='string'&&/(Z|[+-]\d{2}:\d{2})$/.test(value)?Date.parse(value):NaN;
export function gustLimit(value){if(value===null||value===undefined||String(value).trim()==='')return null;const n=Number(value);if(!Number.isFinite(n)||n<0||n>250)throw Error('Choose a gust limit between 0 and 250 mph, or leave it blank.');return n;}
export function gustEvidence(data){const p=data?.grid?.properties;return {...data,grid:data?.grid?{id:data.grid.id,properties:{gridId:p?.gridId,gridX:p?.gridX,gridY:p?.gridY,updateTime:p?.updateTime,windGust:p?.windGust}}:null};}
export function journeyGust(data,forecast,at,now){
  const result={value:null,reason:null,revision:data?.revision||null,checked_at:data?.checked_at||null,issued_at:data?.issued_at||null,source_url:data?.source_url||null,source_unit:data?.grid?.properties?.windGust?.uom||null,interval:null,error:data?.error||null};
  const unknown=reason=>({...result,reason}),checked=timestamp(data?.checked_at),issued=timestamp(data?.issued_at),expected=forecast?.metadata?.properties?.forecastGridData,match=/^https:\/\/api\.weather\.gov\/gridpoints\/([A-Z]{3})\/(-?\d+),(-?\d+)$/.exec(expected||'');
  if(!data||data.error||data.stale)return unknown(data?.error||'Gust forecast unavailable or delayed');
  if(!Number.isFinite(checked)||checked>now+60000||now-checked>900000||!Number.isFinite(issued)||issued>now+60000||now-issued>86400000)return unknown('Gust issue or collection time is missing, delayed or future-dated');
  const p=data.grid?.properties;if(!match||data.source_url!==expected||data.grid?.id!==expected||p?.gridId!==match[1]||p?.gridX!==Number(match[2])||p?.gridY!==Number(match[3])||timestamp(p?.updateTime)!==issued)return unknown('Gust grid identity does not match this route sample');
  const matches=gustIntervals(data).filter(v=>v.start<=at&&v.end>at);if(matches.length!==1)return unknown(matches.length?'Overlapping gust intervals are ambiguous':'No valid gust interval covers arrival');
  const selected=matches[0];result.interval={start:new Date(selected.start).toISOString(),end:new Date(selected.end).toISOString(),raw:selected.source};if(selected.value===null||selected.value>250)return {...result,reason:'Gust value or units are unavailable or invalid'};
  return {...result,value:selected.value};
}
