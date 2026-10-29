/* VentusIQ personal workspace. Apache-2.0. Device-local preferences, public sources. */
(function(){
  'use strict';
  const core=window.WeatherCore, get=id=>document.getElementById(id), mode=window.WEATHER_CONFIG?.mode||'direct';
  const key='ventusiq.personal.v1', forecasts=new Map(), baselines=new Map(), inFlight=new Set(), retryAt=new Map();
  let accountPlaces=null, scopeGeneration=0;
  const listPlaces=()=>accountPlaces??stored.places;
  let selected=null, personal=false, updates=[], notificationPermission='default';
  let stored={places:[],preferences:{duration:2,minTemp:40,maxTemp:85,wind:15,rain:30}};
  try{const value=JSON.parse(localStorage.getItem(key));if(value?.version===1){stored={places:(Array.isArray(value.places)?value.places:[]).filter(p=>p&&typeof p.id==='string'&&typeof p.name==='string'&&core.coordinate(p.lat,p.lon)).slice(0,12),preferences:{...stored.preferences,...value.preferences},notifications:value.notifications===true};}}catch{}
  if(stored.notifications&&typeof Notification!=='undefined')notificationPermission=Notification.permission;
  const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
  function save(){try{localStorage.setItem(key,JSON.stringify({...stored,version:1}));}catch{get('place-message').textContent='Device storage is unavailable. Keep this page open to retain places.';}}
  function current(){return listPlaces().find(p=>p.id===selected);}
  function timezone(){return forecasts.get(selected)?.metadata?.properties?.timeZone;}
  function stale(data){return !data||data.stale||!data.checked_at||Date.now()-Date.parse(data.checked_at)>900000;}
  function time(stamp,full=true){try{return new Date(stamp).toLocaleString(undefined,{timeZone:timezone(),...(full?{weekday:'short',month:'short',day:'numeric'}:{}),hour:'numeric',minute:'2-digit',timeZoneName:'short'});}catch{return new Date(stamp).toLocaleString();}}
  function show(value){window.WeatherRivers?.hide();window.WeatherEvents?.hide();window.WeatherJourney?.hide();personal=value;get('personal-workspace').hidden=!value;get('map-workspace').hidden=value;get('map-timeline').hidden=value;window.WeatherHazards?.showMap(!value);for(const [id,on] of [['nav-personal',value],['nav-map',!value]]){get(id).classList.toggle('nav-active',on);get(id).setAttribute('aria-pressed',String(on));}if(!value)window.WeatherMap?.show();else render();}
  function places(){get('place-list').replaceChildren(...listPlaces().map(p=>{const b=el('button',p.name,'place-choice');b.setAttribute('aria-pressed',String(p.id===selected));b.onclick=()=>{selected=p.id;places();render();load(p);};return b;}));}
  async function json(url){const response=await fetch(url,{headers:{Accept:'application/geo+json, application/json'},signal:AbortSignal.timeout(30000)});if(!response.ok)throw new Error(`Source returned HTTP ${response.status}`);return response.json();}
  async function forecast(place){
    if(mode!=='direct')return json(`/api/forecast?lat=${place.lat}&lon=${place.lon}`);
    const metadata=await json(`https://api.weather.gov/points/${place.lat.toFixed(4)},${place.lon.toFixed(4)}`);
    const url=metadata.properties?.forecastHourly;
    if(!/^https:\/\/api\.weather\.gov\/gridpoints\/[^/]+\/[^/]+\/forecast\/hourly$/.test(url||''))throw new Error('NWS hourly forecasts are unavailable at this point');
    const data=await json(url);
    if(!Array.isArray(data.properties?.periods)||!data.properties.periods.length)throw new Error('Hourly forecast is incomplete');
    const now=new Date().toISOString();
    return {metadata,forecast:data,source_url:url,issued_at:data.properties.updateTime,collected_at:now,checked_at:now,stale:false};
  }
  function addUpdates(place,changes){
    if(!changes.length)return;
    const now=new Date().toISOString();
    updates=[...changes.map(c=>({...c,place:place.id,received:now})),...updates].slice(0,200);
    if(notificationPermission==='granted' && typeof Notification!=='undefined'){
      try{const n=new Notification(`VentusIQ · ${place.name}`,{body:changes.slice(0,2).map(c=>c.text).join('\n'),tag:`ventusiq-${place.id}`,icon:'/assets/ventusiq-icon.png'});n.onclick=()=>{window.focus();selected=place.id;places();show(true);};}catch{get('notify-status').textContent='Desktop delivery is unavailable. Updates remain in this page.';}
    }
  }
  function applyAlerts(place){
    const live=window.WeatherMap?.live(), data=forecasts.get(place.id);
    // No baseline from an absent source or a stale cached forecast/zone lookup.
    if(!live||!data||stale(data)||Date.now()-Date.parse(live.collected_at)>240000)return;
    const alerts=core.relevantAlerts(live.features,place,data.metadata);
    addUpdates(place,core.alertChanges(baselines.get(place.id)??null,alerts));
    baselines.set(place.id,alerts);
  }
  async function load(place){
    if(inFlight.has(place.id)||Date.now()<(retryAt.get(place.id)||0))return;
    const scope=scopeGeneration;
    inFlight.add(place.id);retryAt.set(place.id,Date.now()+600000);
    if(place.id===selected)get('forecast-status').textContent='Loading the official hourly forecast…';
    try{
      const data=await forecast(place);
      if(scope!==scopeGeneration||!listPlaces().some(p=>p.id===place.id&&p.lat===place.lat&&p.lon===place.lon))return;
      const previous=forecasts.get(place.id);
      if(!data.stale)addUpdates(place,core.forecastChanges(previous,data));
      forecasts.set(place.id,data);applyAlerts(place);
    }catch(error){
      if(scope!==scopeGeneration)return;
      const cached=forecasts.get(place.id);
      forecasts.set(place.id,{...cached,stale:true,error:error.message});retryAt.set(place.id,Date.now()+120000);
    }finally{if(scope===scopeGeneration){inFlight.delete(place.id);if(place.id===selected)render();}}
  }
  function renderAlerts(place,data){
    const target=get('place-alerts'), live=window.WeatherMap?.live();
    if(!live){target.replaceChildren(el('p','Alert feed is unavailable. Check official sources.'));return;}
    const relevant=core.relevantAlerts(live.features,place,data?.metadata);
    const nodes=[];
    const delayed=Date.now()-Date.parse(live.collected_at)>240000;
    if(delayed)nodes.push(el('p','Alert collection is delayed. This is the last available coverage.','warning-note'));
    if(!data?.metadata)nodes.push(el('p','Zone matching is unavailable until the location loads. Only explicit alert polygons can be checked.','warning-note'));
    if(!relevant.length)nodes.push(el('p',data?.metadata?'No matching alerts in the available collection.':'No matching alert polygons; zone coverage is unknown.'));
    for(const alert of relevant){const box=el('article',undefined,'local-alert'),p=alert.properties;box.append(el('h3',p.event),el('p',`${alert.coverage} · ${p.severity||'Unknown severity'}`,'small'));if(p.onset)box.append(el('p',`Onset ${time(p.onset)}`,'small'));if(p.instruction)box.append(el('p',p.instruction,'official-instructions'));const a=el('a','Official alert ↗');a.href=alert.id.startsWith('https://api.weather.gov/alerts/')?alert.id:'https://www.weather.gov/';a.target='_blank';a.rel='noopener';box.append(a);nodes.push(box);}
    nodes.push(el('p',`Collected ${time(live.collected_at)}`,'small'));
    target.replaceChildren(...nodes);
  }
  function renderUpdates(){
    const changes=updates.filter(c=>c.place===selected).slice(0,20);
    get('place-updates').replaceChildren(...(changes.length?changes.map(c=>{const box=el('div',undefined,'personal-update');box.append(el('p',c.text),el('small',`${time(c.received)}${c.at?' · Forecast for '+time(c.at):''}`));for(const field of c.fields||[])if(['onset','ends','expires'].includes(field.field))box.append(el('p',`${field.label}: ${field.before?time(field.before):'unspecified'} → ${field.after?time(field.after):'unspecified'}`,'small'));return box;}):[el('p','No meaningful changes since monitoring began. The first successful check establishes a baseline.')]));
  }
  function renderPlan(){
    if(window.WeatherPlanner){window.WeatherPlanner.refresh();return;}
    const data=forecasts.get(selected), target=get('plan-results');
    if(!data?.forecast){target.replaceChildren(el('p','Planning needs an hourly forecast.'));return;}
    if(stale(data)){target.replaceChildren(el('p','Planning is paused while the forecast is stale. Last available hours remain below.','warning-note'));return;}
    let windows;try{windows=core.plan(data,stored.preferences);}catch(error){target.replaceChildren(el('p',error.message));return;}
    const fits=windows.filter(w=>w.fits), options=[];
    for(const w of (fits.length?fits:windows)){if(options.every(o=>Math.abs(o.start-w.start)>=Number(stored.preferences.duration)*3600000))options.push(w);if(options.length>=3)break;}
    const nodes=[el('p',fits.length?'Earliest windows matching all your limits:':'No complete window meets every limit. Here is what prevents a match:')];
    if(!windows.length)nodes.push(el('p','No upcoming hours are available.'));
    const place=current(),live=window.WeatherMap?.live();
    if(live&&core.relevantAlerts(live.features,place,data.metadata).length)nodes.unshift(el('p','This place has relevant alerts. Matching your preferences does not override official guidance.','warning-note'));
    for(const w of options){const box=el('article',undefined,`plan-window ${w.fits?'fits':''}`);box.append(el('strong',`${time(w.start)} – ${time(w.end,false)}`),el('p',`${w.minTemp===null?'Unknown':Math.round(w.minTemp)+'–'+Math.round(w.maxTemp)+'°F'} · wind ${w.wind===null?'unknown':Math.round(w.wind)+' mph max'} · rain chance ${w.rain===null?'unknown':Math.round(w.rain)+'% max'}`));if(w.reasons.length)box.append(el('p',w.reasons.join(' · '),'warning-note'));nodes.push(box);}
    target.replaceChildren(...nodes);
  }
  function render(){
    const place=current();window.WeatherWatches?.refreshSelection();window.WeatherSmoke?.refresh();window.WeatherHazards?.updatePlace(place);window.WeatherRivers?.updatePlace(place);window.WeatherWatershed?.updatePlace(place);window.WeatherAirForecast?.updatePlace(place);window.WeatherObservations?.updatePlace(place);window.WeatherEnsemble?.updatePlace(place);window.WeatherHrrr?.updatePlace(place);window.WeatherCompound?.refresh();window.WeatherStationHistory?.updatePlace(place,scopeGeneration);window.WeatherAnalogs?.refresh();window.WeatherOzone?.refresh();get('place-empty').hidden=!!place;get('place-content').hidden=!place;if(!place){window.WeatherPlanner?.refresh();return;}
    const data=forecasts.get(place.id), props=data?.metadata?.properties||{};
    get('place-title').textContent=place.name;get('place-location').textContent=`${place.lat.toFixed(4)}, ${place.lon.toFixed(4)}${props.relativeLocation?.properties?.city?' · near '+props.relativeLocation.properties.city+', '+props.relativeLocation.properties.state:''}`;
    get('forecast-status').className=stale(data)?'warning-note':'small';
    get('forecast-status').textContent=data?.forecast?`${stale(data)?'Updates delayed — showing last available forecast. ':''}Issued ${data.issued_at?time(data.issued_at):'time unavailable'} · checked ${time(data.checked_at)}${data.error?' · '+data.error:''}`:inFlight.has(place.id)?'Loading the official hourly forecast…':data?.error||'Waiting for forecast data.';
    renderAlerts(place,data);renderUpdates();renderPlan();
    const hours=core.hours(data).filter(h=>h.end>Date.now()&&h.start<Date.now()+48*3600000), finite=k=>hours.map(h=>h[k]).filter(v=>v!==null);
    const temps=finite('temperature'), winds=finite('wind'), rains=finite('rain');
    get('place-outlook').replaceChildren(...(hours.length?[el('p',temps.length?`${Math.round(Math.min(...temps))}–${Math.round(Math.max(...temps))}°F`:'Temperature unavailable','outlook-number'),el('p',`Peak sustained wind: ${winds.length?Math.round(Math.max(...winds))+' mph':'unknown'}`),el('p',`Highest hourly rain chance: ${rains.length?Math.round(Math.max(...rains))+'%':'unknown'}`),el('p',hours[0].summary),el('p',`${hours.length} forecast hours available${data?.stale?' · delayed':''}`,'small')]:[el('p','Forecast unavailable for this point.')]));
    get('hourly-body').replaceChildren(...hours.map(h=>{const row=el('tr');for(const value of [time(h.start),h.summary,h.temperature===null?'Unknown':Math.round(h.temperature)+'°F',h.wind===null?'Unknown':Math.round(h.wind)+' mph',h.rain===null?'Unknown':Math.round(h.rain)+'%'])row.append(el('td',value));return row;}));
    get('point-source').href=`https://forecast.weather.gov/MapClick.php?lat=${place.lat}&lon=${place.lon}`;
  }
  async function addPlace(name,lat,lon){
    if(!core.coordinate(lat,lon))throw new Error('Enter valid latitude and longitude.');
    if(listPlaces().length>=12)throw new Error('Remove a place before adding another.');
    const existing=listPlaces().find(p=>Math.abs(p.lat-lat)<0.00005&&Math.abs(p.lon-lon)<0.00005);
    if(existing){selected=existing.id;show(true);places();return;}
    const place={id:crypto.randomUUID(),name:(name.trim()||'Selected place').slice(0,60),lat,lon};
    if(accountPlaces!==null){if(!await window.WeatherPlaceSync.add(place))throw Error('Place list changed while saving. Review the current list.');selected=place.id;places();show(true);load(place);return;}
    stored.places.push(place);selected=place.id;save();places();show(true);load(place);
  }
  get('nav-personal').onclick=()=>show(true);get('nav-map').onclick=()=>show(false);
  get('place-form').onsubmit=async e=>{e.preventDefault();try{await addPlace(get('place-name').value,Number(get('place-lat').value),Number(get('place-lon').value));get('place-message').textContent=accountPlaces!==null?'Account place saved.':'Place saved on this device.';}catch(error){get('place-message').textContent=error.message;}};
  get('use-location').onclick=()=>{if(!navigator.geolocation){get('place-message').textContent='Location is unavailable. Enter coordinates or choose on the map.';return;}get('place-message').textContent='Requesting your location…';navigator.geolocation.getCurrentPosition(p=>{get('place-lat').value=p.coords.latitude.toFixed(4);get('place-lon').value=p.coords.longitude.toFixed(4);get('place-message').textContent='Location filled in. Name it and save.';},()=>{get('place-message').textContent='Location could not be read. Choose on the map or enter coordinates.';},{timeout:12000});};
  get('pick-on-map').onclick=()=>{show(false);get('map-notice').hidden=false;get('map-notice').textContent='Click the map to choose a place.';window.WeatherMap?.pick((lat,lon)=>{get('place-lat').value=lat.toFixed(4);get('place-lon').value=lon.toFixed(4);show(true);get('place-name').focus();get('place-message').textContent='Point selected. Name it and save.';});};
  get('remove-place').onclick=async()=>{try{if(accountPlaces!==null){await window.WeatherPlaceSync.remove(selected);return;}stored.places=stored.places.filter(p=>p.id!==selected);forecasts.delete(selected);baselines.delete(selected);selected=stored.places[0]?.id||null;save();places();render();}catch(error){get('place-message').textContent=error.message;}};
  get('share-place').onclick=async()=>{const p=current(),url=new URL(location.origin+location.pathname);url.hash=new URLSearchParams({place:p.name,lat:p.lat.toFixed(4),lon:p.lon.toFixed(4)}).toString();try{await navigator.clipboard.writeText(url.href);get('place-message').textContent='Briefing link copied. It includes the place name and coordinates.';}catch{get('place-message').replaceChildren(el('span','Share this link: '));const a=el('a',url.href);a.href=url.href;get('place-message').append(a);}};
  get('clear-updates').onclick=()=>{updates=updates.filter(c=>c.place!==selected);renderUpdates();};
  get('planner-form').onsubmit=e=>{e.preventDefault();stored.preferences={duration:Number(get('plan-duration').value),minTemp:Number(get('plan-min').value),maxTemp:Number(get('plan-max').value),wind:Number(get('plan-wind').value),rain:Number(get('plan-rain').value)};save();renderPlan();};
  get('notify-enable').onclick=async()=>{if(typeof Notification==='undefined'){get('notify-status').textContent='This browser does not support desktop notifications. Updates remain in the page.';return;}try{if(stored.notifications){stored.notifications=false;notificationPermission='default';get('notify-status').textContent='Desktop updates disabled. Updates remain in the page.';}else{notificationPermission=await Notification.requestPermission();stored.notifications=notificationPermission==='granted';get('notify-status').textContent=stored.notifications?'Desktop updates enabled while this page is open. Keep official emergency alerts enabled on your devices.':'Desktop updates were not enabled. Updates remain in the page.';}get('notify-enable').textContent=stored.notifications?'Disable desktop updates':'Enable desktop updates';save();}catch{get('notify-status').textContent='Desktop updates are unavailable here.';}};
  if(notificationPermission==='granted'){get('notify-enable').textContent='Disable desktop updates';get('notify-status').textContent='Desktop updates enabled while this page is open. For closed-page notifications, enroll a device under Browser push.';}
  for(const [id,k] of [['plan-duration','duration'],['plan-min','minTemp'],['plan-max','maxTemp'],['plan-wind','wind'],['plan-rain','rain']])get(id).value=stored.preferences[k];
  window.WeatherPersonal={setAccountPlaces(value){const next=value===null?null:value.map(p=>({...p}));if(JSON.stringify(next)===JSON.stringify(accountPlaces))return;accountPlaces=next;scopeGeneration++;forecasts.clear();baselines.clear();inFlight.clear();retryAt.clear();updates=[];if(!listPlaces().some(p=>p.id===selected))selected=listPlaces()[0]?.id||null;places();render();for(const place of listPlaces())load(place);},devicePlaces:()=>stored.places.map(p=>({...p})),current,preferences:()=>({...stored.preferences}),setPreferences(value){stored.preferences={...stored.preferences,...value};save();},context:()=>({scope_generation:scopeGeneration,place:current(),forecast:forecasts.get(selected),alerts:window.WeatherMap?.live()}),places:()=>listPlaces().map(p=>({...p})),show,alertsUpdated(){for(const p of listPlaces())applyAlerts(p);if(personal)render();}};
  selected=stored.places[0]?.id||null;places();for(const place of listPlaces())load(place);
  const shared=new URLSearchParams(location.hash.slice(1));
  if(shared.has('lat')&&shared.has('lon')){get('place-name').value=(shared.get('place')||'Shared place').slice(0,60);get('place-lat').value=shared.get('lat');get('place-lon').value=shared.get('lon');show(true);get('place-message').textContent='Shared coordinates loaded. Save this place to open its briefing.';}
  setInterval(()=>{for(const p of listPlaces())load(p);if(personal)render();},60000);
})();
