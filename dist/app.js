/* Weather Commons — Apache-2.0. Official source text is rendered as text only. */
'use strict';
const $ = (id) => document.getElementById(id);
const config = window.WEATHER_CONFIG || {mode: 'daemon'};
const direct = config.mode === 'direct';
const NWS = 'https://api.weather.gov';
const colors = {Extreme: '#ec87cf', Severe: '#ff977e', Moderate: '#e7c579', Minor: '#8fbdc8', Unknown: '#8fbdc8'};
const ranks = {Extreme: 0, Severe: 1, Moderate: 2, Minor: 3, Unknown: 4};
const regions = {
  conus: {name: 'United States', bounds: [[24, -125], [50, -66]]},
  alaska: {name: 'Alaska', bounds: [[51, -179], [72, -129]]},
  hawaii: {name: 'Hawaii', bounds: [[18, -161], [23, -154]]},
  puertorico: {name: 'Puerto Rico & USVI', bounds: [[17.5, -68], [18.7, -64.3]]},
  guam: {name: 'Guam & Marianas', bounds: [[12.8, 144], [20.7, 146.5]]},
  samoa: {name: 'American Samoa', bounds: [[-15, -172], [-10.5, -168]]},
};
let features = [], filtered = [], changes = [], snapshots = [], selected = null;
let category = 'all', feedMode = 'alerts', replayAt = null, lastSuccess = null, lastError = null;
let refreshing = false, replayLoading = false, snapshotGeneration = 0, nextFetch = 0, lastSourceUpdated = null, liveData = null;
const directHistory = [], geometry = new Map(), zoneCache = new Map(), zoneFailed = new Map();
let zoneQueue = [], zonePending = new Set(), zoneActive = 0, geometryTimer = null;
const map = L.map('map', {zoomControl: false, preferCanvas: true, minZoom: 2, maxZoom: 14, worldCopyJump: true});
L.tileLayer(config.tileUrl || 'https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19, attribution: config.tileAttribution || '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors',
}).addTo(map).on('tileerror', () => { $('map-subtitle').textContent = 'Basemap unavailable · alert areas still shown'; });
L.control.zoom({position: 'bottomright'}).addTo(map);
let alertLayer = L.geoJSON([], {style: styleFeature, onEachFeature: bindFeature}).addTo(map);
map.fitBounds(regions.conus.bounds, {padding: [15, 30]});

