(function () {
  'use strict';

  const getJSON = (url) => fetch(url).then((r) => { if (!r.ok) throw new Error(url + ' ' + r.status); return r.json(); });
  const known = (v) => v === 'yes' || v === 'partly' || v === 'no';
  const cache = {};

  async function loadBorough(code, answers) {
    if (!cache[code]) {
      cache[code] = Promise.all([
        getJSON('/api/places?borough=' + code),
        getJSON('/api/places/details?borough=' + code).catch(() => ({})),
        getJSON('/api/boundaries/' + code)
      ]).then(([places, details, boundary]) => {
        const byId = {};
        for (const f of places.features) byId[f.properties.id] = f;
        // What the data said before any Mapper answers: kept so answers can be re-applied cleanly.
        for (const f of places.features) f.properties.base = { wc: f.properties.wc, toilet: f.properties.toilet };
        return { code, places, details, boundary, byId };
      });
    }
    const data = await cache[code];
    // Places this device has already answered show as "You answered".
    for (const id in answers) if (data.byId[id]) data.byId[id].properties.ans = true;
    return data;
  }

  async function loadViewport(bounds, answers) {
    const query = new URLSearchParams({
      west: String(bounds[0]), south: String(bounds[1]),
      east: String(bounds[2]), north: String(bounds[3])
    });
    const places = await getJSON('/api/places/viewport?' + query);
    const byId = {};
    for (const f of places.features) {
      f.properties.base = { wc: f.properties.wc, toilet: f.properties.toilet };
      f.properties.ans = !!(answers && answers[f.properties.id]);
      byId[f.properties.id] = f;
    }
    return { code: 'all', places, byId, details: {}, truncated: !!places.truncated };
  }

  function loadPlaceDetails(id) {
    return getJSON('/api/places/detail?id=' + encodeURIComponent(id));
  }

  function answer(p, k) {
    const c = p.crowd && p.crowd[k];
    if (c && c.confirmed) return c.value;
    if (k === 'ent') return known(p.wc) ? p.wc : 'unknown';
    if (k === 'toilet') return known(p.toilet) ? p.toilet : 'unknown';
    return 'unknown';
  }

  function applyCrowd(data, localAnswers) {
    for (const f of data.places.features) {
      const p = f.properties;
      if (!p.base) continue;
      p.wc = p.base.wc; p.toilet = p.base.toilet; p.crowd = null; p.one = false;
      p.ans = !!(localAnswers && localAnswers[p.id]);
    }
    if (!window.Answers) return;
    for (const id of Answers.places()) {
      const f = data.byId[id];
      if (!f) continue;
      const p = f.properties, r = Answers.result(id);
      p.crowd = r;
      if (r.ent && r.ent.confirmed) p.wc = r.ent.value;          // the map's pins read wc and toilet
      if (r.toilet && r.toilet.confirmed) p.toilet = r.toilet.value;
      p.one = r.devices > 0 && !(r.ent && r.ent.confirmed);       // someone answered; needs one more
      p.ans = p.ans || Answers.mine(id);
    }
  }

  function sourceText(p, more) {
    const c = p.crowd;
    if (c && ['ent', 'toilet', 'lift'].some((k) => c[k] && c[k].confirmed)) {
      const when = c.latest ? ', most recently ' + new Date(c.latest).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : '';
      // Simulated survey answers must always say so.
      const sim = c.simulated ? ' (' + (c.simulated === c.devices ? 'all' : c.simulated) + ' simulated test data, not real people)' : '';
      return 'Checked by ' + c.devices + ' people who agree' + when + sim + '.';
    }
    if (c && c.simulated) return c.devices + ' answers so far, ' + c.simulated + ' of them simulated test data.';
    return ''; // plain OpenStreetMap information: no line (the map's credits name OpenStreetMap)
  }

  function metres(a, b) {
    const R = 6371000, rad = Math.PI / 180;
    const dLat = (b[1] - a[1]) * rad, dLon = (b[0] - a[0]) * rad;
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[1] * rad) * Math.cos(b[1] * rad) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  }
  // Straight lines are shorter than streets, so add 30%; then about 67 m a minute (the mockup's pace).
  const minutes = (m) => Math.max(1, Math.round((m * 1.3) / 67));
  const distanceText = (m) => (m < 1000 ? Math.round(m / 10) * 10 + ' m' : (m / 1000).toFixed(1) + ' km');

  // ---- Stations -------------------------------------------------------------------------------
  const STATION = { Full: 'Step-free from street to platform', Partial: 'Step-free to some platforms only',
    Interchange: 'Step-free only for changing trains', None: 'Not step-free' };
  const STEP_FREE = { Full: true, Partial: true };
  function stationsNear(stations, at) {
    const all = stations.map((s) => Object.assign({ m: metres(at, [s.lon, s.lat]) }, s)).sort((a, b) => a.m - b.m);
    return { stepFree: all.filter((s) => STEP_FREE[s.type]).slice(0, 3), warn: all[0] && !STEP_FREE[all[0].type] ? all[0] : null };
  }

  // ---- Which borough am I in? (only downloads the outlines when someone asks) -------------------
  let outlines = null;
  function inRing(pt, ring) {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i], [xj, yj] = ring[j];
      if ((yi > pt[1]) !== (yj > pt[1]) && pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  }
  async function boroughAt(pt) {
    if (!outlines) outlines = getJSON('/api/boundaries');
    const all = await outlines;
    for (const f of all.features) {
      const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
      if (polys.some((p) => inRing(pt, p[0]) && !p.slice(1).some((hole) => inRing(pt, hole)))) return f.properties.code;
    }
    return null;
  }

  function readableHours(h) {
    if (h.trim() === '24/7') return 'open 24 hours';
    const DAY = { Mo: 'Mon', Tu: 'Tue', We: 'Wed', Th: 'Thu', Fr: 'Fri', Sa: 'Sat', Su: 'Sun' };
    return h.replace(/\b(Mo|Tu|We|Th|Fr|Sa|Su)\b/g, (d) => DAY[d]).replace(/\bPH\b/g, 'bank holidays')
      .replace(/\boff\b/g, 'closed').replace(/-(?=[A-Z])/g, '–').replace(/;\s*/g, ' · ');
  }

  function read(key, empty) { try { return JSON.parse(localStorage.getItem(key)) || empty; } catch (e) { return empty; } }
  function write(key, v) { try { localStorage.setItem(key, JSON.stringify(v)); } catch (e) { /* private window: just don't keep it */ } }
  const loadAnswers = () => read('al-answers', {});
  function saveAnswer(all, id, key, value) {
    const next = Object.assign({}, all);
    next[id] = Object.assign({}, next[id] || {}, { [key]: value, at: new Date().toISOString() });
    write('al-answers', next);
    return next;
  }
  const answerCount = (all) => Object.keys(all || {}).length;
  const loadSaved = () => read('al-saved', []);
  function toggleSaved(list, id) {
    const next = list.includes(id) ? list.filter((x) => x !== id) : list.concat(id);
    write('al-saved', next);
    return next;
  }

  const KIND = { cafe: 'Café', restaurant: 'Restaurant', fast_food: 'Takeaway', food_court: 'Food court', pub: 'Pub', bar: 'Bar',
    ice_cream: 'Ice cream', library: 'Library', gallery: 'Gallery', museum: 'Museum', park: 'Park', shop: 'Shop', toilets: 'Public toilet' };
  const ICON = Object.assign({}, MapLook.ICON, {
    ent: 'M3 20h18M6 20V5h8v15M14 20l7-5M11 12h.01',
    lift: 'M6 3h12v18H6zM10 9l2-2 2 2M10 15l2 2 2-2',
    visit: 'M12 21s-6-5.5-6-11a6 6 0 0 1 12 0c0 5.5-6 11-6 11zM12 10h.01',
    map: 'M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z'
  });

  const fullId = (short) => 'osm:' + { n: 'node', w: 'way', r: 'relation' }[short[0]] + '/' + short.slice(1);

  window.LondonData = { loadViewport, loadPlaceDetails, applyCrowd, fullId, getJSON, loadBorough, answer, sourceText, metres, minutes, distanceText, STATION, stationsNear, boroughAt,
    readableHours, loadAnswers, saveAnswer, answerCount, loadSaved, toggleSaved, KIND, ICON };
})();
