import {test} from 'node:test';
import assert from 'node:assert/strict';
import {arcgis,SOURCES,loadFires,loadAir,loadPerimeters,sourceFetch,incidentId,stamp,nearest,observationFresh,aqiCategory,satelliteMetadata,SATELLITE_LAYER} from '../public/hazards-core.mjs';
const point=(id,properties={},coordinates=[-122,37])=>({type:'Feature',id,geometry:{type:'Point',coordinates},properties:{OBJECTID:id,...properties}});
const response=data=>({ok:true,json:async()=>data});
const fetchCollection=features=>async url=>response(url.includes('/query?')?{type:'FeatureCollection',features}:{editingInfo:{lastEditDate:1793200000000}});
test('ArcGIS follows actual page sizes and rejects duplicate or incomplete pagination',async()=>{
  const offsets=[];const fetcher=async url=>{if(!url.includes('/query?'))return response({});const offset=new URL(url).searchParams.get('resultOffset');offsets.push(offset);return response({type:'FeatureCollection',features:offset==='0'?[point(1),point(2)]:[point(3)],properties:{exceededTransferLimit:offset==='0'}});};
  assert.equal((await arcgis(SOURCES.fires,{},fetcher)).features.length,3);assert.deepEqual(offsets,['0','2']);
  await assert.rejects(arcgis(SOURCES.fires,{},async url=>response(url.includes('/query?')?{type:'FeatureCollection',features:[point(1)],exceededTransferLimit:true}:{})),/duplicate/);
  await assert.rejects(arcgis(SOURCES.fires,{},async url=>response(url.includes('/query?')?{type:'FeatureCollection',features:[],exceededTransferLimit:true}:{})),/Incomplete/);
});
test('fire records preserve unknown containment and zero area while omitting invalid points',async()=>{
  const data=await loadFires(fetchCollection([point(1,{IncidentName:'Test',IncidentSize:0,PercentContained:null}),point(2,{},[999,37])]));
  assert.equal(data.features.length,1);assert.equal(data.omitted_geometry,1);assert.equal(data.features[0].properties.contained,null);assert.equal(data.features[0].properties.acres,0);
  assert.equal(stamp(1e100),null);assert.equal(stamp(-1),null);
});
test('air adapter requests measured monitors, preserves zero, rejects invalid units and missing AQI',async()=>{
  let query;const fetcher=async url=>{if(url.includes('/query?'))query=new URL(url).searchParams;return fetchCollection([point(1,{AQSID:'a',PM25:0,PM25_AQI:0,PM25_Unit:'UG/M3',ValidTime:1793200000000}),point(2,{PM25:10,PM25_AQI:null,PM25_Unit:'unknown'})])(url);};
  const data=await loadAir(fetcher);assert.equal(query.get('where'),'PM25_Measured = 1');assert.equal(data.features[0].properties.pm25,0);assert.equal(data.features[0].properties.aqi,0);assert.equal(data.features[1].properties.aqi,null);assert.equal(data.features[1].properties.pm25,null);
  assert.equal(aqiCategory(null).label,'Unavailable');assert.equal(aqiCategory(0).label,'Good');assert.equal(aqiCategory(151).label,'Unhealthy');
});
test('unknown, old and future observations cannot become a current nearby reading',()=>{
  const now=Date.parse('2026-10-28T20:00:00Z');
  for(const observed_at of [null,'bad','2026-10-28T16:59:00Z','2026-10-28T20:11:00Z'])assert.equal(observationFresh(point(1,{observed_at}),now),false);
  assert.equal(observationFresh(point(1,{observed_at:'2026-10-28T19:00:00Z'}),now),true);
  const matches=nearest([point(1,{},[179.9,0]),point(2,{},[100,0])],{lat:0,lon:-179.9},{maxKm:50});assert.equal(matches.length,1);assert.ok(matches[0].distance_km<23);
});
test('perimeter lookups accept only GUIDs and retain reported boundary timestamps',async()=>{
  const id='3b981943-ef8c-431b-96c9-33eb7eadd510';assert.equal(incidentId('{'+id.toUpperCase()+'}'),id);
  await assert.rejects(loadPerimeters("' OR 1=1",()=>{throw new Error('Must not fetch');}),/Invalid/);
  const feature={...point(1,{poly_DateCurrent:1793200000000,poly_GISAcres:50}),geometry:{type:'Polygon',coordinates:[[[-122,37],[-121,37],[-122,38],[-122,37]]]}};
  const data=await loadPerimeters(id,fetchCollection([feature]));assert.equal(data.features[0].properties.updated_at,'2026-10-28T15:06:40.000Z');assert.equal(data.data_kind,'reported-perimeter');
});
test('satellite day comes from the selected provider layer and invalid dates fail closed',()=>{
  const xml='<Layer><Identifier>other</Identifier><Default>2026-10-28</Default></Layer><Layer><Identifier>'+SATELLITE_LAYER+'</Identifier><Default>2026-10-27</Default></Layer>';
  assert.equal(satelliteMetadata(xml).date,'2026-10-27');assert.throws(()=>satelliteMetadata(xml.replace('2026-10-27','2026-02-30')),/unavailable/);assert.throws(()=>satelliteMetadata('<Layer/>'),/unavailable/);
});
test('hazard adapters refuse untrusted URLs and provider errors',async()=>{
  await assert.rejects(sourceFetch(SOURCES.fires+'.evil.test',null,()=>{throw new Error('Must not fetch');}),/Untrusted/);
  await assert.rejects(loadFires(async()=>response({error:{message:'Query failed'}})),/rejected/);
});