function node(tag, text, cls) {
  const el = document.createElement(tag);
  if (text !== undefined && text !== null) el.textContent = text;
  if (cls) el.className = cls;
  return el;
}
function dateText(value, full = false) {
  const d = new Date(value);
  if (!Number.isFinite(d.getTime())) return 'Not specified';
  return d.toLocaleString(undefined, full ? {month:'short', day:'numeric', hour:'numeric', minute:'2-digit', timeZoneName:'short'} : {hour:'numeric', minute:'2-digit'});
}
function ageText(value) {
  const age = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 60000));
  return !Number.isFinite(age) ? '' : age < 1 ? 'Just issued' : age < 60 ? `${age}m ago` : age < 1440 ? `${Math.floor(age / 60)}h ago` : `${Math.floor(age / 1440)}d ago`;
}
function severity(f) { return f.properties.severity || 'Unknown'; }
function badge(f) {
  const el = node('span', null, `badge ${severity(f).toLowerCase()}`);
  el.append(node('i'), document.createTextNode(severity(f)));
  return el;
}
function validFeature(f) { return f && f.type === 'Feature' && typeof f.id === 'string' && f.properties && typeof f.properties === 'object'; }
function activeAt(f, at) {
  const p = f.properties;
  const end = Date.parse(p.ends || p.expires);
  return p.status === 'Actual' && p.messageType !== 'Cancel' && (!Number.isFinite(end) || end > at);
}
async function request(url) {
  const response = await fetch(url, {headers: {Accept: 'application/geo+json, application/json'}, signal: AbortSignal.timeout(30000)});
  if (!response.ok) throw new Error(`Source returned HTTP ${response.status}`);
  return response.json();
}
async function directAlerts() {
  let url = `${NWS}/alerts/active?status=actual`, updated = null;
  const all = new Map(), seen = new Set();
  while (url) {
    const parsed = new URL(url);
    if (parsed.origin !== NWS || seen.has(url) || seen.size >= 20) throw new Error('Unexpected source pagination');
    seen.add(url);
    const data = await request(url);
    if (data.type !== 'FeatureCollection' || !Array.isArray(data.features) || !data.features.every(validFeature)) throw new Error('Invalid alert response');
    data.features.forEach(f => all.set(f.id, f));
    updated = data.updated || updated;
    url = data.pagination?.next;
  }
  return {type: 'FeatureCollection', features: [...all.values()], updated, collected_at: new Date().toISOString()};
}
function makeChanges(oldFeatures, newFeatures, at) {
  const old = new Map(oldFeatures.map(f => [f.id, f]));
  const next = new Map(newFeatures.map(f => [f.id, f]));
  const result = [];
  for (const f of newFeatures) {
    let kind = !old.has(f.id) ? 'new' : JSON.stringify(old.get(f.id)) !== JSON.stringify(f) ? 'updated' : null;
    if (kind === 'new' && f.properties.references?.some(r => oldFeatures.some(o => o.properties.id === r.identifier))) kind = 'updated';
    if (kind) result.push({id: f.id, kind, at, event: f.properties.event, area: f.properties.areaDesc});
  }
  for (const f of oldFeatures) if (!next.has(f.id)) result.push({id: f.id, kind: 'left active feed', at, event:f.properties.event, area:f.properties.areaDesc});
  return result;
}
async function refresh() {
  if (refreshing || replayAt || replayLoading || Date.now() < nextFetch) return;
  refreshing = true;
  const generation = snapshotGeneration;
  $('refresh').disabled = true;
  try {
    let data;
    if (direct) {
      data = await directAlerts();
      const old = directHistory.at(-1)?.data.features || [];
      // Share unchanged alert bodies across snapshots to bound session memory.
      const previous = new Map(old.map(f => [f.id, f]));
      data.features = data.features.map(f => JSON.stringify(previous.get(f.id)) === JSON.stringify(f) ? previous.get(f.id) : f);
      changes = [...makeChanges(old, data.features, data.collected_at), ...changes].slice(0, 200);
      directHistory.push({at: data.collected_at, data});
      while (directHistory.length && Date.parse(directHistory[0].at) < Date.now() - 86400000) directHistory.shift();
      snapshots = directHistory.map(s => ({at:s.at}));
      lastSuccess = data.collected_at;
      lastError = null;
    } else {
      const health = await request('/api/health');
      lastSuccess = health.last_success ? new Date(health.last_success * 1000).toISOString() : null;
      lastError = health.last_error;
      data = await request('/api/alerts');
      const [history, changeData] = await Promise.all([request('/api/history'), request('/api/changes')]);
      snapshots = history.snapshots;
      changes = changeData.changes;
    }
    liveData = data;
    window.WeatherPersonal?.alertsUpdated(data);
    nextFetch = Date.now() + 60000;
    if (generation === snapshotGeneration && !replayAt && !replayLoading) {
      lastSourceUpdated = data.updated;
      features = data.features.filter(validFeature);
      render();
      queueGeometry();
    }
    updateTimeline();
  } catch (error) {
    lastError = error.message;
    nextFetch = Date.now() + 30000;
    if (!lastSuccess && !replayAt) emptyFeed('Waiting for weather data', 'The source is temporarily unavailable. We will retry automatically.');
  } finally {
    refreshing = false;
    $('refresh').disabled = false;
    updateHealth();
  }
}
function updateHealth() {
  const age = lastSuccess ? (Date.now() - Date.parse(lastSuccess)) / 1000 : Infinity;
  const delayed = !!lastError || age > 90;
  $('status-dot').className = `status-dot ${!lastSuccess ? 'loading' : delayed ? 'stale' : ''}`;
  $('status-label').textContent = !lastSuccess ? 'Waiting for NWS' : delayed ? 'Updates delayed' : 'Connected to NWS';
  $('status-time').textContent = lastSuccess ? `Collected ${dateText(lastSuccess)} · ${age < 60 ? 'less than a minute ago' : `${Math.floor(age/60)}m ago`}` : 'Retrying automatically';
  if (replayAt) {
    notice(`Replay · collected ${dateText(replayAt, true)}. This is a historical view.`);
  } else if (delayed) {
    notice(lastSuccess ? 'Updates are delayed. Showing the last successful collection; check official sources for current conditions.' : 'Connecting to the official alert feed. No live data is available yet.');
  } else {
    notice(null);
  }
}
function notice(message) { $('map-notice').hidden = !message; $('map-notice').textContent = message || ''; }
function emptyFeed(title, text) {
  const div = node('div', null, 'empty');
  div.append(node('h3', title), node('p', text));
  $('feed').replaceChildren(div);
}
function render() {
  const at = replayAt ? Date.parse(replayAt) : Date.now();
  const active = features.filter(f => activeAt(f, at));
  const term = $('search').value.trim().toLowerCase();
  filtered = active.filter(f => {
    const p = f.properties;
    return (category === 'all' || p.event?.includes(category)) &&
      ($('severity').value === 'all' || severity(f) === $('severity').value) &&
      (!term || [p.event, p.areaDesc, p.senderName, ...(p.geocode?.UGC || [])].join(' ').toLowerCase().includes(term));
  }).sort((a,b) => (ranks[severity(a)] ?? 4) - (ranks[severity(b)] ?? 4) || Date.parse(b.properties.sent) - Date.parse(a.properties.sent));
  $('total').textContent = active.length;
  $('visible-count').textContent = feedMode === 'alerts' ? `${filtered.length} shown` : 'Latest 200';
  $('clear').hidden = !term && category === 'all' && $('severity').value === 'all';
  $('severe-count').textContent = filtered.filter(f => ['Extreme','Severe'].includes(severity(f))).length;
  if (feedMode === 'changes') renderChanges(); else renderAlerts();
  drawMap();
  if (selected) {
    const f = features.find(f => f.id === selected);
    if (f) renderDetail(f); else closeDetail();
  }
}
function renderAlerts() {
  if (!filtered.length) {
    emptyFeed(features.length ? 'No alerts match this view' : 'No active alerts', features.length ? 'Try another place, event, or severity. Reset filters to see all alerts.' : 'The latest collection contains no active alerts. New alerts will appear automatically.');
    return;
  }
  const frag = document.createDocumentFragment();
  for (const f of filtered) {
    const p = f.properties;
    const card = node('button', null, `alert-card${selected === f.id ? ' selected' : ''}`);
    card.setAttribute('aria-label', `${p.event}: ${p.areaDesc}`);
    card.setAttribute('aria-pressed', String(selected === f.id));
    const top = node('div', null, 'card-top');
    top.append(badge(f), node('span', replayAt ? dateText(p.sent) : ageText(p.sent), 'card-time'));
    const bottom = node('div', null, 'card-bottom');
    bottom.append(node('span', `Until ${dateText(p.ends || p.expires)}`), node('span', 'View alert ↗'));
    card.append(top, node('h3', p.event || 'Weather alert'), node('p', p.areaDesc || 'Area not provided'), bottom);
    card.onclick = () => selectAlert(f);
    frag.append(card);
  }
  $('feed').replaceChildren(frag);
}
function renderChanges() {
  const term = $('search').value.trim().toLowerCase();
  const visible = changes.filter(c => (!replayAt || Date.parse(c.at) <= Date.parse(replayAt)) &&
    (!term || `${c.event} ${c.area}`.toLowerCase().includes(term)) && (category === 'all' || c.event?.includes(category)));
  if (!visible.length) { emptyFeed('No changes in this view', 'New alerts and updates will appear as collections arrive.'); return; }
  const frag = document.createDocumentFragment();
  for (const c of visible) {
    const card = node('div', null, 'change-card');
    card.append(node('span', c.kind, 'change-tag'), node('time', dateText(c.at)), node('h3', c.event), node('p', c.area));
    frag.append(card);
  }
  $('feed').replaceChildren(frag);
}
function styleFeature(f) {
  return {color: colors[severity(f)] || colors.Unknown, weight: selected === f.id ? 2.7 : 1,
    opacity: selected === f.id ? 1 : .75, fillOpacity: selected === f.id ? .4 : .2};
}
function bindFeature(f, layer) {
  const tooltip = node('span', `${f.properties.event} · ${f.properties.areaDesc || ''}`);
  layer.bindTooltip(tooltip, {sticky:true});
  layer.on('click', () => selectAlert(features.find(x => x.id === f.id) || f));
}
function featureGeometry(f) {
  if (f.geometry) return f.geometry;
  return geometry.get(f.id) || null;
}
function drawMap() {
  const mapped = filtered.map(f => ({...f, geometry:featureGeometry(f)})).filter(f => f.geometry);
  // Severe alerts are drawn last so less urgent overlapping areas do not hide them.
  alertLayer.clearLayers().addData([...mapped].reverse());
  if (selected) alertLayer.eachLayer(layer => { if (layer.feature.id === selected) layer.bringToFront(); });
  $('mapped-count').textContent = mapped.length;
  const pending = filtered.length - mapped.length;
  $('map-subtitle').textContent = pending ? `${mapped.length} mapped · ${pending} awaiting boundaries` : 'Official alerts · affected areas';
}
function combineZones(f) {
  const zones = f.properties.affectedZones || [];
  const geometries = zones.map(z => zoneCache.get(z)).filter(Boolean);
  if (geometries.length) geometry.set(f.id, {type:'GeometryCollection', geometries});
  return geometries.length === zones.length && zones.length > 0;
}
function scheduleGeometryDraw() {
  if (geometryTimer) return;
  geometryTimer = setTimeout(() => {
    geometryTimer = null;
    features.filter(f => !f.geometry).forEach(combineZones);
    drawMap();
    if (selected) { const f = features.find(f => f.id === selected); if (f) renderDetail(f); }
  }, 800);
}
function queueGeometry(priority = null) {
  const ordered = priority ? [priority, ...filtered] : filtered;
  const newQueue = [];
  for (const f of ordered) {
    if (f.geometry) continue;
    combineZones(f);
    for (const url of f.properties.affectedZones || []) {
      if (!/^https:\/\/api\.weather\.gov\/zones\/(county|forecast|fire|coastal|offshore)\/\w{6}$/.test(url)) continue;
      if (zoneCache.has(url) || zonePending.has(url) || (zoneFailed.get(url) || 0) > Date.now()) continue;
      zonePending.add(url);
      newQueue.push(url);
    }
  }
  zoneQueue = priority ? [...newQueue, ...zoneQueue] : [...zoneQueue, ...newQueue];
  pumpZones();
}
function pumpZones() {
  while (zoneActive < 4 && zoneQueue.length) {
    const url = zoneQueue.shift();
    zoneActive++;
    request(direct ? url : '/api' + new URL(url).pathname).then(data => {
      if (data.geometry) zoneCache.set(url, data.geometry);
      else zoneFailed.set(url, Date.now() + 300000);
    }).catch(() => zoneFailed.set(url, Date.now() + 300000)).finally(() => {
      zoneActive--; zonePending.delete(url); scheduleGeometryDraw(); pumpZones();
    });
  }
}
function selectAlert(f) {
  selected = f.id;
  $('detail').hidden = false;
  renderDetail(f);
  if (feedMode === 'alerts') renderAlerts();
  drawMap();
  const g = featureGeometry(f);
  if (g) {
    const bounds = L.geoJSON(g).getBounds();
    if (bounds.isValid()) map.fitBounds(bounds, {paddingTopLeft:[35,55], paddingBottomRight:[window.innerWidth > 700 ? 385 : 30,65], maxZoom:9, animate:false});
  }
  queueGeometry(f);
  $('detail-close').focus({preventScroll:true});
}
function renderDetail(f) {
  const p = f.properties, body = $('detail-body');
  const dl = node('dl');
  for (const [title, value] of [['Issued',dateText(p.sent,true)],['Expires',dateText(p.expires,true)],['Onset',dateText(p.onset,true)],['Certainty',p.certainty || 'Unknown']]) {
    const pair = node('div'); pair.append(node('dt',title), node('dd',value)); dl.append(pair);
  }
  body.replaceChildren(badge(f), node('h2',p.event), node('p',p.areaDesc,'detail-area'), dl);
  body.append(node('p', p.senderName || 'National Weather Service'));
  if (!activeAt(f, replayAt ? Date.parse(replayAt) : Date.now())) body.append(node('p','This alert has expired or is no longer active.'));
  if (p.instruction) body.append(node('h3','Official instructions'), node('p',p.instruction,'instruction'));
  body.append(node('h3','What is happening'), node('p',p.description || p.headline || 'No description supplied.'));
  body.append(node('h3','Mapped area'), node('p', f.geometry ? 'Official alert polygon.' : `${(p.affectedZones || []).filter(z => zoneCache.has(z)).length} of ${(p.affectedZones || []).length} official zone boundaries loaded. Zone coverage may be broader than the weather event itself.`));
  const link = node('a','Read official NWS alert ↗','official-link');
  link.href = f.id.startsWith(`${NWS}/alerts/`) ? f.id : 'https://www.weather.gov/';
  link.target = '_blank'; link.rel = 'noopener';
  body.append(link, node('p',`Collected ${dateText(replayAt || lastSuccess,true)}. Source feed updated ${dateText(lastSourceUpdated,true)}.`));
}
function closeDetail() { selected = null; $('detail').hidden = true; render(); }
function updateTimeline() {
  const input = $('timeline');
  input.max = Math.max(0,snapshots.length - 1);
  input.disabled = snapshots.length < 2;
  if (!replayAt) input.value = input.max;
  $('timeline-label').textContent = snapshots.length ? `Since ${dateText(snapshots[0].at)} · ${snapshots.length} snapshots` : 'History begins with the first collection';
}
async function replay(index) {
  const snap = snapshots[index];
  if (!snap) return;
  const gen = ++snapshotGeneration;
  replayLoading = true;
  try {
    const data = direct ? directHistory.find(s => s.at === snap.at).data : await request('/api/alerts?at=' + encodeURIComponent(snap.at));
    if (gen !== snapshotGeneration) return;
    replayAt = snap.at;
    $('live-button').classList.add('replaying');
    $('map-mode').textContent = 'COLLECTED HISTORY';
    $('timeline-time').textContent = dateText(snap.at,true);
    lastSourceUpdated = data.updated;
    features = data.features;
    render(); queueGeometry();
    updateHealth();
  } catch { notice('That snapshot could not be loaded. Return to Live or select another time.'); }
  finally { if (gen === snapshotGeneration) replayLoading = false; }
}
function returnLive() {
  replayAt = null; replayLoading = false; snapshotGeneration++;
  $('map-mode').textContent = 'LIVE CONDITIONS';
  $('live-button').classList.remove('replaying');
  $('timeline-time').textContent = 'Now';
  if (liveData) { features = liveData.features; lastSourceUpdated = liveData.updated; render(); queueGeometry(); updateTimeline(); }
  updateHealth();
  refresh();
}
$('search').addEventListener('input', () => {render(); queueGeometry();});
$('severity').addEventListener('change', () => {render(); queueGeometry();});
$('categories').addEventListener('click', (event) => {
  const b = event.target.closest('button'); if (!b) return;
  category = b.dataset.category;
  for (const button of $('categories').querySelectorAll('button')) { const active = button === b; button.classList.toggle('active',active); button.setAttribute('aria-pressed',String(active)); }
  render(); queueGeometry();
});
$('clear').onclick = () => { $('search').value = ''; $('severity').value = 'all'; $('categories').querySelector('button').click(); };
$('refresh').onclick = () => { if (replayAt) returnLive(); else { render(); updateHealth(); refresh(); } };
$('detail-close').onclick = closeDetail;
$('region').onchange = () => { const region = regions[$('region').value]; $('region-name').textContent = region.name; map.fitBounds(region.bounds,{animate:false}); closeDetail(); };
$('fit').onclick = () => { const bounds = alertLayer.getBounds(); if (bounds.isValid()) map.fitBounds(bounds, {padding:[45,70],maxZoom:9}); };
$('alerts-tab').onclick = () => setFeed('alerts');
$('changes-tab').onclick = () => setFeed('changes');
function setFeed(mode) { feedMode = mode; for (const tab of ['alerts','changes']) { const b = $(`${tab}-tab`); b.classList.toggle('active',tab === mode); b.setAttribute('aria-pressed',String(tab===mode)); } $('severity').disabled = mode === 'changes'; render(); }
$('timeline').oninput = () => replay(Number($('timeline').value));
$('live-button').onclick = returnLive;
$('about-open').onclick = $('sources-open').onclick = () => $('about').showModal();
$('about-close').onclick = () => $('about').close();
$('about').addEventListener('click', e => { if (e.target === $('about')) { const b = $('about').getBoundingClientRect(); if (e.clientX < b.left || e.clientX > b.right || e.clientY < b.top || e.clientY > b.bottom) $('about').close(); } });
$('history-mode').textContent = direct ? 'History for this session' : '24h retained history';
$('mode-explainer').textContent = direct ? 'This static public edition reads NWS directly from your browser. Replay and the change feed cover collections made while this page is open. Download the self-hosted edition for a shared background daemon and persistent 24-hour history.' : 'This edition reads from a shared background daemon. Collections continue even when nobody is viewing the map. Replay covers the last 24 hours collected since the daemon started; it does not invent earlier history.';
document.addEventListener('keydown', e => { if (e.key === '/' && !['INPUT','TEXTAREA','SELECT'].includes(document.activeElement.tagName)) {e.preventDefault();$('search').focus();} if (e.key === 'Escape' && !$('about').open) closeDetail(); });
window.addEventListener('resize', () => map.invalidateSize());
// Small public interface keeps personal planning independent of map/replay state.
window.WeatherMap = {
  live: () => liveData,
  show: () => map.invalidateSize(),
  focus: (lat,lon) => map.setView([lat,lon],9),
  pick: callback => map.once('click', e => callback(e.latlng.lat,((e.latlng.lng+180)%360+360)%360-180)),
  selectAlert: id => { const f=features.find(f=>f.id===id); if(f)selectAlert(f); },
};
setInterval(() => { updateHealth(); if (!replayAt && lastSuccess) render(); }, 30000);
setInterval(refresh, 5000);
refresh();
