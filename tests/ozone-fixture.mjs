export const HOUR=3600000,now=Date.parse('2026-10-29T06:30:00Z'),target=Date.parse('2026-10-29T05:00:00Z');
export const monitor={id:'110010043',geometry:{type:'Point',coordinates:[-77,39]},properties:{name:'Monitor',agency:'EPA'},distance_km:0};
export const reading=(at=target,value=20,id=at)=>({type:'Feature',id,geometry:structuredClone(monitor.geometry),properties:{ObjectId:id,AQSID:monitor.id,SiteName:'Monitor',DataSource:'EPA',ValidTime:at,OZONE:value,OZONE_AQI:42,OZONE_Measured:1,OZONE_Unit:'PPB',Status:'Active'}});
export const observations=(features=[reading()],checked=now)=>({type:'FeatureCollection',monitor_id:monitor.id,revision:'observations',checked_at:new Date(checked).toISOString(),features,source_url:'https://services.arcgis.com/ozone',updated:null});
