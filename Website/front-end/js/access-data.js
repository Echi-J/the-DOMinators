/* Shared data access and honest, device-local contribution storage. */
(function (global) {
  'use strict';
  const base = new URL('../../data/', document.currentScript.src);
  const cache = new Map();
  const KEY = 'access-london-contributions-v1';
  const BOOKMARKS = 'access-london-bookmarks-v1';
  async function json(path) {
    const response = await fetch(new URL(path, base));
    if (!response.ok) throw new Error('Data could not be loaded (' + response.status + '). Please retry.');
    return response.json();
  }
  let metadataPromise;
  function metadata() {
    if (!metadataPromise) metadataPromise = Promise.all(['catalog.json', 'boroughs.json', 'borough_boundaries.geojson', 'ui_config.json', 'need_evidence.json'].map(json))
      .then(([catalog, boroughs, boundaries, config, needEvidence]) => ({ catalog, boroughs, boundaries, config, needEvidence }))
      .catch(error => { metadataPromise = null; throw error; });
    return metadataPromise;
  }
  async function places(code) {
    if (!/^E090000(?:0[1-9]|[12]\d|3[0-3])$/.test(code)) throw new Error('Unknown borough code.');
    if (!cache.has(code)) {
      if (cache.size >= 5) cache.delete(cache.keys().next().value);
      cache.set(code, json('places/' + code + '.geojson').then(fc => {
        if (fc.type !== 'FeatureCollection') throw new Error('Invalid place data.');
        return fc.features;
      }).catch(error => { cache.delete(code); throw error; }));
    }
    return cache.get(code);
  }
  const fmt = value => Number.isFinite(value) ? Math.round(value).toLocaleString('en-GB') : 'Not available';
  const pct = value => Number.isFinite(value) ? value.toFixed(1) : '—';
  function tiles(boroughs) {
    return (boroughs || []).map(b => [b.ui_code, b.borough_name, b.grid_row, b.grid_column,
      b.osm_wheelchair_tag_score === null ? null : Math.round(b.osm_wheelchair_tag_score),
      Math.round(b.osm_wheelchair_tag_coverage_pct * 10) / 10]);
  }
  function haversine(origin, p) {
    if (!origin) return null;
    const rad = Math.PI / 180;
    const a = Math.sin((p.latitude - origin.latitude) * rad / 2) ** 2 +
      Math.cos(origin.latitude * rad) * Math.cos(p.latitude * rad) * Math.sin((p.longitude - origin.longitude) * rad / 2) ** 2;
    return 6371000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(Math.max(0, 1 - a)));
  }
  function distance(metres) {
    return Number.isFinite(metres) ? (metres < 1000 ? Math.round(metres) + ' m' : (metres / 1000).toFixed(1) + ' km') + ' straight-line' : 'Distance not calculated';
  }
  function legacyPlace(feature, origin) {
    const p = feature.properties;
    const row = [p.id, p.name_en, p.ui_category, p.longitude, p.latitude, haversine(origin, p), p.ent, p.toilet, p.lift, p.cp, null, p.address || 'Address not recorded'];
    row.data = p;
    return row;
  }
  function inRing(x, y, ring) {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i], [xj, yj] = ring[j];
      if (((yi > y) !== (yj > y)) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  }
  function findBorough(position, boundaries) {
    return boundaries.features.find(f => {
      const polys = f.geometry.type === 'MultiPolygon' ? f.geometry.coordinates : [f.geometry.coordinates];
      return polys.some(rings => inRing(position.longitude, position.latitude, rings[0]) && !rings.slice(1).some(r => inRing(position.longitude, position.latitude, r)));
    });
  }
  function locate() {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) return reject(new Error('Location is not available in this browser. Choose a borough instead.'));
      navigator.geolocation.getCurrentPosition(p => resolve({ latitude: p.coords.latitude, longitude: p.coords.longitude, accuracy: p.coords.accuracy }),
        () => reject(new Error('Location could not be obtained. Allow location access or choose a borough.')),
        { enableHighAccuracy: false, timeout: 12000, maximumAge: 60000 });
    });
  }
  function read(key, fallback) {
    try { const value = JSON.parse(localStorage.getItem(key)); return Array.isArray(value) ? value : fallback; } catch { return fallback; }
  }
  function events() { return read(KEY, []); }
  function saveEvent(kind, payload) {
    const list = events();
    const record = { id: crypto.randomUUID(), kind, ...payload, saved_at: new Date().toISOString(), status: 'local_unreviewed', storage: 'this_browser_only' };
    // One current answer/confirmation per browser and place/question; never community consensus.
    const previous = list.filter(r => !(r.kind === kind && r.place_id === payload.place_id && (kind === 'confirmation' || (kind === 'answer' && r.question_id === payload.question_id))));
    if (previous.length >= 5000) throw new Error('Local storage is full. Export your contributions before adding more.');
    try { localStorage.setItem(KEY, JSON.stringify([...previous, record])); }
    catch { throw new Error('Your browser could not save this record. Check storage settings; nothing was submitted.'); }
    return record;
  }
  function answers() {
    const result = {};
    for (const e of events()) if (e.kind === 'answer' && e.place_id && e.question_id) {
      result[e.place_id] ||= {}; result[e.place_id][e.question_id] = e.answer_raw;
    }
    return result;
  }
  function download(name, data) {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob), link = document.createElement('a');
    link.href = url; link.download = name; document.body.appendChild(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function exportEvents() { download('access-london-local-contributions.json', { exported_at: new Date().toISOString(), records: events() }); }
  function bookmark(id) {
    const saved = new Set(read(BOOKMARKS, []));
    if (saved.has(id)) saved.delete(id); else saved.add(id);
    try { localStorage.setItem(BOOKMARKS, JSON.stringify([...saved])); } catch { throw new Error('The bookmark could not be saved in this browser.'); }
    return saved.has(id);
  }
  function isSaved(id) { return read(BOOKMARKS, []).includes(id); }
  function placeURL(p, borough) {
    const url = new URL('map.html', location.href);
    url.searchParams.set('borough', borough); url.searchParams.set('place', p.id);
    return url.href;
  }
  function safeURL(value) {
    try { const url = new URL(value); return ['https:', 'http:'].includes(url.protocol) ? url.href : ''; } catch { return ''; }
  }
  global.AccessData = { metadata, places, tiles, fmt, pct, haversine, distance, legacyPlace, findBorough, locate, answers, events, saveEvent, exportEvents, download, bookmark, isSaved, placeURL, safeURL };
})(window);
