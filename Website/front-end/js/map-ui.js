class Component extends DCLogic {
async componentDidMount() {
  if (location.protocol === 'file:') {
    this.setState({ fatal: 'Run Access London with npm start (Node.js + MySQL), then open http://localhost:3000/map.html. Live Server does not provide the API.' });
    return;
  }
  try { await this.start(); }
  catch (e) {
    console.error(e);
    this.setState({ fatal: 'The map’s data didn’t load (' + e.message + '). Check the server is running (npm start) and MySQL is set up (npm run db:setup), then reload.' });
  }
}
async start() {
  this.ans = LondonData.loadAnswers();
  Answers.onStatus((live) => this.setState({ live }));
  Answers.start();
  this.saved = LondonData.loadSaved();
  const [boroughs, stations] = await Promise.all([LondonData.getJSON('/api/boroughs'), LondonData.getJSON('/api/stations')]);
  this.boroughs = boroughs; this.stations = stations;

  if (new URLSearchParams(location.search).get('mode') === 'map') this.setState({ mode: 'map' });
  
  var self = this;          // "this" inside the functions below would not be the page
  this.detailCache = {};    // place details already loaded, by place id
  this.rt = this.newRoute(null);
  this.barriers = [];

  LondonData.getJSON('/api/journey/status')
    .then(function (status) { self.routingOn = !!status.routingConfigured; self.bump(); })
    .catch(function () { self.routingOn = false; });
  if (window.BarrierReport) {
    BarrierReport.init({
      requestMapPick: function (done) { self.startPick('Tap or click the map where the problem is.', done); },
      onSent: function (message) { self.toast(message, 5200); }
    });
  }
  window.accessApp = this; // available in DevTools and for the browser checks

  this.data = this.emptyLondonData();
  this.viewportToken = 0;
  this.viewportMode = 'overview';
  this.lm = await LondonMap.create(document.getElementById('lm'), {
    onPick: (id) => this.pick(id),
    onMapClick: function (at) { return self.mapClicked(at); },   // added: choosing a point
    onBarrier: function (id) { self.openBarrier(id); },           // added: a barrier sign was clicked
    hoverCard: (id) => this.hoverCard(id),
    onMove: () => this.handleMapMove()
  });
  window.accessMap = this.lm.map; // available in DevTools
  this.loadBarriers();

  document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape' && self.picking) self.cancelPick();
  });
  const overview = await LondonData.getJSON('/api/places/overview');
  this.lm.setOverview(overview);
  this.overviewKey = 'visit||';
  Answers.watch('all', () => {
    if (!this.data) return;
    LondonData.applyCrowd(this.data, this.ans);
    this.lm.refresh();
    this.setState({ crowdTick: (this.state.crowdTick || 0) + 1, viewTick: (this.state.viewTick || 0) + 1 });
  });
  try { if (localStorage.getItem('al-map-only')) this.setCollapsed(true); } catch (e) { /* private window */ }
  this.setState({ level: 'area', area: null, overview: true, ready: true });
  await this.lm.openLondon();
 
  const [ui, id] = decodeURIComponent(location.hash.slice(1)).split(/\/(.*)/);
  const b = boroughs.find((x) => x.ui === ui);
  if (b) await this.openArea(b.code, id);
  else this.handleMapMove();

}
componentWillUnmount() {
  clearTimeout(this.tt);
  clearTimeout(this.viewportTimer);
  this.viewportToken = (this.viewportToken || 0) + 1;
}
emptyLondonData() {
  return { code: 'all', byId: {}, details: {},
    places: { type: 'FeatureCollection', features: [] }, truncated: false };
}

bump() { this.setState({ rtTick: (this.state.rtTick || 0) + 1 }); }

newRoute(dest, keep) {
  var old = keep || {};
  return {
    dest: dest,                    // { id, name, coordinates: [lon, lat] }
    from: old.from || null,        // { name, coordinates } once the start is chosen
    mode: old.mode || 'wheelchair',
    fromText: '', fromMsg: '', results: [],
    busy: false, error: '', canRetry: false,
    result: null, near: [],
    seq: (old.seq || 0) + 1        // a counter, so an old answer from the server is ignored
  };
}

async loadBarriers() {
  try {
    var data = await LondonData.getJSON('/api/barriers');
    this.barriers = data.reports || [];
  } catch (error) {
    console.warn('Barrier reports unavailable', error);
    this.barriers = [];
  }
  this.drawBarriers();
}

drawBarriers() {
  var i, nearIds = [];
  if (!this.lm) return;
  if (this.rt && this.rt.result) {
    for (i = 0; i < this.rt.near.length; i++) nearIds.push(this.rt.near[i].id);
  }
  this.lm.setBarriers(this.barriers, nearIds);
}


openBarrier(id) {
  var i;
  if (!window.BarrierReport) return;
  for (i = 0; i < this.barriers.length; i++) {
    if (this.barriers[i].id === id) { BarrierReport.showDetail(this.barriers[i]); return; }
  }
}


openRoute(f) {
  var p = f.properties;
  var dest = { id: p.id, name: p.name, coordinates: [f.geometry.coordinates[0], f.geometry.coordinates[1]] };
  // The same destination again keeps the start, mode and result. A new destination keeps the start.
  if (!this.rt.dest || this.rt.dest.id !== dest.id) this.rt = this.newRoute(dest, this.rt);
  // The person already shared their location (e.g. with the map's location button): start there.
  if (!this.rt.from && this.state.you) this.rt.from = { coordinates: this.state.you, name: 'Your location' };
  this.lm.clearTrip();
  this.setState({ vstep: 'route', sheet: 'open' });
  this.lm.setEndpoints(this.rt.from, dest);
  if (this.rt.from && !this.rt.result) this.calcRoute();
  else if (this.rt.result) this.showRouteOnMap();
  else this.lm.flyTo(dest.coordinates, 15.5);
  this.bump();
}

// The start point is chosen: show it and ask for the route straight away.
setStart(at, name) {
  this.rt.from = { coordinates: at, name: name };
  this.rt.results = [];
  this.rt.fromText = '';
  this.rt.fromMsg = '';
  this.lm.setEndpoints(this.rt.from, this.rt.dest);
  this.calcRoute();
}

useGpsStart() {
  var self = this; // "this" is not the page component inside the callbacks below
  if (!navigator.geolocation) {
    this.rt.fromMsg = 'This browser cannot share your location. Choose on the map or search instead.';
    this.bump();
    return;
  }
  this.rt.fromMsg = 'Finding your location…';
  this.bump();
  function showPosition(position) {
    var you = [position.coords.longitude, position.coords.latitude];
    if (you[0] < -0.6 || you[0] > 0.4 || you[1] < 51.2 || you[1] > 51.75) {
      self.rt.fromMsg = 'You seem to be outside London. Choose a starting point on the map or search instead.';
      self.bump();
      return;
    }
    self.lm.setYou(you);
    self.setState({ you: you });
    self.setStart(you, 'Your location');
  }
  function showError() {
    self.rt.fromMsg = 'Location not shared. Choose on the map or search instead.';
    self.bump();
  }
  navigator.geolocation.getCurrentPosition(showPosition, showError,
    { enableHighAccuracy: true, timeout: 11000, maximumAge: 30000 });
}

