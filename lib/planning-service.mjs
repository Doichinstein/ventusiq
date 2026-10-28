import {pointKey} from './weather-service.mjs';
export class PlanningService{
  constructor(weather){this.weather=weather;}
  async grid(lat,lon){
    pointKey(lat,lon);const forecast=await this.weather.forecast(lat,lon),url=forecast.metadata?.properties?.forecastGridData;
    if(!/^https:\/\/api\.weather\.gov\/gridpoints\/[A-Z]{3}\/-?\d+,-?\d+$/.test(url||''))throw Error('NWS grid forecast unavailable for this place');
    const name='planning/grid/'+url.split('/gridpoints/')[1];
    if(!(await this.weather.state(name)).name){const count=await this.weather.statement("SELECT COUNT(*) AS n FROM datasets WHERE name LIKE 'planning/grid/%'").first();if(count.n>=1000)throw Error('Shared planning grid cache is at capacity. Try an existing place.');}
    const r=await this.weather.collect(name,600,async signal=>{const grid=await this.weather.source(url,signal);if(grid?.type!=='Feature'||!grid.properties||!Number.isFinite(Date.parse(grid.properties.updateTime)))throw Error('NWS grid response has no valid issue time');return {grid,source_url:url};});
    return {...r.data,revision:r.revision,collected_at:r.collected_at,checked_at:r.checked_at,issued_at:r.data.grid.properties.updateTime,stale:r.stale,error:r.error};
  }
}
