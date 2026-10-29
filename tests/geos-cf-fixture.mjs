import {readFileSync} from 'node:fs';
import {GEOS_METHOD,GEOS_FIELDS,geosMetadata,geosCell} from '../public/geos-cf-core.mjs';
const raw=JSON.parse(readFileSync(new URL('./fixtures/geos-cf-source.json',import.meta.url),'utf8'));
export const GEOS_TEST_NOW=Date.parse('2026-10-29T20:15:00Z');
// PM2.5 and ozone are captured responses. The other fields are synthetic test
// values with the same grid/time shape, not evidence of live gas concentrations.
export function geosFixture(){const meta=geosMetadata(raw.metadata);return {method:GEOS_METHOD,model:'geos_cf_v2',...geosCell(39,-77),initialized_at:meta.initialized_at,source_url:meta.source_url,first_index:35,count:49,checked_at:new Date(GEOS_TEST_NOW).toISOString(),revision:'geos-fixture',raw:{metadata:raw.metadata,axis:raw.axis,series:Object.fromEntries(Object.keys(GEOS_FIELDS).map(key=>[key,(key.startsWith('pm')?raw.pm25:raw.o3).replace(/^[^,]+/,key)]))}};}