// Search for a start point while the person types. Postcodes go to /api/postcode
// (postcodes.io); anything else goes to /api/journey/search (openrouteservice).
// The search waits until typing pauses for 450 ms, so the API is not asked on every key.
// W3Schools: https://www.w3schools.com/js/js_events_timing.asp (setTimeout and clearTimeout)
// W3Schools: https://www.w3schools.com/js/js_regexp.asp (the postcode pattern)
searchStart(q) {
  var self = this;
  var rt = this.rt;
  var text = q.trim();
  clearTimeout(this.fromTimer);
  rt.fromText = q;
  if (text.length < 3) {
    rt.results = [];
    rt.fromMsg = '';
    this.bump();
    return;
  }
  this.fromTimer = setTimeout(function () { self.runStartSearch(rt, text); }, 450);
  this.bump();
}
async runStartSearch(rt, text) {
  var i, results = [], response, data, at;
  var seq = this.fromSeq = (this.fromSeq || 0) + 1;
  var postcode = text.toUpperCase().replace(/\s+/g, '');
  rt.fromMsg = 'Searching…';
  this.bump();
  try {
    if (/^(?:[A-Z]{1,2}\d[A-Z\d]?\d[A-Z]{2}|[A-Z]{1,2}\d[A-Z\d]?)$/.test(postcode)) {
      at = await LondonData.getJSON('/api/postcode?postcode=' + encodeURIComponent(postcode));
      results.push({ name: at.postcode, where: 'Postcode', coordinates: [at.lon, at.lat] });
    } else {
      response = await fetch('/api/journey/search?q=' + encodeURIComponent(text));
      try { data = await response.json(); } catch (ignore) { data = {}; }
      if (!response.ok) throw new Error(data.error || 'Search is unavailable. Use your location or choose on the map.');
      data.results = data.results || [];
      for (i = 0; i < data.results.length; i++) {
        results.push({ name: data.results[i].name, where: 'Address or place', coordinates: data.results[i].coordinates });
      }
    }
    if (seq !== this.fromSeq || rt !== this.rt) return; // a newer search has started
    rt.results = results;
    if (results.length > 0) rt.fromMsg = 'Choose your starting point:';
    else rt.fromMsg = 'Nothing found. Try another name, use your location or choose on the map.';
  } catch (error) {
    if (seq !== this.fromSeq || rt !== this.rt) return;
    rt.results = [];
    if (/404/.test(error.message)) rt.fromMsg = 'Postcode not found.';
    else if (/422/.test(error.message)) rt.fromMsg = 'That postcode is outside London.';
    else if (/^\/api\S+ \d+$/.test(error.message)) rt.fromMsg = 'Search failed. Try again or choose on the map.';
    else rt.fromMsg = error.message;
  }
  this.bump();
}

async calcRoute() {
  var rt = this.rt;
  var seq, response, data, feature, line, i, error;
  if (!rt.dest || !rt.from) return;
  seq = ++rt.seq;
  rt.busy = true;
  rt.error = '';
  rt.result = null;
  rt.near = [];
  this.lm.setRoute(null);
  this.drawBarriers();
  this.bump();
  try {
    response = await fetch('/api/journey/route', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ start: rt.from.coordinates, end: rt.dest.coordinates, mode: rt.mode })
    });
    try { data = await response.json(); } catch (ignore) { data = {}; }
    if (!response.ok) {
      error = new Error(data.error || 'No route could be calculated.');
      error.status = response.status;
      throw error;
    }
    if (rt !== this.rt || seq !== rt.seq) return; // the person changed something meanwhile
    feature = data.features[0];
    rt.result = { geojson: data, distance: feature.properties.distance, duration: feature.properties.duration };

    line = feature.geometry.coordinates;
    for (i = 0; i < this.barriers.length; i++) {
      if (JourneyGeometry.nearRoute([this.barriers[i].lon, this.barriers[i].lat], line, 80)) rt.near.push(this.barriers[i]);
    }
    this.showRouteOnMap();
  } catch (err) {
    if (rt !== this.rt || seq !== rt.seq) return;
    if (err.status === 503) rt.error = 'Route suggestions are not switched on for this server (no routing key). You can still use the public transport options below.';
    else rt.error = err.message || 'The route could not be calculated.';
    rt.canRetry = (err.status !== 503 && err.status !== 400);
  } finally {
    if (rt === this.rt && seq === rt.seq) {
      rt.busy = false;
      this.bump();
    }
  }
}


showRouteOnMap() {
  var rt = this.rt;
  var points;
  if (!rt.result) return;
  this.lm.setRoute(rt.result.geojson);
  this.lm.setEndpoints(rt.from, rt.dest);
  this.drawBarriers();
  points = rt.result.geojson.features[0].geometry.coordinates.concat([rt.dest.coordinates]);
  this.lm.fitPoints(points);
}


clearRoute() {
  this.rt = this.newRoute(null, this.rt);
  if (this.lm) {
    this.lm.setRoute(null);
    this.lm.setEndpoints(null, null);
  }
  this.drawBarriers();
}


startPick(hint, done) {
  this.picking = { done: done };
  this.lm.setPicking(true);
  this.setState({ pickHint: hint, sheet: 'peek' }); // on a phone, lower the panel to show the map
}
mapClicked(at) {
  var done;
  if (!this.picking) return false; // a normal click: the map handles it
  done = this.picking.done;
  this.picking = null;
  this.lm.setPicking(false);
  this.setState({ pickHint: '', sheet: 'open' });
  done(at);
  return true;
}
cancelPick() {
  var done;
  if (!this.picking) return;
  done = this.picking.done;
  this.picking = null;
  this.lm.setPicking(false);
  this.setState({ pickHint: '', sheet: 'open' });
  done(null);
}


openReport(context, point, label) {
  if (!window.BarrierReport) return;
  if (!point && this.state.you) {
    point = this.state.you;
    label = 'Your location';
  }
  BarrierReport.open({ context: context, point: point, label: label });
}


  async updateOverview(cats, needs, key) {
    this.overviewKey = key;
    try {
      const query = new URLSearchParams();
      if (cats.length) query.set('cats', cats.slice().sort().join(','));
      if (needs.length) query.set('needs', needs.slice().sort().join(','));
      const url = '/api/places/overview' + (query.toString() ? '?' + query : '');
      const data = await LondonData.getJSON(url);
      if (this.overviewKey === key && this.lm) this.lm.setOverview(data);
    } catch (e) {
      if (this.overviewKey === key) this.toast('Map results could not be updated.');
      console.warn('Overview could not update', e);
    }
  }

handleMapMove() {
  if (!this.lm) return;
  clearTimeout(this.viewportTimer);
  const zoom = this.lm.map.getZoom();
  if (zoom < this.lm.VIEWPORT_ZOOM) {
    this.viewportToken = (this.viewportToken || 0) + 1;
    if (this.viewportMode !== 'overview') {
      this.viewportMode = 'overview';
      this.data = this.emptyLondonData();
      this.lm.setPlaces(this.data.places);
      this.viewKey = null;
      this.setState({ overview: true, loading: false, viewTick: (this.state.viewTick || 0) + 1 });
    }
    return;
  }
  const b = this.lm.map.getBounds();
  const bounds = [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()];
  const key = bounds.map((x) => x.toFixed(4)).join(',');
  if (key === this.viewportKey && this.viewportMode === 'places') {
    this.setState({ viewTick: (this.state.viewTick || 0) + 1 });
    return;
  }
  this.viewportTimer = setTimeout(async () => {
    const token = ++this.viewportToken;
    try {
      const data = await LondonData.loadViewport(bounds, this.ans);
      if (token !== this.viewportToken || this.lm.map.getZoom() < this.lm.VIEWPORT_ZOOM) return;
      this.data = data;
      this.viewportKey = key;
      this.viewportMode = 'places';
      LondonData.applyCrowd(data, this.ans);
      this.lm.setPlaces(data.places);
      this.viewKey = null;
      this.setState({ overview: false, loading: false, viewTick: (this.state.viewTick || 0) + 1 });
      if (this.pendingPlaceId && data.byId[this.pendingPlaceId]) {
        const id = this.pendingPlaceId;
        this.pendingPlaceId = null;
        this.pick(id, false);
      }
    } catch (e) {
      if (token !== this.viewportToken) return;
      console.error('Map viewport:', e);
      this.toast('Places could not be loaded in this area. Try moving the map.');
    }
  }, 180);
}


