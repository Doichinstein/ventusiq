import {hash} from './archive-codec.mjs';
export class PlacesError extends Error{constructor(message,status=400){super(message);this.status=status;}}
const uuid=value=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
export function validatePlaces(input){if(!Array.isArray(input)||input.length>12)throw new PlacesError('Choose up to 12 places');const ids=new Set();return input.map(p=>{if(!p||!uuid(p.id)||ids.has(p.id)||typeof p.name!=='string'||!p.name.trim()||p.name.trim().length>60||/[\u0000-\u001f\u007f]/.test(p.name)||typeof p.lat!=='number'||!Number.isFinite(p.lat)||Math.abs(p.lat)>90||typeof p.lon!=='number'||!Number.isFinite(p.lon)||Math.abs(p.lon)>180)throw new PlacesError('Invalid or duplicated place');ids.add(p.id);return {id:p.id,name:p.name.trim(),lat:p.lat,lon:p.lon};});}
export class PlacesService{
  constructor(weather){this.weather=weather;}
  async account(owner){if(!owner)throw new PlacesError('Sign in to use account places',401);return hash({scope:'ventusiq-places',owner});}
  async get(owner){const account_key=await this.account(owner),row=await this.weather.statement('SELECT * FROM place_libraries WHERE owner=?',owner).first();return {authenticated:true,account_key,revision:row?.revision||null,places:row?JSON.parse(row.places):[],updated_at:row?new Date(row.updated_at*1000).toISOString():null};}
  async replace(owner,input){const account=await this.account(owner);if(input.account_key!==account)throw new PlacesError('Account changed. Reopen account places before editing.',409);if(!uuid(input.mutation_id)||(input.revision!==null&&!uuid(input.revision)))throw new PlacesError('Invalid place revision');const places=validatePlaces(input.places),payload=JSON.stringify(places),now=this.weather.clock();
    const prior=await this.weather.statement('SELECT * FROM place_libraries WHERE owner=?',owner).first();if(prior?.revision===input.mutation_id){if(prior.places!==payload)throw new PlacesError('Mutation identifier was already used',409);return this.get(owner);}
    let changed;if(input.revision===null)changed=await this.weather.statement('INSERT OR IGNORE INTO place_libraries(owner,revision,places,updated_at) SELECT ?,?,?,? WHERE (SELECT COUNT(*) FROM place_libraries)<2000 RETURNING owner',owner,input.mutation_id,payload,now).first();
    else changed=await this.weather.statement('UPDATE place_libraries SET revision=?,places=?,updated_at=? WHERE owner=? AND revision=? RETURNING owner',input.mutation_id,payload,now,owner,input.revision).first();
    if(!changed){const current=await this.weather.statement('SELECT revision FROM place_libraries WHERE owner=?',owner).first();if(!current&&input.revision===null)throw new PlacesError('Public account-place capacity reached',503);throw new PlacesError('Places changed on another device. Refresh and try your edit again.',409);}return this.get(owner);
  }
}
