
window.AccessMapPage = class extends DCLogic {
async componentDidMount() {
  window.accessPlacePage = this;
  this.setState({ dataLoading: true, ans: AccessData.answers() });
  await this.loadData();
}
notify(message) { this.setState({ toast: message }); clearTimeout(this.tt); this.tt = setTimeout(() => this.setState({ toast: null }), 5000); }
async loadData() {
  this.setState({ dataLoading: true, dataError: null });
  try {
    const data = await AccessData.metadata();
    const query = new URLSearchParams(location.search);
    let mode = query.get('mode'), borough = query.get('borough');
    try { mode ||= localStorage.getItem('al-mode'); borough ||= localStorage.getItem('al-boro'); localStorage.removeItem('al-mode'); localStorage.removeItem('al-boro'); } catch {}
    const selected = data.boroughs.find(b => b.ui_code === borough || b.borough_code === borough);
    const need=Object.fromEntries(['ent','toilet','lift','cp'].map(k=>[k,(query.get('needs')||'').split(',').includes(k)&&data.needEvidence.coverage[k].positive_places>0]));
    this.setState({ ...data, need, dataLoading: false, dataReady: true, mode: mode === 'map' ? 'map' : 'visit' });
    if (selected) await this.openArea(selected.ui_code, query.get('place'));
    window.AccessWorkspace?.placesReady();
  } catch (error) { this.setState({ dataLoading: false, dataError: error.message }); }
}
async openArea(code, selectedId = null) {
  const borough = (this.state.boroughs || []).find(b => b.ui_code === code || b.borough_code === code);
  if (!borough) return this.notify('Choose a borough after the data has loaded.');
  window.AccessWorkspace?.setBorough(borough.borough_code, 'places');
  const request = this.request = (this.request || 0) + 1;
  this.setState({ level: 'area', area: borough.ui_code, boro: borough.ui_code, features: [], placesLoading: true, placeError: null, sel: null, cur: null, q: '', limit: 40, vstep: 'list', mstep: 'list', sheet: 'open' });
  const url = new URL(location.href); url.searchParams.set('borough', borough.ui_code); url.searchParams.delete('place'); history.replaceState({}, '', url);
  try {
    const features = await AccessData.places(borough.borough_code);
    if (request !== this.request || this.destroyed) return;
    const selected = selectedId && features.some(f => f.properties.id === selectedId) ? selectedId : null;
    this.setState({ features, placesLoading: false, sel: selected, vstep: selected ? 'place' : 'list', evidenceById: {}, evidenceError: null });
    this.loadAdditional(borough.borough_code, request);
    if (selectedId && !selected) this.notify('That place is not in this borough snapshot.');
  } catch (error) { if (request === this.request) this.setState({ placesLoading: false, placeError: error.message }); }
}
async loadAdditional(code, request) {
  try {
    const [features,stations,operators]=await Promise.all([AccessEvidence.borough(code),AccessEvidence.stations(),AccessEvidence.operators()]);
    if(request!==this.request||this.destroyed)return;
    this.setState({evidenceById:Object.fromEntries(features.map(f=>[f.properties.feature_id,f.properties])),operatorById:Object.fromEntries(operators.map(p=>[p.place_id,p])),stations,evidenceError:null});
  } catch(error) { if(request===this.request&&!this.destroyed)this.setState({evidenceError:error.message}); }
}
async loadReviewed(placeId) {
  this.reviewedPlace=placeId;this.setState({reviewed:[],reviewedLoading:!!placeId,reviewedError:null});
  if(!placeId)return;
  try {const records=await AccessEvidence.reviewed(placeId);if(this.reviewedPlace===placeId&&!this.destroyed)this.setState({reviewed:records,reviewedLoading:false});}
  catch(error){if(this.reviewedPlace===placeId&&!this.destroyed)this.setState({reviewedLoading:false,reviewedError:error.message});}
}
async useLocation() {
  this.notify('Finding your location…');
  try {
    const origin = await AccessData.locate();
    const boundary = AccessData.findBorough(origin, this.state.boundaries);
    if (!boundary) return this.notify('Your location is outside the London boundary in this dataset. Choose a borough manually.');
    this.setState({ origin }); await this.openArea(boundary.properties.borough_code);
    this.notify('Sorted using straight-line distance. This is not an accessible route or travel time.');
  } catch (error) { this.notify(error.message); }
}
saveRecord(kind, payload) {
  try { AccessData.saveEvent(kind, payload); return true; } catch (error) { this.notify(error.message); return false; }
}
componentDidUpdate() {
  if((this.state.sel||null)!==(this.reviewedPlace||null)){
    if(!window.AccessWorkspace||window.AccessWorkspace.currentView==='places'){const url=new URL(location.href);if(this.state.sel)url.searchParams.set('place',this.state.sel);else url.searchParams.delete('place');history.replaceState({},'',url);}
    this.loadReviewed(this.state.sel||null);
  }
  const element = document.getElementById('al-map');
  if (!element) { if (this.geoMap) this.geoMap.destroy(); this.geoMap = null; return; }
  if (this.geoMap && this.geoMap.element !== element) { this.geoMap.destroy(); this.geoMap = null; }
  if (!this.geoMap && window.L) this.geoMap = new AccessMap(element, this);
  if (this.geoMap && this.mapView) this.geoMap.update(this.mapView);
}
componentWillUnmount() { this.destroyed = true; clearTimeout(this.tt); if (this.geoMap) this.geoMap.destroy(); }
renderVals() {
const S = this.state;
const mode = S.mode || 'visit';
const V = mode === 'visit';
const level = S.level || 'city';
const need = S.need || { ent: false, toilet: false, lift: false, cp: false };
const cat = S.cat || 'all';
const q = (S.q || '').trim().toLowerCase();
const zoom = S.zoom || 1;
const ans = S.ans || {};
const vstep = S.vstep || 'list';
const mstep = S.mstep || 'list';
const sheet = S.sheet || 'open';
const IC = {
food: 'M7 3v8M5 3v4a2 2 0 0 0 4 0V3M7 11v10M17 3c-2 0-3 2-3 5s1 4 3 4v9',
park: 'M12 3l5 7h-3l4 6H6l4-6H7zM12 16v5',
museum: 'M3 9l9-5 9 5M5 10v8M9.5 10v8M14.5 10v8M19 10v8M3 20h18',
shop: 'M5 8h14l-1 12H6zM9 8V6a3 3 0 0 1 6 0v2',
toilet: 'M10 4a2 2 0 1 0 0 .01M9 8v6h6l2 5M9 11h5M7.5 12.5a5 5 0 1 0 7 5.5',
ent: 'M3 20h18M6 20V5h8v15M14 20l7-5M11 12h.01',
lift: 'M6 3h12v18H6zM10 9l2-2 2 2M10 15l2 2 2-2',
cp: 'M12 3v4M8 7h8l-1 6H9zM9 13l-2 8M15 13l2 8M10 17h4',
visit: 'M12 21s-6-5.5-6-11a6 6 0 0 1 12 0c0 5.5-6 11-6 11zM12 10h.01',
map: 'M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z'
};
const toast = (t) => { this.setState({ toast: t }); clearTimeout(this.tt); this.tt = setTimeout(() => this.setState({ toast: null }), 2400); };
const B = AccessData.tiles(S.boroughs);
const greens = ['#E3E9C9', '#C2D69E', '#8DB866', '#4E8A4F', '#2A5E35'];
const oranges = ['#F6E9D2', '#F2C994', '#E8973F', '#C2602A', '#7E3417'];
const gl = (s) => s < 45 ? 0 : s < 55 ? 1 : s < 65 ? 2 : s < 78 ? 3 : 4;
const ol = (m) => m < 45 ? 0 : m < 60 ? 1 : m < 72 ? 2 : m < 82 ? 3 : 4;
const KEYS = ['ent', 'toilet', 'lift', 'cp'];
const P = (S.features || []).map(f => {const p=AccessData.legacyPlace(f,S.origin);p.needEvidence=S.needEvidence?.resolutions[p[0]]||{};if(V)KEYS.forEach((k,i)=>{if(p.needEvidence[k])p[6+i]=p.needEvidence[k].value;});return p;});
const NEEDN = { ent: 'Step-free entrance', toilet: 'Accessible toilet', lift: 'Every public floor step-free', cp: 'Changing Places toilet' };
const SHORT = { ent: 'Step-free', toilet: 'Toilet', lift: 'Lift', cp: 'Changing Places' };
const CATN = { food: 'Food and drink', park: 'Park', museum: 'Culture', shop: 'Shops', toilet: 'Toilet' };
const val = (p, k) => p[6 + KEYS.indexOf(k)];
const mine = (p, k) => (ans[p[0]] || {})[k];
const coverage=S.needEvidence?.coverage||{};
const chosen = KEYS.filter((k) => need[k]&&(coverage[k]?.positive_places||0)>0);
const setNeeds=n=>{const u=new URL(location.href),active=KEYS.filter(k=>n[k]&&(coverage[k]?.positive_places||0)>0);if(active.length)u.searchParams.set('needs',active.join(','));else u.searchParams.delete('needs');history.replaceState({},'',u);this.setState({need:n,limit:40});};
const boroughCode=(S.boroughs||[]).find(b=>b.ui_code===S.area||b.borough_code===S.area)?.borough_code;
const facilityURL=kind=>'map.html?view=facilities&kind='+kind+(boroughCode?'&borough='+boroughCode:'');
const status = (p, ks) => {
const use = ks || chosen;
const vs = use.length ? use.map((k) => val(p, k)) : [p.data.wheelchair_display_status];
if (vs.some((v) => v === 'no' || v === 'partly')) return 'nofit';
if (vs.some((v) => v === 'unknown')) return 'unknown';
return 'fit';
};
const look = (st) => st === 'fit' ? { bg: '#2F6B3C', fg: '#F2F3DC', border: '3px solid #F2F3DC', op: 1 } : st === 'unknown' ? { bg: '#F2F3DC', fg: '#5C5D4C', border: '3px dashed #8E8F78', op: 1 } : { bg: '#CFCDB8', fg: '#4B4C3D', border: '3px solid #F2F3DC', op: 0.8 };
const MARK = {
yes: { text: 'Yes', fg: '#2A5E35', dot: '#2F6B3C', mark: '✓', bg: '#DCE7C4', border: 'none' },
partly: { text: 'Partly', fg: '#7A3A12', dot: '#9A6A3A', mark: '~', bg: '#ECE3CF', border: 'none' },
no: { text: 'No', fg: '#7A3A12', dot: '#5C5D4C', mark: '✕', bg: '#ECE3CF', border: 'none' },
unknown: { text: 'Not known', fg: '#5C5D4C', dot: 'transparent', mark: '?', bg: '#E9EBCD', border: '2px dashed #8E8F78' }
};
const minutes = AccessData.distance;
const byDistance = (a, b) => (S.origin ? a[5] - b[5] : 0) || a[1].localeCompare(b[1]);
const gapsOf = (p) => KEYS.filter((k) => val(p, k) === 'unknown');
const openGaps = (p) => gapsOf(p).filter((k) => !mine(p, k));
const areaB = B.find((x) => x[0] === (S.area || 'HCK'));
const areaName = areaB ? areaB[1] : 'Hackney';
const boroB = B.find((x) => x[0] === S.boro);
const isCity = level === 'city';

// tiles
const tiles = [];
for (let r = 0; r < 7; r++) for (let c = 0; c < 8; c++) {
const b = B.find((x) => x[2] === r && x[3] === c);
if (!b) { tiles.push({ isTile: false, isEmpty: true }); continue; }
const low = b[5] < 15, miss = Math.round((100 - b[5]) * 10) / 10, lv = V ? gl(b[4]) : ol(miss), on = S.boro === b[0];
tiles.push({ isTile: true, isEmpty: false, code: b[0], pressed: on ? 'true' : 'false',
label: V ? b[1] + (low ? ', low OSM tag coverage' : ', ' + b[4] + ' out of 100') : b[1] + ', ' + miss + '% of places unknown',
bg: V ? (low ? '#DCDAC8' : greens[lv]) : oranges[lv],
fg: (V && low) ? '#5C5D4C' : (lv >= 3 ? '#F2F3DC' : '#26261F'),
border: on ? '3px solid #26261F' : (V && low ? '2px dashed #8E8F78' : '3px solid transparent'),
tf: on ? 'scale(1.08)' : 'none',
pick: () => this.setState({ boro: b[0], q: '', sheet: 'open' }),
enter: () => this.setState({ hover: b[0] }), leave: () => this.setState({ hover: null }) });
}
const hb = B.find((x) => x[0] === (S.hover || S.boro));
const hoverText = hb ? (V ? (hb[5] < 15 ? hb[1] + ': low OSM tag coverage' : hb[1] + ': ' + hb[4] + ' out of 100') : hb[1] + ': ' + (100 - hb[5]).toFixed(1) + '% of places unknown') : (V ? 'Tap a borough' : 'Tap a borough with gaps');
const boroResults = q && isCity ? B.filter((b) => b[1].toLowerCase().includes(q)).slice(0, 5).map((b) => ({ name: b[1], pick: () => this.setState({ boro: b[0], q: '' }) })) : [];
let bo = {};
if (boroB) {
const low = boroB[5] < 15, miss = Math.round((100 - boroB[5]) * 10) / 10;
bo = V ? { name: boroB[1], tagline: low ? 'Low OSM tag coverage' : 'OSM tag score', big: low ? '?' : boroB[4], unit: low ? 'help needed' : 'out of 100',
ringBg: low ? '#DCDAC8' : greens[gl(boroB[4])], ringFg: (!low && gl(boroB[4]) >= 3) ? '#F2F3DC' : '#26261F',
barW: boroB[5] + '%', barText: boroB[5] + '% with an OSM wheelchair tag', cta: 'Open ' + boroB[1] }
: { name: boroB[1], tagline: 'Missing wheelchair tags', big: miss + '%', unit: 'unknown', ringBg: oranges[ol(miss)], ringFg: ol(miss) >= 3 ? '#F2F3DC' : '#26261F',
barW: miss + '%', barText: miss + '% still unknown', cta: 'Map in ' + boroB[1] };
}
const openArea = code => this.openArea(code);

// visitor list
const shown = P.filter((p) => (cat === 'all' || p[2] === cat) && (!q || [p[1],p[11],p.data.postcode].join(' ').toLowerCase().includes(q)) && (!S.savedOnly || AccessData.isSaved(p[0])));
const ord = { fit: 0, unknown: 1, nofit: 2 };
const sorted = shown.slice().sort((a, b) => ord[status(a)] - ord[status(b)] || byDistance(a,b));
const fitN = shown.filter((p) => status(p) === 'fit').length;
const noMatch = level === 'area' && V && vstep === 'list' && chosen.length > 0 && shown.length > 0 && fitN === 0;
let dropKey = null, dropBest = -1;
if (noMatch) chosen.forEach((k) => { const rest = chosen.filter((x) => x !== k); const n = shown.filter((p) => status(p, rest) === 'fit').length; if (n > dropBest) { dropBest = n; dropKey = k; } });
const marksFor = p => { const detailed = (chosen.length ? chosen : ['toilet']).map(k => { const m=MARK[val(p,k)]; return {text:SHORT[k]+': '+m.text+(p.needEvidence[k]?' (operator)':''),bg:m.bg,fg:m.fg,border:m.border==='none'?'none':'1.5px dashed #8E8F78'}; }); if(!chosen.length) detailed.unshift({text:'Wheelchair tag: '+p.data.wheelchair_access,bg:'#FBFBF2',fg:'#38452f',border:'none'}); return detailed; };

// selected place (visitor)
const selP = P.find((p) => p[0] === S.sel);
let pl = {};
if (selP) {
const st = status(selP), lk = look(st);
const evidence=(S.evidenceById||{})[selP[0]];
const rowKeys = chosen.concat(KEYS.filter((k) => !need[k]));
pl = { name: selP[1], icon: IC[selP[2]], meta: CATN[selP[2]] + ' · ' + AccessData.distance(selP[5]),
pinBg: lk.bg, pinFg: lk.fg, pinBorder: lk.border,
verdict: !chosen.length ? 'Overall wheelchair tag: ' + selP.data.wheelchair_access : (st === 'fit' ? 'Source evidence supports your selected needs' : st === 'unknown' ? 'Some of what you need is not known' : 'Source evidence records a limitation'),
vBg: st === 'fit' ? '#CFE3BF' : st === 'unknown' ? '#E9EBCD' : '#ECE3CF', vFg: st === 'fit' ? '#1F4A2A' : st === 'unknown' ? '#4B4C3D' : '#7A3A12',
rows: rowKeys.map((k) => {
const v = val(selP, k), m = MARK[v], a = mine(selP, k);
const pending = v === 'unknown' && a && a !== 'unsure';
return { label: NEEDN[k], icon: IC[k], mine: !!need[k], bg: need[k] ? '#E3E6C4' : '#ECEDD3',
value: pending ? ('Your local note: ' + (a === 'one' ? 'one floor' : a) + ' (unreviewed)') : m.text+(selP.needEvidence[k]?' (operator statement)':''), fg: pending ? '#7A3A12' : m.fg,
dot: pending ? '#F2C994' : m.dot, mark: pending ? '1' : m.mark, dotBorder: pending ? 'none' : m.border };
}),
confirm: 'OSM source snapshot: 18 Oct 2026. Not independently verified; no community confirmation count.',
hasGap: KEYS.some((k) => val(selP, k) === 'unknown'), sourceURL: selP.data.source_url, sourceDate: selP.data.source_last_modified_at, address: selP[11], rawName: selP.data.name_raw, hasRawName: selP.data.name_raw && selP.data.name_raw !== selP[1], access: selP.data.access_raw || 'Not recorded', hours: selP.data.opening_hours_raw || 'Not recorded', website: AccessData.safeURL(selP.data.website), hasWebsite: !!AccessData.safeURL(selP.data.website), saved: AccessData.isSaved(selP[0]) ? 'Unsave' : 'Save' };
pl.hasEvidence=!!evidence;pl.evidenceRows=AccessEvidence.rows(evidence);pl.evidenceDate=evidence?.source_snapshot_at.slice(0,10)||'';
pl.evidenceURL=evidence?'map.html?view=facilities&feature='+encodeURIComponent(evidence.feature_id):'map.html?view=facilities';
pl.evidenceError=S.evidenceError||'';pl.isChangingCandidate=!!evidence?.feature_kinds.includes('adult_changing_candidate');
const operator=(S.operatorById||{})[selP[0]];pl.hasOperator=!!operator;pl.operatorClaims=(operator?.claims||[]).map(c=>({...c,label:AccessEvidence.attributeLabels[c.attribute]||'Access limitation',sourceURL:operator.source_url,checkedDate:operator.checked_at.slice(0,10)}));
const entrance=selP.needEvidence.ent;pl.hasEntranceMatch=!!entrance;pl.entranceScopes=entrance?.positive_scopes.join('; ')||'';pl.entranceSource=entrance?.source_url||'';pl.entranceChecked=entrance?.checked_at.slice(0,10)||'';pl.entranceConflict=!!entrance?.conflict;pl.entranceSupported=entrance?.value==='yes';
pl.nearbyStations=AccessEvidence.nearest(selP.data,S.stations||[]);pl.hasStations=pl.nearbyStations.length>0;
pl.observationURL=AccessEvidence.observationURL(selP.data);pl.reviewedLoading=!!S.reviewedLoading;pl.reviewedError=S.reviewedError||'';
pl.reviewed=(S.reviewed||[]).map(r=>({...r,label:AccessEvidence.attributeLabels[r.attribute]||r.attribute,evidence_url:AccessData.safeURL(r.evidence_url)}));pl.hasReviewed=pl.reviewed.length>0;
}
const rep = S.rep || {};
const REP = [['door', 'Steps at the door'], ['toilet', 'Toilet not usable'], ['lift', 'Lift not working'], ['closed', 'Closed'], ['other', 'Something else']];
const repAny = REP.some((r) => rep[r[0]]);

// mapper
const gapPlaces = P.filter((p) => gapsOf(p).length > 0 && (!q || p[1].toLowerCase().includes(q))).sort(byDistance);
const remaining = gapPlaces.filter((p) => openGaps(p).length > 0);
const cur = P.find((p) => p[0] === S.cur);
const qKeys = S.qKeys || [];
const qi = S.qi || 0;
const QD = {
ent: { t: 'Is there a step-free way in?', h: 'A level door, a ramp or a lift from the street.', o: [['yes', 'Yes'], ['no', 'No'], ['unsure', 'Not sure']] },
toilet: { t: 'Is there an accessible toilet?', h: 'Room to turn a wheelchair, with grab rails.', o: [['yes', 'Yes'], ['no', 'No'], ['unsure', 'Not sure']] },
lift: { t: 'Can you reach every public floor without stairs?', h: 'Answer Yes if there is just one public floor and it is accessible. Do not infer this from the presence of a lift.', o: [['yes', 'Yes, every public floor'], ['no', 'No, some floors require stairs'], ['unsure', 'Not sure']] },
cp: { t: 'Is there a Changing Places toilet?', h: 'A Changing Places facility has specialist equipment, including an adult-sized changing bench and hoist. An ordinary accessible toilet is not enough.', o: [['yes', 'Yes, I checked the facility'], ['no', 'No, I checked'], ['unsure', 'Not sure']] }
};
const startFlow = (id) => this.setState({ mode: 'map', level: 'area', mstep: 'confirm', cur: id, sel: null, sheet: 'open' });
const next = remaining.find((p) => p[0] !== S.cur);
const qk = qKeys[qi] || 'ent';
const awn = { food: '#C2602A', shop: '#2F6B3C', museum: '#233A6B', toilet: '#4E8A4F', park: '#4E8A4F' };

const pins = [], dots = [];
const activeBorough = (S.boroughs || []).find(b => b.ui_code === S.area);
this.mapView = { key: [S.area, mode, cat, q, S.savedOnly, S.sel, S.cur, S.features?.length, JSON.stringify(need), JSON.stringify(S.origin)].join('|'),
  borough: activeBorough?.borough_code, boundaries: S.boundaries, rows: V ? shown : gapPlaces,
  mapper: !V, selected: V ? S.sel : S.cur, origin: S.origin, status,
  open: id => V ? this.setState({ sel: id, vstep: 'place', sheet: 'open' }) : startFlow(id) };
const panelState = isCity ? 'city' : (V ? 'v-' + vstep : 'm-' + mstep);
return {
dataLoading: !!S.dataLoading, dataError: S.dataError || '', dataReady: !!S.dataReady,
dataSummary: '74,500 OSM objects · Snapshot 18 Oct 2026 · Source tags, not verified visits', retryData: () => this.loadData(),
placesLoading: !!S.placesLoading, placeError: S.placeError || '', retryPlaces: () => this.openArea(S.area),
hasMore: (V ? sorted.length : gapPlaces.length) > (S.limit || 40), moreResults: () => this.setState({ limit: (S.limit || 40) + 40 }),
emptyResults: !S.placesLoading && !S.placeError && !shown.length,
savedLabel: S.savedOnly ? 'Show all places' : 'Saved places', toggleSaved: () => this.setState({ savedOnly: !S.savedOnly, limit: 40 }),
exportLocal: () => AccessData.exportEvents(),
localCount: AccessData.events().length,
bg: V ? '#F2F3DC' : '#F7EEDD', line: V ? '#D3D4B8' : '#E3D3BC', dark: V ? '#1F4A2A' : '#8A3B1C',
switchBg: V ? '#E3E6C4' : '#F0DFC6', panelBg: V ? '#F2F3DC' : '#F7EEDD', cardBg: V ? '#E3E6C4' : '#F6EDDC',
accent: V ? '#2F6B3C' : '#C2602A', accentText: V ? '#2F6B3C' : '#B4562A',
ctaBg: V ? '#2F6B3C' : '#E8873A', ctaFg: V ? '#F2F3DC' : '#26261F',
modes: [
{ label: 'Visitor', icon: IC.visit, pressed: V ? 'true' : 'false', bg: V ? '#2F6B3C' : 'transparent', fg: V ? '#F2F3DC' : '#26261F', pick: () => this.setState({ mode: 'visit', sel: null, vstep: 'list', mstep: 'list', cur: null }) },
{ label: 'Local survey', icon: IC.map, pressed: V ? 'false' : 'true', bg: V ? 'transparent' : '#E8873A', fg: '#26261F', pick: () => this.setState({ mode: 'map', sel: null, vstep: 'list', mstep: 'list', cur: null }) }
],
isVisit: V, isCity: isCity, isArea: !isCity,
lawnA: V ? '#4A8549' : '#D9B77F', lawnB: V ? '#52914F' : '#E0C08B', lawnC: V ? '#8DB866' : '#EBD3A6',
path: V ? '#EDE9CC' : '#F7EEDD', pathLine: V ? '#D6D1AE' : '#E3D3BC', treeA: V ? '#3E7A45' : '#C49A5E', treeB: V ? '#4E8A4F' : '#D1AA6E',
tiles: tiles, hoverText: hoverText,
legend: V ? greens : oranges, legendLow: V ? 'Lower tag score' : 'Fewer missing tags', legendHigh: V ? 'Higher tag score' : 'More missing tags',
streetLand: V ? '#E8EBD2' : '#F1E6D2', streetPark: V ? '#C9DDA8' : '#E7DDB8', streetTree: V ? '#B5D19A' : '#DCCB9F', streetRiver: V ? '#9CC7C0' : '#BFD3CC', roadEdge: V ? '#D3D0B4' : '#E0D2B6', labelColor: V ? '#4E8A4F' : '#9A7A48',
zoom: zoom, inv: (1 / zoom).toFixed(3), pins: pins, dots: dots,
areaName: areaName,
toCity: () => this.setState({ level: 'city', sel: null, vstep: 'list', mstep: 'list', q: '', boro: S.area || S.boro }),
zoomIn: () => this.geoMap?.map.zoomIn(), zoomOut: () => this.geoMap?.map.zoomOut(),
locate: () => this.useLocation(),
legendTitle: V ? (chosen.length ? 'What you need' : 'Overall wheelchair tag') : 'Missing source evidence',
pinLegend: V ? [{ text: chosen.length ? 'Source supports' : 'Yes', bg: '#2F6B3C', border: '3px solid #F2F3DC' }, { text: 'Not known yet', bg: '#F2F3DC', border: '3px dashed #8E8F78' }, { text: chosen.length ? 'Source limitation' : 'No', bg: '#CFCDB8', border: '3px solid #F2F3DC' }]
: [{ text: 'Source unknown', bg: '#FBF6EC', border: '3px dashed #B4562A' }, { text: 'You answered', bg: '#E8873A', border: '3px solid #F7EEDD' }, { text: 'Already known', bg: '#8DB866', border: '3px solid #F7EEDD' }],
panelClass: 'ma-panel' + (sheet === 'peek' ? ' ma-peek' : ''),
panelLabel: isCity ? 'Choose an area' : (V ? 'Places' : 'Mapping'),
toggleSheet: () => this.setState({ sheet: sheet === 'peek' ? 'open' : 'peek' }), sheetLabel: sheet === 'peek' ? 'Show the panel' : 'Show more of the map', sheetOpen: sheet === 'peek' ? 'false' : 'true',
pCity: panelState === 'city', pVList: panelState === 'v-list', pVPlace: panelState === 'v-place' && !!selP, pVReport: panelState === 'v-report' && !!selP, pVReported: panelState === 'v-reported' && !!selP,
pMList: panelState === 'm-list', pMConfirm: panelState === 'm-confirm' && !!cur, pMQ: panelState === 'm-q' && !!cur, pMDone: panelState === 'm-done',
cityTitle: V ? 'Where to?' : 'Where can you help?',
cityHint: V ? 'Tap a borough on the map, or use your location to see places near you.' : 'Darker boroughs have more places missing wheelchair tags. Tap one, or use your location.',
q: S.q || '', onSearch: (e) => this.setState({ q: e.target.value, limit: 40 }),
hasBoroResults: boroResults.length > 0, boroResults: boroResults, noBoroResults: isCity && !!q && boroResults.length === 0,
useLocation: () => this.useLocation(),
hasBoro: !!boroB, noBoro: !boroB, bo: bo, openBoro: () => boroB && openArea(boroB[0]),
needs: KEYS.map((k) => {const available=(coverage[k]?.positive_places||0)>0,on=available&&!!need[k],local=coverage[k]?.by_borough[boroughCode]||0;return {id:k,label:NEEDN[k],icon:IC[k],available,unavailable:!available,pressed:on?'true':'false',
coverage:available?`${local} source-supported ${local===1?'place':'places'} here · ${coverage[k].positive_places} in London`:k==='cp'?'Official register not connected':'No complete floor-access records yet',
bg:on?'#DCE7C4':'#FBFBF2',border:on?'2px solid #2F6B3C':'2px solid #D3D4B8',iconBg:on?'#2F6B3C':'#E3E6C4',iconFg:on?'#F2F3DC':'#4B4C3D',
toggle:()=>{if(available)setNeeds({...need,[k]:!need[k]});}};}),
entranceRecordsURL:facilityURL('entrance'),liftRecordsURL:facilityURL('lift'),toiletRecordsURL:facilityURL('all_toilets'),
hasEntranceExample:noMatch&&chosen.includes('ent')&&!!coverage.ent?.examples.length,
entranceExample:coverage.ent?.examples[0]?.name||'',
openEntranceExample:()=>{const example=coverage.ent?.examples[0];if(!example)return;this.setState({cat:'all',q:''});setNeeds({ent:true,toilet:false,lift:false,cp:false});return this.openArea(example.borough_code,example.place_id);},
cats: [['all', 'All'], ['food', 'Food and drink'], ['park', 'Parks'], ['museum', 'Culture'], ['shop', 'Shops'], ['toilet', 'Toilets']].map((c) => ({ label: c[1], pressed: cat === c[0] ? 'true' : 'false',
bg: cat === c[0] ? '#26261F' : 'transparent', fg: cat === c[0] ? '#F2F3DC' : '#26261F', border: cat === c[0] ? '2px solid #26261F' : '2px solid #C9C9AE', pick: () => this.setState({ cat: c[0], limit: 40 }) })),
countText: chosen.length ? fitN + ' source-supported ' + (fitN===1?'match':'matches') + ' · ' + shown.length + ' results including unknowns' : shown.length + ' places in this borough',
noPlaceResults:level==='area'&&V&&vstep==='list'&&!S.placesLoading&&shown.length===0,
noMatch: noMatch, dropText: dropKey ? 'Remove ' + NEEDN[dropKey].toLowerCase() + ' filter' : '',
dropNeed: () => { if (dropKey) setNeeds({...need,[dropKey]:false}); },
lookFurther: () => this.setState({ level: 'city', q: '', sel: null }),
results: sorted.slice(0, S.limit || 40).map((p) => { const st = status(p), lk = look(st); return { name: p[1], icon: IC[p[2]], min: minutes(p[5]), showDistance: !!S.origin, marks: marksFor(p),
pinBg: lk.bg, pinFg: lk.fg, pinBorder: lk.border, op: st === 'nofit' ? 0.72 : 1, bg: V ? '#E3E6C4' : '#F6EDDC',
aria: p[1] + ', ' + AccessData.distance(p[5]) + ', ' + (chosen.length ? (st === 'fit' ? 'source evidence supports selected needs' : st === 'unknown' ? 'selected needs not fully known' : 'source evidence records a limitation') : 'overall wheelchair source tag: ' + p.data.wheelchair_access),
open: () => this.setState({ sel: p[0], vstep: 'place' }) }; }),
pl: pl, backToList: () => this.setState({ vstep: 'list', sel: null, rep: {} }), backToPlace: () => this.setState({ vstep: 'place' }),
act: {
dir: () => { if (selP) window.open('https://www.openstreetmap.org/?mlat=' + selP[4] + '&mlon=' + selP[3] + '#map=18/' + selP[4] + '/' + selP[3], '_blank', 'noopener,noreferrer'); },
save: () => { try { const saved = AccessData.bookmark(selP[0]); this.setState({ bookmarkRevision: (S.bookmarkRevision || 0) + 1 }); toast(saved ? 'Saved on this device.' : 'Removed from saved places.'); } catch (error) { toast(error.message); } },
share: async () => { const url = AccessData.placeURL(selP.data, S.area); try { await navigator.clipboard.writeText(url); toast('Place link copied.'); } catch { window.prompt('Copy this place link:', url); } }
},
fillGap: () => selP && startFlow(selP[0]),
confirmRight: () => { if (this.saveRecord('confirmation', { place_id: selP[0], confirmation_type: 'place_identity' })) toast('Place confirmation saved on this device only. It does not change source evidence.'); },
startReport: () => this.setState({ vstep: 'report', rep: {}, repErr: false }),
reportChips: REP.map((r) => ({ label: r[1], pressed: rep[r[0]] ? 'true' : 'false', bg: rep[r[0]] ? '#E8873A' : 'transparent', border: rep[r[0]] ? '2px solid #E8873A' : '2px solid #B9A88C',
toggle: () => { const n = Object.assign({}, rep); n[r[0]] = !n[r[0]]; this.setState({ rep: n, repErr: false }); } })),
reportDisabled: repAny ? 'false' : 'true', reportBg: repAny ? '#E8873A' : '#E3D3BC', reportErr: !!S.repErr,
sendReport: () => { if (!repAny) this.setState({ repErr: true }); else if (this.saveRecord('report', { place_id: selP[0], issues: Object.keys(rep).filter(k => rep[k]) })) this.setState({ vstep: 'reported' }); },
gapCount: remaining.length + (remaining.length === 1 ? ' place needs' : ' places need') + ' answers',
gaps: gapPlaces.slice(0, S.limit || 40).map((p) => { const done = openGaps(p).length === 0; return { name: p[1], addr: p[11], dist: AccessData.distance(p[5]), icon: IC[p[2]],
pinBg: done ? '#E8873A' : '#FBF6EC', pinFg: done ? '#26261F' : '#8A3B1C', pinBorder: done ? '3px solid #F7EEDD' : '3px dashed #B4562A',
bg: done ? '#FBF6EC' : '#F6EDDC', edge: 'transparent', cta: done ? 'Done' : 'I’ve been', ctaFg: done ? '#2A5E35' : '#8A3B1C',
aria: p[1] + ', ' + p[11] + ', ' + AccessData.distance(p[5]) + (done ? ', you answered' : ''),
start: () => done ? toast('You already answered ' + p[1] + '. Thanks.') : startFlow(p[0]) }; }),
cur: cur ? { name: cur[1], addr: cur[11] + ', ' + areaName, awning: awn[cur[2]], step: '#9A9488', facadeLabel: 'Generic venue illustration, not a depiction of this entrance' } : { name: '', addr: '', awning: '#C2602A', step: '#9A9488', facadeLabel: '' },
backToGaps: () => this.setState({ mstep: 'list', cur: null }),
confirmPlace: () => { const ks = openGaps(cur); if (!ks.length) { toast('You already answered this place'); this.setState({ mstep: 'list' }); return; } this.setState({ mstep: 'q', qKeys: ks, qi: 0 }); },
flagClosed: () => { if (this.saveRecord('report', { place_id: cur[0], issues: ['closed'] })) { toast('Closure note saved on this device. Export it to share with a reviewer.'); this.setState({ mstep: 'list', cur: null }); } },
qNum: qi + 1, qTotal: qKeys.length || 1, qText: QD[qk].t, qHint: QD[qk].h, qIcon: IC[qk],
segs: (qKeys.length ? qKeys : ['ent']).map((k, i) => i <= qi ? '#E8873A' : '#E3D3BC'),
qBack: () => { if (qi > 0) this.setState({ qi: qi - 1 }); else this.setState({ mstep: 'confirm' }); },
opts: QD[qk].o.map((o, i) => ({ label: o[1], bg: i === 0 ? '#26261F' : 'transparent', fg: i === 0 ? '#F2F3DC' : '#26261F', border: i === 0 ? '2px solid #26261F' : '2px solid #B9A88C',
pick: () => {
if (!this.saveRecord('answer', { place_id: S.cur, question_id: qk, answer_raw: o[0] })) return;
const a = Object.assign({}, ans); a[S.cur] = Object.assign({}, a[S.cur] || {}); a[S.cur][qk] = o[0];
if (qi < qKeys.length - 1) this.setState({ ans: a, qi: qi + 1 });
else this.setState({ ans: a, mstep: 'done', doneCount: (S.doneCount || 0) + 1 });
} })),
doneCount: S.doneCount || 0, doneLabel: (S.doneCount || 0) === 1 ? 'place you helped today' : 'places you helped today', hasNext: !!next, next: next ? { name: next[1], addr: next[11] + ' · ' + AccessData.distance(next[5]) } : { name: '', addr: '' },
startNext: () => next && startFlow(next[0]),
hasToast: !!S.toast, toast: S.toast || ''
};
}
}