componentDidUpdate() {
  if (!this.lm) return;
  const S = this.state;
  const mode = S.mode || 'visit';
  const need = S.need || {};
  const rule = mode + '|' + ['ent', 'toilet'].filter((k) => need[k]).join(',') + '|' + (S.cats || []).join(',');
  if (rule !== this.lastRule) {
    this.lastRule = rule;
    const cats = S.cats || [];
    const activeNeeds = mode === 'visit' ? ['ent', 'toilet'].filter((k) => need[k]) : [];
    const overviewKey = mode + '|' + cats.slice().sort().join(',') + '|' + activeNeeds.join(',');
    if (overviewKey !== this.overviewKey) this.updateOverview(cats, activeNeeds, overviewKey);
    this.lm.setRule({ mode, needs: activeNeeds, cats });
  }
  const open = (S.level === 'area') ? (mode === 'visit' ? S.sel : (S.mstep !== 'list' ? S.cur : null)) : null;
  const focus = (S.hover || '') + '|' + (open || '');
  if (focus !== this.lastFocus) { this.lastFocus = focus; this.lm.setFocus(S.hover || null, open || null); }
  if (S.level === 'area' && !this.wasArea) this.lm.resize();

  if ((S.mode || 'visit') !== 'visit' && this.rt && this.rt.dest) this.clearRoute();

  if (this.panelState !== this.lastPanel) {
    this.lastPanel = this.panelState;
    const inner = document.querySelector('.ma-panel > div');
    if (inner) inner.scrollTop = 0;
  }
  this.wasArea = S.level === 'area';
}

setCollapsed(on) {
  this.setState({ collapsed: on });
  try { localStorage.setItem('al-map-only', on ? '1' : ''); } catch (e) { /* private window */ }
  if (this.lm) this.lm.setPanelOpen(!on);
}
// Send answers about one place (js/answers.js) and redraw it here straight away.
share(placeId, ans) {
  const code = this.data && this.data.code;
  if (!code) return;
  Answers.send(code, placeId, ans);
  LondonData.applyCrowd(this.data, this.ans);
  this.lm.refresh();
}

async goSearch(go) {
  this.setState({ q: '', level: 'area' });
  if (!go) return;
  if (go.postcode) {
    try {
      const at = await LondonData.getJSON('/api/postcode?postcode=' + encodeURIComponent(go.postcode));
      this.pendingPlaceId = null;
      this.lm.map.jumpTo({ center: [at.lon, at.lat], zoom: 15.5 });
      this.handleMapMove();
      this.toast('Showing ' + at.postcode);
    } catch (e) {
      this.toast(e.message.includes('422') ? 'That postcode is outside London.' :
        e.message.includes('404') ? 'Postcode not found.' : 'Could not look up that postcode.');
    }
    return;
  }
  if (go.id) {
   
    try {
      const at = await LondonData.getJSON('/api/places/locate?id=' + encodeURIComponent(go.id));
      this.pendingPlaceId = go.id;
      this.lm.flyTo([at.lon, at.lat], 16);
      this.handleMapMove();
    } catch (e) { this.toast('Could not find that place.'); }
  } else if (go.code) {
    await this.openArea(go.code);
  }
}

loadIndex() {
  if (this.indexLoading) return;
  this.indexLoading = true;
  LondonData.getJSON('/api/search-index').then((ix) => { this.index = ix; this.setState({ indexTick: 1 }); }).catch(() => { this.indexLoading = false; });
}
toast(t) { this.setState({ toast: t }); clearTimeout(this.tt); this.tt = setTimeout(() => this.setState({ toast: null }), 2600); }


showCity(event) {
  if (event) event.preventDefault();
  if (this.state.collapsed) this.setCollapsed(false);
  this.setState({ level: 'city', tileHover: null, sel: null, cur: null,
    hover: null, vstep: 'list', mstep: 'list', q: '', sheet: 'open' });
}
closeCity() {
  this.setState({ level: 'area', sel: null, cur: null, hover: null,
    vstep: 'list', mstep: 'list', q: '' });
  this.lm.resize();
  this.handleMapMove();
}

async goHome(event) {
  if (event) event.preventDefault();
  history.replaceState(null, '', location.pathname + location.search);
  this.pendingPlaceId = null;
  this.clearRoute(); // added Nov 2026: a new start has no route
  this.setState({ mode: 'visit', level: 'area', area: null, sel: null,
    cur: null, hover: null, q: '', vstep: 'list', mstep: 'list' });
  await this.lm.openLondon();
  this.handleMapMove();
}

async openArea(code, placeId) {
  const b = this.boroughs.find((x) => x.code === code);
  if (!b) return;
  this.setState({ level: 'area', area: null, sel: null, cur: null,
    hover: null, vstep: 'list', mstep: 'list', q: '', sheet: 'open' });
  if (placeId) {
    await this.goSearch({ code, id: placeId });
    return;
  }
  try {
    const outline = await LondonData.getJSON('/api/boundaries/' + encodeURIComponent(code));
    await this.lm.fitBorough(outline);
    this.handleMapMove();
  } catch (e) {
    console.error(e);
    this.toast('Unable to open ' + b.name + '.');
  }
}

hoverCard(id) {
  const S = this.state, D = LondonData;
  const f = this.data && this.data.byId[id];
  if (!f) return '';
  const p = f.properties, V = (S.mode || 'visit') === 'visit';
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const m = S.you ? D.metres(S.you, f.geometry.coordinates) : null;
  const far = m == null ? '' : m > 4000 ? ' · ' + D.distanceText(m) + ' away' : ' · ' + D.minutes(m) + ' min away';
  const svg = (d, c) => '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="' + c + '" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="' + d + '"/></svg>';
  const SAY = { yes: ['#2F6B3C', 'none', '#FFFFFF', 'Yes'], partly: ['#7D7866', 'none', '#FFFFFF', 'Partly'], no: ['#7D7866', 'none', '#FFFFFF', 'No'], unknown: ['#FFFFFF', '2px dashed #6E6F5C', '#26261F', 'Not known'] };
  const ICONS = { ent: D.ICON.toilet /* the wheelchair figure */, lift: D.ICON.lift };
  const NAME = { ent: 'Step-free', toilet: 'Toilet', lift: 'Lift' };
  const keys = ['ent', 'toilet'].concat(D.answer(p, 'lift') !== 'unknown' ? ['lift'] : []);
  const chips = keys.map((k) => {
    const v = D.answer(p, k), s = SAY[v];
    const mark = k === 'toilet' ? '<span style="font-size:11px;font-weight:700;letter-spacing:0.02em;color:' + s[2] + '">WC</span>' : svg(ICONS[k], s[2]);
    return '<span class="ch"><span class="ci" style="background:' + s[0] + ';border:' + s[1] + '">' + mark + '</span>' + NAME[k] + ': ' + s[3] + '</span>';
  }).join('');
  let note = '';
  if (!V) note = p.ans ? 'You answered this place' : p.one ? 'One answer so far: 1 more confirms it' : D.answer(p, 'ent') === 'unknown' ? 'Nobody has answered yet. Tap to help' : '';
  else if (p.crowd && p.crowd.ent && p.crowd.ent.confirmed) note = 'Checked by ' + p.crowd.devices + ' people who agree';
  return '<b>' + esc(p.name) + '</b><span class="tm">' + esc(D.KIND[p.sub] || 'Place') + far + '</span>' +
    '<span class="tc">' + chips + '</span>' + (note ? '<span class="tn">' + note + '</span>' : '') +
    (p.crowd && p.crowd.simulated ? '<span class="sim">Simulated test data</span>' : '');
}
pick(id, fly) {
  const S = this.state;
  const f = this.data && this.data.byId[id];
  if (!f) return;
  if (S.collapsed) this.setCollapsed(false); // the place's details are in the panel
  if ((S.mode || 'visit') === 'visit') {

    this.selFeature = f;
    if (this.rt.dest && this.rt.dest.id !== id) this.clearRoute();
    this.setState({ sel: id, vstep: 'place', sheet: 'open', hover: null });
    LondonData.loadPlaceDetails(id).then((details) => {
      if (this.data && this.data.byId[id]) {
        this.data.details[id] = details;
        this.setState({ viewTick: (this.state.viewTick || 0) + 1 });
      }
    }).catch(() => {});
  }
  else if (f.properties.wc === 'unknown' && !f.properties.ans) this.setState({ cur: id, mstep: 'confirm', sheet: 'open', hover: null });
  else { this.toast(f.properties.ans ? 'You already answered ' + f.properties.name + '. Thanks.' : f.properties.name + ' is already known.'); return; }
  if (fly) this.lm.flyTo(f.geometry.coordinates, 16);
}

