import {mountGeocode} from './geocode.js';

// Reparent existing controls/results so their source modules keep their IDs and
// listeners. Inputs belong above the one persistent map; results stay beside it.
export function mountWorkspaceExplorer({document,window,fetcher,clock}){
  const get=id=>document.getElementById(id),el=(tag,text,cls)=>{const n=document.createElement(tag);if(text)n.textContent=text;if(cls)n.className=cls;return n;};
  const entry=get('map-entry');if(!entry)return null;
  function entryPanel(mode,title){const panel=el('section',null,'map-entry-panel');panel.dataset.entry=mode;panel.setAttribute('aria-label',title);entry.append(panel);return panel;}
  function group(parent,title,nodes,description=''){
    nodes=nodes.filter(Boolean);if(!nodes.length)return null;
    const details=el('details',null,'result-group');details.dataset.resultGroup='';
    const summary=el('summary'),name=el('span',title,'result-group-title');summary.append(name);if(description)summary.append(el('small',description));details.append(summary);
    const body=el('div',null,'result-group-body');body.append(...nodes);details.append(body);parent.append(details);return details;
  }
  function directCards(parent){return [...parent.children].filter(n=>n.matches('section.weather-card, details.weather-card'));}
  function collapse(panel){
    for(const d of panel.querySelectorAll('details[data-result-group], details[data-result-group] details'))d.open=false;
    const matches=panel.id==='river-detail'?get('river-list'):panel.id==='event-detail'?get('event-list'):null;
    const matchGroup=matches?.closest('details[data-result-group]');if(matchGroup)matchGroup.open=false;
  }
  const personal=entryPanel('personal','Choose a weather location');personal.append(get('address-card'));
  personal.classList.add('compact-entry');get('address-card').querySelector('h2').classList.add('sr-only');
  get('address-form').querySelector('label').textContent='Location';
  get('address-form').querySelector('label').classList.add('sr-only');
  get('address-input').placeholder='US address or lat, lon';
  const personalPanel=get('personal-workspace'),place=get('place-content'),aside=personalPanel.querySelector('.places-panel');
  get('personal-entry-actions').append(get('pick-on-map'),get('use-location'));
  const saved=el('details',null,'entry-saved entry-more'),savedBody=el('div');saved.append(el('summary','Saved places & options'),savedBody);
  savedBody.append(get('place-storage-note'),get('place-list'),get('place-form'),get('address-clear'),get('address-card').querySelector('.entry-help'));
  get('personal-entry-actions').append(saved);personal.append(get('place-message'));
  // The map already explains how to choose a place. Reserve the live status
  // row for lookup progress, errors and selected-location evidence.
  get('address-status').textContent='';
  get('pick-on-map').className='text-button';get('use-location').className='text-button';
  for(const id of ['place-lat','place-lon']){get(id).type='hidden';get(id).required=false;}
  get('place-form').querySelector('.coordinate-fields').hidden=true;
  const notificationNodes=[get('updates-card'),get('watches-card'),get('push-card'),get('webhooks-card'),get('notify-enable'),get('notify-status')];
  for(const n of notificationNodes.filter(Boolean))n.remove();
  aside.remove();personalPanel.querySelector('.personal-title').remove();
  place.querySelector('.workspace-jumps')?.remove();
  const hourly=get('hourly-body').closest('section');
  group(place,'Alerts & hourly weather',[place.querySelector('.brief-grid'),hourly],'Relevant alerts and the next 48 hours');
  group(place,'Activity planning',[get('activity-card')],'Find a forecast window for your plans');
  group(place,'Fire, smoke & air quality',['place-hazards-card','smoke-card','hrrr-card','air-forecast-card','geos-cf-card','air-trend-card','ozone-card','pm-comparison-card'].map(get),'Nearby observations and modeled conditions');
  group(place,'Rivers & watersheds',['place-rivers-card','watershed-card'].map(get),'Gauge readings and upstream context');
  group(place,'Forecast confidence & observations',['observation-card','ensemble-card','forecast-stability-card','hrrr-temperature-card'].map(get),'Compare forecasts with other evidence');
  group(place,'History & comparable days',['analog-card','station-history-card','station-analogs-card','storm-history-card'].map(get),'Historical observations and reported impacts');
  group(place,'Compound hazards',[get('compound-card')],'Conditions that overlap');
  group(place,'Changes, watches & notifications',notificationNodes,'Optional tracking and delivery');
  group(place,'More weather tools',directCards(place));

  const journey=entryPanel('journey','Choose journey endpoints');journey.classList.add('compact-entry');journey.append(el('h2','Plan a journey','sr-only'),get('journey-form'));
  const options=get('journey-options'),extraActions=el('div',null,'entry-actions');
  options.classList.add('entry-more');options.querySelector('summary').textContent='Route options';
  options.querySelector('summary').title='Departure, saved places, stops and route settings';
  for(const [side,number] of [['from',1],['to',2]]){
    const input=get(`journey-${side}-query`),point=input.parentElement,row=el('div',null,'entry-point-row'),mapButton=get(`journey-${side}-map`);
    point.querySelector('label').textContent=`Point ${number}`;input.placeholder='US address or lat, lon';
    point.insertBefore(row,input);row.append(input,mapButton);mapButton.textContent='Map';mapButton.setAttribute('aria-label',`Pick point ${number} on map`);mapButton.title=`Pick point ${number} on map`;
    extraActions.append(get(`journey-${side}-search`));point.querySelector('.entry-actions').remove();
  }
  get('journey-entry-actions').append(get('journey-submit'),options);
  const journeyFooter=el('div',null,'entry-footer');
  get('journey-form').append(journeyFooter);journeyFooter.append(get('journey-entry-actions'),get('journey-pick-status'));
  const reset=el('button','Clear points','text-button');reset.id='journey-clear-points';reset.type='button';extraActions.append(get('journey-example'),reset);options.append(extraActions);
  get('journey-example').textContent='Try Washington → Baltimore';
  get('journey-from-place').parentElement.firstChild.textContent='Point 1 from saved places';
  get('journey-to-place').parentElement.firstChild.textContent='Point 2 from saved places';
  get('journey-options').append(el('p','Driving routes up to 2,000 km; driving plus stops up to 24 hours. Selecting two map points starts a comparison. Coordinates are sent to the routing provider and routes are cached on the shared server. Place names and stop durations are not sent to that provider.','small'));
  const journeyPanel=get('journey-workspace'),journeyAside=journeyPanel.querySelector('.places-panel');
  const routingSource=get('journey-routing-provider')?.parentElement;if(routingSource)get('journey-options').append(routingSource);
  journeyAside?.remove();journeyPanel.querySelector('.personal-title')?.remove();
  const result=get('journey-results'),children=[...result.children],hourlyBox=get('journey-weather-body').closest('.hourly-scroll');
  group(result,'Departure comparisons',[get('journey-comparisons')],'Compare the chosen time and two later departures');
  group(result,'Weather along the route',[get('journey-stop-weather'),hourlyBox.previousElementSibling?.previousElementSibling,hourlyBox.previousElementSibling,hourlyBox]);
  group(result,'Current alert overlaps',[get('journey-alerts').previousElementSibling?.previousElementSibling,get('journey-alerts').previousElementSibling,get('journey-alerts')]);
  group(result,'Roads, stops & work zones',[get('journey-stop-summary'),children.find(n=>n.tagName==='DETAILS'),get('journey-roadwork-results')]);
  group(result,'Smoke forecast',[get('journey-smoke-results')]);
  group(result,'Coverage, sources & export',[get('journey-route-note'),get('journey-coverage'),get('journey-evaluated'),get('journey-export'),...children.filter(n=>n.tagName==='P'&&!n.id&&n.parentElement===result)]);

  const rivers=entryPanel('rivers','Find river gauges');rivers.append(el('h2','Explore rivers'),get('river-region-form'),get('river-id-form'));
  const riverPanel=get('river-workspace'),riverActions=riverPanel.querySelector('.personal-title .place-actions');rivers.append(riverActions);
  riverPanel.querySelector('.personal-title').remove();const riverAside=riverPanel.querySelector('.places-panel');
  group(riverPanel,'Nearby gauges',[riverAside],'Select a gauge from the search results');
  // Keep matches before a selected gauge's details.
  riverPanel.prepend(riverPanel.lastElementChild);
  const riverDetail=get('river-detail');group(riverDetail,'Levels & forecast',[get('river-summary')]);
  for(const card of directCards(riverDetail))group(riverDetail,card.querySelector('h3')?.textContent||'Gauge details',[card]);

  const events=entryPanel('events','Find archived weather events');events.append(el('h2','Explore past events'),get('event-search-form'),get('event-refresh'));
  const eventPanel=get('event-workspace');eventPanel.querySelector('.personal-title').remove();const eventAside=eventPanel.querySelector('.places-panel');
  group(eventPanel,'Matching events',[eventAside],'Open a collected alert to inspect its history');eventPanel.prepend(eventPanel.lastElementChild);
  const eventDetail=get('event-detail');
  for(const card of directCards(eventDetail)){
    if(card.tagName==='DETAILS'){card.classList.add('result-group');card.dataset.resultGroup='';card.open=false;continue;}
    group(eventDetail,card.querySelector('h3')?.textContent||'Event evidence',[card]);
  }
  group(eventDetail,'Alert timeline',[get('event-timeline')],'Official messages and recorded changes');
  let placeId=null;
  window.WeatherExplorer={collapse,placeChanged(p){if(p?.id!==placeId){placeId=p?.id||null;collapse(place);}}};
  const inputs=mountGeocode({document,window,fetcher,clock});
  window.WeatherLocations?.syncPlace(window.WeatherPersonal.current());
  return {inputs,collapse};
}
if(typeof window!=='undefined'){const start=()=>mountWorkspaceExplorer({document,window});if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();}
