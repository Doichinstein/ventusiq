import {timelineEntries} from '../public/events-core.mjs';
import {eventAreas} from './event-areas.mjs';
export async function archivedEventMap(weather,story){
  const entries=timelineEntries(story),selected=[...entries].reverse().find(t=>t.present!==0)||entries.at(-1);
  if(!selected)return {type:'FeatureCollection',features:[],missing:['No recorded transitions'],as_of:story.as_of};
  const [area]=await eventAreas(weather,[{feature:selected.feature,message_id:selected.id,revision:selected.revision,collected_at:selected.at}],{historical:true,cutoff:Date.parse(story.as_of)});
  return {type:'FeatureCollection',as_of:story.as_of,kind:area.kind,complete:area.complete,missing:area.missing,
    features:area.geometries.map(g=>({type:'Feature',geometry:g.geometry,properties:{event:selected.feature.properties.event,source_url:g.source_url,revision:g.revision,checked_at:g.checked_at}}))};
}