feature(id, kept) {
  var f;
  if (!id) return null;
  if (this.data && this.data.byId[id]) {
    f = this.data.byId[id];
    return f;
  }
  if (kept && kept.properties.id === id) return kept;
  return null;
}

locate(then) {
  if (!navigator.geolocation) { this.toast('Your browser can’t share your location'); return; }
  this.toast('Finding where you are…');
  navigator.geolocation.getCurrentPosition(async (pos) => {
    const you = [pos.coords.longitude, pos.coords.latitude];
    this.lm.setYou(you);
    if (typeof then === 'function') { this.setState({ you, toast: null }); then(you); return; }
    const code = await LondonData.boroughAt(you);
    if (!code) { this.setState({ you }); this.toast('You seem to be outside London'); return; }
    this.setState({ you, level: 'area', sel: null, cur: null,
      vstep: 'list', mstep: 'list' });
    this.lm.flyTo(you, 15.5);
    this.handleMapMove();
    this.toast('Showing places near you');
  }, () => this.toast('Location not shared. You can still look around the map.'), { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 });
}


routeVals(selF) {
  var self = this;
  var rt = this.rt;
  var r, details, status, i, list;
  var MODES = [['wheelchair', 'Wheelchair'], ['foot-walking', 'Walking']];
  if (!rt || !rt.dest) return { destName: '', modes: [], results: [], near: [] };
  r = rt.result;
  details = this.detailCache[rt.dest.id] || {};

  function reportDate(value) {
    var d = new Date(value);
    if (isNaN(d.getTime())) return '';
    return 'Reported ' + d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  }
  function chooseStart(coordinates, name) {
    rt.changing = false;
    self.setStart(coordinates, name);
  }


  status = '';
  if (rt.busy) status = 'Finding a suggested route…';
  else if (!rt.from && this.routingOn === false) status = 'Route suggestions are not switched on for this server. Public transport options are below.';
  else if (!rt.from) status = 'Choose a starting point to see the route.';
  else if (r && rt.near.length === 1) status = 'Route ready. 1 reported barrier near it.';
  else if (r && rt.near.length > 1) status = 'Route ready. ' + rt.near.length + ' reported barriers near it.';
  else if (r) status = 'Route ready. No reviewed barrier reports near it.';


  var results = [];
  for (i = 0; i < rt.results.length; i++) {
    results.push(makeResult(rt.results[i]));
  }
  function makeResult(x) {
    return { name: x.name, where: x.where, pick: function () { chooseStart(x.coordinates, x.name); } };
  }


  var modes = [];
  for (i = 0; i < MODES.length; i++) {
    modes.push(makeMode(MODES[i][0], MODES[i][1]));
  }
  function makeMode(key, label) {
    var on = (rt.mode === key);
    return {
      label: label,
      pressed: on ? 'true' : 'false',
      bg: on ? '#26261F' : 'transparent',
      fg: on ? '#F2F3DC' : '#26261F',
      border: on ? '2px solid #26261F' : '2px solid #C9C9AE',
      pick: function () {
        if (rt.mode === key) return;
        rt.mode = key;
        if (rt.from) self.calcRoute(); else self.bump();
      }
    };
  }


  list = [];
  for (i = 0; i < rt.near.length; i++) {
    list.push(makeNear(rt.near[i]));
  }
  function makeNear(b) {
    return {
      name: (window.BarrierReport && BarrierReport.NAMES[b.type]) || 'Reported problem',
      when: reportDate(b.created_at),
      open: function () { self.lm.flyTo([b.lon, b.lat], 17); BarrierReport.showDetail(b); }
    };
  }

  return {
    destName: rt.dest.name,
    destMeta: (details.a ? details.a + ' · ' : '') + rt.dest.coordinates[1].toFixed(5) + ', ' + rt.dest.coordinates[0].toFixed(5),
    fromName: rt.from ? rt.from.name : 'Not chosen yet',
    askStart: !rt.from || !!rt.changing,
    hasStart: !!rt.from && !rt.changing,
    useGps: function () { rt.changing = false; self.useGpsStart(); },
    pickOnMap: function () {
      self.startPick('Tap or click the map where you are starting from.', function (at) {
        if (at) chooseStart(at, 'Point chosen on the map');
      });
    },
    changeStart: function () { rt.changing = true; self.bump(); },
    fromText: rt.fromText,
    fromMsg: rt.fromMsg,

    onFromInput: function (event) { self.searchStart(event.target.value); },
    onFromKey: function (event) {
      if (event.key !== 'Enter') return;
      event.preventDefault();
      if (rt.results.length > 0) chooseStart(rt.results[0].coordinates, rt.results[0].name);
      else self.searchStart(event.target.value);
    },
    hasResults: results.length > 0,
    results: results,
    modes: modes,
    modeText: rt.mode === 'wheelchair' ? 'wheelchair route' : 'walking route',
    status: status,
    hasError: !!rt.error,
    error: rt.error,
    canRetry: rt.canRetry,
    retry: function () { self.calcRoute(); },
    hasRoute: !!r,
    time: (r && r.duration) ? Math.max(1, Math.ceil(r.duration / 60)) + ' min' : '',
    distance: (r && r.distance) ? LondonData.distanceText(r.distance) : '',
    nearText: rt.near.length > 0
      ? 'Reviewed community reports within about 80 m of the route. Select one for details.'
      : 'No reviewed reports near this route. That does not guarantee it is barrier-free.',
    near: list,
    report: function () { self.openReport('route'); },

    goOptions: function () {
      var near = self.near.stepFree;
      var you = self.state.you;
      self.lm.showTrip(selF, near, you);
      self.setState({ vstep: 'go' });
      if (!you) self.locate(function (me) { self.lm.showTrip(selF, near, me); });
    }
  };
}


renderVals() {
const S = this.state;
const mode = S.mode || 'visit';
const V = mode === 'visit';

const level = S.level || 'area'; // city = optional borough data view
const need = S.need || { ent: false, toilet: false };
const cats = S.cats || []; // kinds of place picked; none picked means all
const q = (S.q || '').trim().toLowerCase();
const vstep = S.vstep || 'list';
const mstep = S.mstep || 'list';
const sheet = S.sheet || 'open';
const collapsed = !!S.collapsed;
const D = LondonData;
const IC = D.ICON;
const B = (this.boroughs || []).map((b) => [b.ui, b.name, b.row, b.col, b.score, b.checked, b.scoreOk, b.unknown, b.code]);
const greens = ['#E3E9C9', '#C2D69E', '#8DB866', '#4E8A4F', '#2A5E35'];
const oranges = ['#F6E9D2', '#F2C994', '#E8973F', '#C2602A', '#7E3417'];

const gl = (s) => s < 60 ? 0 : s < 65 ? 1 : s < 69 ? 2 : s < 72 ? 3 : 4;
const ol = (m) => m < 75 ? 0 : m < 85 ? 1 : m < 90 ? 2 : m < 95 ? 3 : 4;
const KEYS = ['ent', 'toilet', 'lift'];
const NEEDN = { ent: 'Step-free way in', toilet: 'Accessible toilet', lift: 'Lift to other floors' };
const SHORT = { ent: 'Step-free', toilet: 'Toilet', lift: 'Lift' };
const chosen = ['ent', 'toilet'].filter((k) => need[k]);
const val = (p, k) => D.answer(p, k);
const status = (p, ks) => {
  const vs = (ks || (chosen.length ? chosen : ['ent'])).map((k) => val(p, k));
  if (vs.some((v) => v === 'no' || v === 'partly')) return 'nofit';
  if (vs.some((v) => v === 'unknown')) return 'unknown';
  return 'fit';
};
// Pin colours, the same as the map's (js/map-look.js LOOK)
const look = (st) => st === 'fit' ? { bg: '#2F6B3C', fg: '#FFFFFF', border: '3px solid #FFFFFF', op: 1 } : st === 'unknown' ? { bg: '#FFFFFF', fg: '#26261F', border: '3px dashed #4B4C3D', op: 1 } : { bg: '#7D7866', fg: '#FFFFFF', border: '3px solid #FFFFFF', op: 0.9 };
const MARK = {
  yes: { text: 'Yes', fg: '#2A5E35', dot: '#2F6B3C', mark: '✓', bg: '#DCE7C4', border: 'none' },
  partly: { text: 'Partly', fg: '#7A3A12', dot: '#9A6A3A', mark: '~', bg: '#ECE3CF', border: 'none' },
  no: { text: 'No', fg: '#7A3A12', dot: '#5C5D4C', mark: '✕', bg: '#ECE3CF', border: 'none' },
  unknown: { text: 'Not known', fg: '#5C5D4C', dot: 'transparent', mark: '?', bg: '#E9EBCD', border: '2px dashed #8E8F78' }
};
const you = S.you || null;
const isCity = level === 'city';
const areaB = B.find((x) => x[8] === S.area);
const areaName = areaB ? areaB[1] : 'London';
const data = !isCity && this.data ? this.data : null;

const tiles = [];
for (let r = 0; r < 7; r++) for (let c = 0; c < 8; c++) {
  const b = B.find((x) => x[2] === r && x[3] === c);
  if (!b) { tiles.push({ isTile: false, isEmpty: true }); continue; }
  const low = !b[6], miss = b[7], lv = V ? gl(b[4]) : ol(miss);
  tiles.push({ isTile: true, isEmpty: false, code: b[0],
    label: V ? 'Open ' + b[1] + ' map' + (low ? ', insufficient data to score' : ', score ' + b[4] + ' out of 100') : 'Open ' + b[1] + ' map, ' + miss + '% of places unknown',
    bg: V ? (low ? '#DCDAC8' : greens[lv]) : oranges[lv],
    fg: (V && low) ? '#5C5D4C' : (lv >= 3 ? '#F2F3DC' : '#26261F'),
    border: V && low ? '2px dashed #8E8F78' : '3px solid transparent',
    pick: () => this.openArea(b[8]),
    enter: () => this.setState({ tileHover: b[8] }), leave: () => this.setState({ tileHover: null }) });
}
const hb = B.find((x) => x[8] === S.tileHover);
const hoverText = hb ? (V ? (!hb[6] ? hb[1] + ': not enough step-free data to score' : hb[1] + ': step-free score ' + hb[4] + '/100 (reported places only)') : hb[1] + ': ' + hb[7] + '% of places lack step-free information') : (V ? 'Choose a borough to find places and check accessibility details.' : 'Choose a borough to see where accessibility information is missing.');

const CATN = { food: 'Food and drink', park: 'Park', museum: 'Museum or gallery', shop: 'Shop', toilet: 'Toilet' };
let suggest = [];
if (q.length >= 2) {
  const sk = q + '|' + (data ? data.code : '') + '|' + (this.index ? 1 : 0) + '|' + mode;
  if (sk !== this.sugKey) {
    this.sugKey = sk;
    
    const first = (name) => { const n = name.toLowerCase(); return (n === q ? 0 : n.startsWith(q) ? 1 : 2) * 1000 + n.length; };
    const out = [];
    const normalisedPostcode = q.toUpperCase().replace(/\s+/g, '');
    const isFullPostcode = /^(?:GIR0AA|[A-Z]{1,2}\d[A-Z\d]?\d[A-Z]{2})$/.test(normalisedPostcode);
    const isDistrict = /^[A-Z]{1,2}\d[A-Z\d]?$/.test(normalisedPostcode);
    if (isFullPostcode || isDistrict) out.push({
      name: q.toUpperCase(), where: isFullPostcode ? 'Go to postcode' : 'Go to postcode area',
      icon: IC.visit, bg: '#E3E6C4', fg: '#26261F', border: 'none', go: { postcode: normalisedPostcode }
    });
    B.filter((b) => b[1].toLowerCase().includes(q)).slice(0, 3).forEach((b) => out.push({ name: b[1], where: 'Borough: open its map',
      icon: IC.map, bg: V ? '#E3E6C4' : '#F6E3CC', fg: '#26261F', border: 'none', go: { code: b[8] } }));
    const here = data ? data.places.features.filter((f) => f.properties.name.toLowerCase().includes(q))
      .sort((a, b) => first(a.properties.name) - first(b.properties.name)).slice(0, 5) : [];
    here.forEach((f) => { const lk = look(status(f.properties)); out.push({ name: f.properties.name, where: (D.KIND[f.properties.sub] || 'Place') + ' · ' + areaName,
      icon: IC[f.properties.cat], bg: lk.bg, fg: lk.fg, border: lk.border.replace('3px', '2px'), go: { code: data.code, id: f.properties.id } }); });
    if (this.index) {
      const ix = this.index, nb = {};
      B.forEach((b) => { nb[b[8]] = b[1]; });
      const far = [];
      for (const r of ix.places) {
        if (far.length >= 30) break;
        if (ix.codes[r[2]] === (data && data.code)) continue;
        if (r[0].toLowerCase().includes(q)) far.push(r);
      }
      far.sort((a, b) => first(a[0]) - first(b[0])).slice(0, 8 - out.length).forEach((r) => out.push({ name: r[0], where: CATN[r[3]] + ' · ' + nb[ix.codes[r[2]]],
        icon: IC[r[3]], bg: '#ECEDD3', fg: '#26261F', border: 'none', go: { code: ix.codes[r[2]], id: D.fullId(r[1]) } }));
    }
    this.sug = out.slice(0, 8);
  }
  suggest = this.sug;
}
this.firstSuggest = suggest[0] ? suggest[0].go : null;

let inView = [];
if (data && !isCity && !S.overview) {
  const key = [S.viewTick, cats.join(), chosen.join(), mode, D.answerCount(this.ans), you ? you.join() : ''].join('|');
  if (key !== this.viewKey) {
    this.viewKey = key;
    const from = you || this.lm.centre();
    this.view = this.lm.placesInView().filter((f) =>
      (!cats.length || cats.includes(f.properties.cat)) &&
      (!V || chosen.every((k) => D.answer(f.properties, k) === 'yes'))
    ).map((f) => ({ f, p: f.properties, m: D.metres(from, f.geometry.coordinates) }));
  }
  inView = this.view || [];
}
const ord = { fit: 0, unknown: 1, nofit: 2 };
const sorted = inView.slice().sort((a, b) => ord[status(a.p)] - ord[status(b.p)] || a.m - b.m);
const fitN = inView.filter((x) => status(x.p) === 'fit').length;
const noMatch = !isCity && V && vstep === 'list' && chosen.length > 0 && inView.length === 0 && !S.overview;
let dropKey = null;
if (noMatch && chosen.length) dropKey = chosen[chosen.length - 1];
const marksFor = (p) => (chosen.length ? chosen : ['ent', 'toilet']).map((k) => { const m = MARK[val(p, k)]; return { text: SHORT[k] + ': ' + m.text, bg: m.bg, fg: m.fg, border: m.border === 'none' ? 'none' : '1.5px dashed #8E8F78' }; });
const LIST = 30;

var self = this;
const selF = data ? this.feature(S.sel, this.selFeature) : null;
if (selF) this.selFeature = selF;
const selP = selF ? selF.properties : null;
let pl = {}, go = {};
if (selP) {
  const st = status(selP), lk = look(st);
  const more = data.details[selP.id] || {};
  const m = you ? D.metres(you, selF.geometry.coordinates) : null;
  const wc = val(selP, 'ent');
  const verdictText = { yes: 'Step-free way in', partly: 'Partly step-free', no: 'No step-free way in', unknown: 'Step-free way in not known yet' };
  pl = { name: selP.name, icon: IC[selP.cat],
    meta: (D.KIND[selP.sub] || 'Place') + (m != null ? ', ' + D.distanceText(m) + ', ' + D.minutes(m) + ' min walk' : (more.a ? ', ' + more.a : '')),
    pinBg: lk.bg, pinFg: lk.fg, pinBorder: lk.border,
    verdict: !chosen.length ? verdictText[wc] : (st === 'fit' ? 'Has everything you asked for' : st === 'unknown' ? 'Some of what you need is not known' : 'Doesn’t have everything you need'),
    vBg: st === 'fit' ? '#2F6B3C' : st === 'unknown' ? '#F2F3DC' : '#ECE3CF', vFg: st === 'fit' ? '#F2F3DC' : st === 'unknown' ? '#4B4C3D' : '#7A3A12',
    vBorder: st === 'unknown' ? '2px dashed #8E8F78' : 'none',
    rows: chosen.concat(KEYS.filter((k) => !chosen.includes(k))).map((k) => {
      const v = val(selP, k), mk = MARK[v];
      return { label: NEEDN[k], icon: IC[k], mine: chosen.includes(k), bg: chosen.includes(k) ? '#E3E6C4' : '#ECEDD3',
        value: mk.text, fg: mk.fg, dot: mk.dot, mark: mk.mark, dotBorder: mk.border };
    }),
    note: more.n ? 'A mapper wrote: “' + more.n + '”' : '',
    facts: [m != null && more.a ? more.a : '', more.h ? 'Open: ' + D.readableHours(more.h) : ''].filter(Boolean),
    web: more.w || '',
    confirm: D.sourceText(selP, more),
    hasGap: KEYS.some((k) => val(selP, k) === 'unknown') };

  const near = D.stationsNear(this.stations || [], selF.geometry.coordinates);
  const [lon, lat] = selF.geometry.coordinates;
  go = { hasDistance: m != null, noDistance: m == null,
    locate: () => { const near = this.near.stepFree; this.locate((me) => this.lm.showTrip(selF, near, me)); },
    km: m != null ? D.distanceText(m) : '', line: m != null ? (m < 2500 ? 'About ' + D.minutes(m) + ' min wheeling or walking at an easy pace.' : 'That’s a long way to wheel or walk. A step-free station below may be easier.') : '',
    why: you ? '' : 'We can’t see where you are, so we can’t say how far it is.',
    heroBg: m != null ? '#233A6B' : '#E9ECF3', heroFg: m != null ? '#FBFBF2' : '#26261F',
    google: 'https://www.google.com/maps/dir/?api=1&destination=' + lat + ',' + lon + '&travelmode=transit',
    warn: near.warn ? near.warn.name + ' is the closest station (' + D.distanceText(near.warn.m) + '), but it is not step-free.' : '',
    stations: near.stepFree.map((s, i) => ({ letter: String.fromCharCode(65 + i), name: s.name, lines: (s.lines.join(', ') || 'Rail') + ' · ' + D.STATION[s.type],
      dist: D.distanceText(s.m) + ' from the station to the place, about ' + D.minutes(s.m) + ' min' })) };
  this.near = near;
}
const rep = S.rep || {};
const REP = [['door', 'Steps at the door'], ['toilet', 'Toilet not usable'], ['lift', 'Lift not working'], ['closed', 'Closed'], ['other', 'Something else']];
const repAny = REP.some((r) => rep[r[0]]);

const gapList = inView.filter((x) => x.p.wc === 'unknown').sort((a, b) => (a.p.ans ? 1 : 0) - (b.p.ans ? 1 : 0) || (b.p.one ? 1 : 0) - (a.p.one ? 1 : 0) || a.m - b.m);
const remaining = gapList.filter((x) => !x.p.ans);
const curF = data && S.cur ? data.byId[S.cur] : null;
const cur = curF ? curF.properties : null;
const qKeys = S.qKeys || [];
const qi = S.qi || 0;
const QD = {
  ent: { t: 'Is there a step-free way in?', h: 'A level door, a ramp or a lift from the street.', o: [['yes', 'Yes'], ['no', 'No'], ['unsure', 'Not sure']] },
  toilet: { t: 'Is there an accessible toilet?', h: 'Room to turn a wheelchair, with grab rails.', o: [['yes', 'Yes'], ['no', 'No'], ['unsure', 'Not sure']] },
  lift: { t: 'Can you reach every floor without stairs?', h: 'A lift or ramps inside. One floor only counts too.', o: [['yes', 'Yes'], ['one', 'One floor only'], ['no', 'No'], ['unsure', 'Not sure']] }
};
const startFlow = (id) => { this.setState({ mode: 'map', level: 'area', mstep: 'confirm', cur: id, sel: null, sheet: 'open' }); const f = data.byId[id]; if (f) this.lm.flyTo(f.geometry.coordinates, 16); };
const next = remaining.find((x) => x.p.id !== S.cur);
const qk = qKeys[qi] || 'ent';
const awn = { food: '#C2602A', shop: '#2F6B3C', museum: '#233A6B', toilet: '#4E8A4F', park: '#4E8A4F' };
const addrOf = (p) => (data && data.details[p.id] && data.details[p.id].a) || D.KIND[p.sub] || 'Place';
const distOf = (x) => you ? D.distanceText(x.m) : '';
// What happens to answers, depending on the connection (js/answers.js)
const live = S.live || Answers.status();
const LIVE = {
  live: ['#4E8A4F', 'Live: answers are shared. A place shows for everyone once two people agree.'],
  connecting: ['#E8973F', 'Connecting… Answers are kept and sent once connected.'],
  offline: ['#C2602A', 'Offline: answers are kept and sent when the connection is back.'],
  local: ['#9A9B82', 'Sharing isn’t switched on yet, so answers stay on this device.']
}[live] || ['#9A9B82', ''];
const saveNote = LIVE[1];
const curResult = S.cur ? Answers.result(S.cur) : null;
const nowConfirmed = !!(curResult && curResult.ent && curResult.ent.confirmed);

const panelState = isCity ? 'city' : (V ? 'v-' + vstep : 'm-' + mstep);
this.panelState = panelState + '|' + (S.sel || S.cur || '');
const hasData = !!data && !S.loading;
return {
bg: V ? '#F2F3DC' : '#F7EEDD', line: V ? '#D3D4B8' : '#E3D3BC', dark: V ? '#1F4A2A' : '#8A3B1C',
switchBg: V ? '#E3E6C4' : '#F0DFC6', panelBg: V ? '#F2F3DC' : '#F7EEDD', cardBg: V ? '#E3E6C4' : '#F6EDDC',
accent: V ? '#2F6B3C' : '#C2602A', accentText: V ? '#2F6B3C' : '#B4562A',
ctaBg: V ? '#2F6B3C' : '#E8873A', ctaFg: V ? '#F2F3DC' : '#26261F',
modes: [
  { label: 'Visitor', icon: IC.visit, pressed: V ? 'true' : 'false', bg: V ? '#2F6B3C' : 'transparent', fg: V ? '#F2F3DC' : '#26261F', pick: () => this.setState({ level: 'area', mode: 'visit', sel: null, vstep: 'list', mstep: 'list', cur: null, hover: null }) },
  { label: 'Mapper', icon: IC.map, pressed: V ? 'false' : 'true', bg: V ? 'transparent' : '#E8873A', fg: '#26261F', pick: () => this.setState({ level: 'area', mode: 'map', sel: null, vstep: 'list', mstep: 'list', cur: null, hover: null }) }
],
mapVis: isCity ? 'hidden' : 'visible',
showOverviewNote: !isCity && !!S.overview,
isVisit: V, isCity: isCity, isArea: !isCity,
lawnA: V ? '#4A8549' : '#D9B77F', lawnB: V ? '#52914F' : '#E0C08B', lawnC: V ? '#8DB866' : '#EBD3A6',
path: V ? '#EDE9CC' : '#F7EEDD', pathLine: V ? '#D6D1AE' : '#E3D3BC', treeA: V ? '#3E7A45' : '#C49A5E', treeB: V ? '#4E8A4F' : '#D1AA6E',
tiles: tiles, hoverText: hoverText,
legend: V ? greens : oranges,
legendLow: V ? 'Lower score' : 'Fewer gaps',
legendHigh: V ? 'Higher score' : 'More gaps',
boroughHeading: V ? 'Step-free access across London' : 'Where accessibility information is missing',
boroughDataNote: V
  ? 'Scores reflect step-free information for rated places, not a borough’s overall accessibility.'
  : 'Tiles show the share of places without step-free information, not how accessible a borough is.',
areaName: areaName,
loading: !!S.loading, loadingText: S.loadingText || '',
toCity: () => this.showCity(),
closeCity: () => this.closeCity(),
goHome: (event) => this.goHome(event),
zoomIn: () => this.lm.zoomBy(1), zoomOut: () => this.lm.zoomBy(-1),
locate: () => this.locate(),
legendNote: V ? 'Small dots are shops and places nobody has checked. Zoom in to see them as pins.' : 'Small dots are shops. Zoom in to see them as pins.',
legendTitle: V ? (chosen.length ? 'What you need' : 'Step-free way in') : 'Answers',
pinLegend: V ? [{ text: chosen.length ? 'Has it' : 'Yes', bg: '#2F6B3C', border: '3px solid #FFFFFF' }, { text: 'Not known yet', bg: '#FFFFFF', border: '3px dashed #4B4C3D' }, { text: chosen.length ? 'Doesn’t have it' : 'No, or partly', bg: '#7D7866', border: '3px solid #FFFFFF' }]
  : [{ text: 'Nobody knows yet', bg: '#FFFFFF', border: '3px dashed #B4562A' }, { text: 'You answered', bg: '#E8873A', border: '3px solid #FFFFFF' }, { text: 'Already known', bg: '#5E9440', border: '3px solid #FFFFFF' }],
panelClass: 'ma-panel' + (sheet === 'peek' ? ' ma-peek' : '') + (collapsed ? ' ma-collapsed' : ''),
stageClass: 'ma-stage' + (collapsed ? ' is-collapsed' : ''),
togglePanel: () => this.setCollapsed(!collapsed),
panelExpanded: collapsed ? 'false' : 'true',
panelTabLabel: collapsed ? 'Show the panel' : 'Hide the panel to see only the map',
panelTabIcon: collapsed ? 'M9 5l7 7-7 7' : 'M15 5l-7 7 7 7',
panelLabel: isCity ? 'Choose an area' : (V ? 'Places' : 'Mapping'),
toggleSheet: () => this.setState({ sheet: sheet === 'peek' ? 'open' : 'peek' }), sheetLabel: sheet === 'peek' ? 'Show the panel' : 'Show more of the map', sheetOpen: sheet === 'peek' ? 'false' : 'true',
pCity: panelState === 'city', pVList: panelState === 'v-list' && hasData, pVPlace: panelState === 'v-place' && !!selP, pVGo: panelState === 'v-go' && !!selP,
pVRoute: panelState === 'v-route' && !!selP && !!this.rt.dest, // added Nov 2026
pVReport: panelState === 'v-report' && !!selP, pVReported: panelState === 'v-reported' && !!selP,
pMList: panelState === 'm-list' && hasData, pMConfirm: panelState === 'm-confirm' && !!cur, pMQ: panelState === 'm-q' && !!cur, pMReview: panelState === 'm-review' && !!cur, pMDone: panelState === 'm-done',
cityTitle: 'Explore borough data',
cityIntro: V
  ? 'Compare available step-free information by London borough. Return to the map to find specific places.'
  : 'See where information is missing across London, or go back to the map to contribute.',
cityHint: V
  ? 'Choose a borough to zoom directly to that part of the map.'
  : 'Choose a borough to zoom directly to that part of the map.',
cityHelpTitle: V ? 'Know a place? Help others.' : 'Every answer helps.',
cityHelpText: V
  ? 'Select Mapper above to share accessibility information about places you have visited. No sign-up needed.'
  : 'Answer a few short questions about a place you know. Your answers help fill gaps in the map. No sign-up needed.',
q: S.q || '', onSearch: (e) => { this.loadIndex(); this.setState({ q: e.target.value }); },
onSearchKey: (e) => { if (e.key === 'Enter' && this.firstSuggest) { e.preventDefault(); this.goSearch(this.firstSuggest); } else if (e.key === 'Escape') this.setState({ q: '' }); },
searchLabel: 'Search for a place, borough or postcode', searchHint: isCity ? 'Search borough or postcode' : 'Search places or postcodes',
suggest: suggest.map((m) => Object.assign({}, m, { pick: () => this.goSearch(m.go) })), hasSuggest: suggest.length > 0,
noSuggest: q.length >= 2 && suggest.length === 0 && (!!this.index || isCity), noSuggestText: this.index ? 'Nothing in London matches that name yet.' : 'Searching London…',
topFade: 'transparent',
toggle3d: () => { const on = !S.threeD; this.setState({ threeD: on }); this.lm.setThreeD(on); }, threeDPressed: S.threeD ? 'true' : 'false',
useLocation: () => this.locate(),
askLocation: !you,
needs: ['ent', 'toilet'].map((k) => ({ label: NEEDN[k], icon: IC[k], pressed: need[k] ? 'true' : 'false',
  bg: need[k] ? '#DCE7C4' : '#FBFBF2', border: need[k] ? '2px solid #2F6B3C' : '2px solid #D3D4B8', iconBg: need[k] ? '#2F6B3C' : '#E3E6C4', iconFg: need[k] ? '#F2F3DC' : '#4B4C3D',
  toggle: () => { const n = Object.assign({}, need); n[k] = !n[k]; this.setState({ need: n }); } })),
// Kinds of place: pick as many as you like. "All" clears the picks.
cats: [['all', 'All'], ['food', 'Food'], ['park', 'Parks'], ['museum', 'Museums'], ['shop', 'Shops'], ['toilet', 'Toilets']].map((c) => {
  const on = c[0] === 'all' ? !cats.length : cats.includes(c[0]);
  return { label: c[1], icon: c[0] === 'all' ? '' : IC[c[0]], pressed: on ? 'true' : 'false',
    bg: on ? '#26261F' : 'transparent', fg: on ? '#F2F3DC' : '#26261F', border: on ? '2px solid #26261F' : '2px solid #C9C9AE',
    pick: () => this.setState({ cats: c[0] === 'all' ? [] : (cats.includes(c[0]) ? cats.filter((x) => x !== c[0]) : cats.concat(c[0])) }) };
}),
countText: S.overview ? '' : inView.length.toLocaleString('en-GB') + (inView.length === 1 ? ' place on the map' : ' places on the map'),
moreText: data && data.truncated ? 'This area has many places. Zoom in to load more.' : sorted.length > LIST ? 'Showing the ' + LIST + ' best matches. Zoom in or pick a kind of place to see others.' : '',
noMatch: noMatch, dropText: dropKey ? 'Show places without ' + NEEDN[dropKey].toLowerCase() : '',
dropNeed: () => { if (dropKey) { const n = Object.assign({}, need); n[dropKey] = false; this.setState({ need: n }); } },
results: sorted.slice(0, LIST).map((x) => { const p = x.p, st = status(p), lk = look(st); return { name: p.name, icon: IC[p.cat], min: D.minutes(x.m), hasMin: !!you, marks: marksFor(p),
  pinBg: lk.bg, pinFg: lk.fg, pinBorder: lk.border, op: st === 'nofit' ? 0.72 : 1, bg: '#E3E6C4',
  aria: p.name + (you ? ', ' + D.minutes(x.m) + ' minutes away' : '') + ', ' + (st === 'fit' ? 'has what you need' : st === 'unknown' ? 'some answers not known' : 'does not have what you need'),
  enter: () => this.setState({ hover: p.id }), leave: () => this.setState({ hover: null }),
  open: () => this.pick(p.id, true) }; }),
pl: pl, go: go,
// Added Nov 2026: directions, report a problem and choosing a point on the map.
rt: this.routeVals(selF),
openReport: function () { self.openReport('map'); },
reportHere: function () { if (selF) self.openReport('place', selF.geometry.coordinates, 'Near ' + selP.name); },
hasPickHint: !!S.pickHint, pickHint: S.pickHint || '',
cancelPick: function () { self.cancelPick(); },
backToList: () => { this.lm.clearTrip(); this.clearRoute(); this.setState({ vstep: 'list', sel: null, rep: {} }); }, // clearRoute added Nov 2026
backToPlace: () => { this.lm.clearTrip(); this.setState({ vstep: 'place' }); },

act: { dir: function () { if (selF) self.openRoute(selF); },
  saved: selP && this.saved.includes(selP.id) ? 'true' : 'false',
  saveLabel: selP && this.saved.includes(selP.id) ? 'Saved on this device. Press to remove' : 'Save this place on this device',
  saveFill: selP && this.saved.includes(selP.id) ? '#F2F3DC' : 'none', saveStroke: selP && this.saved.includes(selP.id) ? '#F2F3DC' : '#26261F',
  save: () => { this.saved = D.toggleSaved(this.saved, selP.id); this.toast(this.saved.includes(selP.id) ? 'Saved on this device' : 'Removed from your places'); this.setState({ savedTick: (S.savedTick || 0) + 1 }); },
  share: () => { const url = location.href.split('#')[0] + '#' + areaB[0] + '/' + selP.id; if (navigator.share) navigator.share({ title: selP.name, url }).catch(() => {}); else navigator.clipboard.writeText(url).then(() => this.toast('Link copied'), () => this.toast(url)); } },
fillGap: () => selP && startFlow(selP.id),
// "Yes, it was": agree with what the panel shows (only the definite answers).
confirmRight: () => {
  const ans = {};
  for (const k of ['ent', 'toilet', 'lift']) { const v = val(selP, k); if (v !== 'unknown') ans[k] = v; }
  if (!Object.keys(ans).length) { this.toast('Nothing is known here yet. Use “Been here?” to add what you saw.'); return; }
  this.share(selP.id, ans);
  this.toast('Thanks. That counts as one more confirmation.');
},
startReport: () => this.setState({ vstep: 'report', rep: {}, repErr: false }),
reportChips: REP.map((r) => ({ label: r[1], pressed: rep[r[0]] ? 'true' : 'false', bg: rep[r[0]] ? '#E8873A' : 'transparent', border: rep[r[0]] ? '2px solid #E8873A' : '2px solid #B9A88C',
  toggle: () => { const n = Object.assign({}, rep); n[r[0]] = !n[r[0]]; this.setState({ rep: n, repErr: false }); } })),
reportDisabled: repAny ? 'false' : 'true', reportBg: repAny ? '#E8873A' : '#E3D3BC', reportErr: !!S.repErr,
// "Something was different" becomes answers too: steps at the door means no step-free way in.
sendReport: () => {
  if (!repAny) { this.setState({ repErr: true }); return; }
  const ans = {};
  if (rep.door) ans.ent = 'no';
  if (rep.toilet) ans.toilet = 'no';
  if (rep.lift) ans.lift = 'no';
  if (Object.keys(ans).length) this.share(selP.id, ans);
  this.setState({ vstep: 'reported' });
},
savedNote: saveNote,
gapCount: S.overview ? 'Zoom in to find places needing answers' : remaining.length.toLocaleString('en-GB') + (remaining.length === 1 ? ' place on the map needs' : ' places on the map need') + ' answers',
gaps: gapList.slice(0, 10).map((x) => { const p = x.p, done = !!p.ans; return { name: p.name, addr: addrOf(p), dist: distOf(x), icon: IC[p.cat],
  pinBg: done ? '#E8873A' : '#FFFFFF', pinFg: done ? '#26261F' : '#8A3B1C', pinBorder: done ? '3px solid #FFFFFF' : '3px dashed #B4562A',
  bg: done ? '#FBF6EC' : '#F6EDDC', ctaFg: done ? '#2A5E35' : '#8A3B1C', cta: done ? 'Done' : (p.one ? 'Needs 1 more' : 'I’ve been'),
  aria: p.name + ', ' + addrOf(p) + (you ? ', ' + Math.round(x.m) + ' metres' : '') + (done ? ', you answered' : ''),
  enter: () => this.setState({ hover: p.id }), leave: () => this.setState({ hover: null }),
  start: () => done ? this.toast('You already answered ' + p.name + '. Thanks.') : startFlow(p.id) }; }),
cur: cur ? { name: cur.name, addr: addrOf(cur) + ', ' + areaName, awning: awn[cur.cat], facadeLabel: 'Sketch of a shop front, not a photo of ' + cur.name } : { name: '', addr: '', awning: '#C2602A', facadeLabel: '' },
backToGaps: () => this.setState({ mstep: 'list', cur: null }),
confirmPlace: () => { const ks = ['ent', 'toilet', 'lift'].filter((k) => val(cur, k) === 'unknown'); this.setState({ mstep: 'q', qKeys: ks.length ? ks : ['ent'], qi: 0, draft: {} }); },
flagClosed: () => { this.toast('Thanks. We’ll check it has closed before removing it.'); this.setState({ mstep: 'list', cur: null }); },
qNum: qi + 1, qTotal: qKeys.length || 1, qText: QD[qk].t, qHint: QD[qk].h, qIcon: IC[qk],
segs: (qKeys.length ? qKeys : ['ent']).map((k, i) => i <= qi ? '#E8873A' : '#E3D3BC'),
qBack: () => {
  if (S.editing) this.setState({ mstep: 'review', editing: false });
  else if (qi > 0) this.setState({ qi: qi - 1 });
  else this.setState({ mstep: 'confirm' });
},
opts: QD[qk].o.map((o) => {
  const selected = (S.draft || {})[qk] === o[0];
  return {
    label: o[1], pressed: selected ? 'true' : 'false',
    bg: selected ? '#E8873A' : 'transparent',
    fg: '#26261F',
    border: selected ? '2px solid #C2602A' : '2px solid #B9A88C',
    pick: () => {
      // Draft only. Nothing is saved or shared until Submit answers.
      const draft = Object.assign({}, S.draft, { [qk]: o[0] });
      if (S.editing || qi >= qKeys.length - 1) {
        this.setState({ mstep: 'review', draft, editing: false });
      } else {
        this.setState({ qi: qi + 1, draft });
      }
    }
  };
}),
reviewPlace: cur ? cur.name : '',
reviewRows: qKeys.map((k, i) => ({
  question: QD[k].t,
  answer: (QD[k].o.find((o) => o[0] === (S.draft || {})[k]) || [null, 'Not answered'])[1],
  edit: () => this.setState({ mstep: 'q', qi: i, editing: true })
})),
reviewEdit: () => this.setState({ mstep: 'q', qi: 0, editing: false }),
reviewCancel: () => this.setState({ mstep: 'list', cur: null, draft: {}, editing: false }),
reviewSubmit: () => {
  const draft = S.draft || {};
  if (!qKeys.length || qKeys.some((k) => !draft[k])) {
    this.toast('Please answer every question before submitting.');
    return;
  }
  // Save locally and send to the API only after explicit submission.
  for (const k of qKeys) this.ans = D.saveAnswer(this.ans, S.cur, k, draft[k]);
  this.share(S.cur, draft);
  this.setState({ mstep: 'done', draft: {}, editing: false,
    doneCount: (S.doneCount || 0) + 1, viewTick: (S.viewTick || 0) + 1 });
},
doneBig: nowConfirmed ? 'Confirmed' : '1 more', doneSmall: nowConfirmed ? 'it now shows for everyone' : 'answer confirms it',
liveDot: LIVE[0], liveText: LIVE[1],
doneCount: S.doneCount || 0, doneLabel: (S.doneCount || 0) === 1 ? 'place you helped today' : 'places you helped today', hasNext: !!next, next: next ? { name: next.p.name, addr: addrOf(next.p) + (you ? ', ' + D.distanceText(next.m) : '') } : { name: '', addr: '' },
startNext: () => next && startFlow(next.p.id),
hasToast: !!S.toast, toast: S.toast || '',
hasFatal: !!S.fatal, fatal: S.fatal || ''
};
}
}

window.AccessMapComponent = Component;
