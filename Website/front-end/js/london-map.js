/*
 * london-map.js — the real street map behind the borough view (MapLibre GL JS).
 *
 * map.html's Component decides what to show; this file draws it:
 *   - only the open borough: everything outside is covered, and the map can't pan away
 *   - every place as a round pin in the mockup's style (js/map-look.js), coloured by
 *     whether it has what the visitor needs, or (for mappers) whether anyone knows yet
 *   - hovering or opening a place makes its pin four times the size of its icon, and an
 *     open place stays big
 *   - "you are here", and the lines to step-free stations for "Directions"
 *
 *   const lm = await LondonMap.create(element, { onPick, onMove })
 *   lm.openBorough({ code, boundary, places })      places: GeoJSON from data/places-slim
 *   lm.setRule({ mode, needs, cat })                 needs: ['ent'] and/or 'toilet'
 *   lm.setFocus(hoverId, openId)
 *   lm.placesInView() / lm.centre() / lm.flyTo(lnglat, zoom) / lm.setYou(lnglat)
 *   lm.showTrip(place, stations) / lm.clearTrip() / lm.markAnswered(id)
 */
(function () {
  'use strict';

  const LONDON = [-0.118, 51.509];
  const ICON_ZOOM = 14.5;   // below this, places are small dots; from here, round pins with icons
  // Until this zoom, two kinds of place stay small dots so the rest can be read:
  //   shops (over half of all places, and rarely where someone is heading), and, for
  //   visitors, places nobody has checked yet (three in four). Mappers see those as pins.
  const DETAIL_ZOOM = 17;
  // Needs the visitor can pick, and which data field answers each one.
  const FIELD = { ent: 'wc', toilet: 'toilet' };

  async function create(container, handlers) {
    const style = await MapLook.loadBasemap();
    const map = new maplibregl.Map({
      container, style, center: LONDON, zoom: 9.8, minZoom: 9.5, maxZoom: 18.5,
      // Credits sit small in the map's bottom-right corner, with our data date.
      attributionControl: { compact: true, customAttribution: 'Places: OpenStreetMap, 18 Oct 2026' }
    });
    const calm = window.matchMedia('(prefers-reduced-motion: reduce)').matches; // no camera glides
    let places = { type: 'FeatureCollection', features: [] };
    let boundary = null;
    let rule = { mode: 'visit', needs: [], cats: [] }; // cats: [] means every kind of place
    let focus = { hover: null, open: null };
    let tripMarkers = [];
    let youMarker = null;
    // Our layers go on once the basemap has loaded (we never swap the style, so once is enough).
    const ready = new Promise((res) => map.once('load', () => { addLayers(); res(); }));

    // ---- What each place looks like ------------------------------------------------------
    // One word per place: fit / unknown / nofit for visitors, gap / answered / known for mappers.
    function status() {
      if (rule.mode === 'map') {
        return ['case', ['boolean', ['get', 'ans'], false], 'answered', ['boolean', ['get', 'one'], false], 'one',
          ['==', ['get', 'wc'], 'unknown'], 'gap', 'known'];
      }
      const vals = (rule.needs.length ? rule.needs : ['ent']).map((k) => ['get', FIELD[k]]);
      return ['case',
        ['any', ...vals.map((v) => ['in', v, ['literal', ['no', 'partly']]])], 'nofit',
        ['any', ...vals.map((v) => ['!=', v, 'yes'])], 'unknown',
        'fit'];
    }
    const pinImage = () => ['concat', 'pin-', status(), '-', ['get', 'cat']];
    // The 'pins' layer's picture: a dot for shops (and, for visitors, unchecked places) until DETAIL_ZOOM.
    function pinsImage() {
      const quiet = rule.mode === 'visit'
        ? ['any', ['==', ['get', 'cat'], 'shop'], ['==', status(), 'unknown']]
        : ['==', ['get', 'cat'], 'shop'];
      return ['step', ['zoom'], ['case', quiet, ['concat', 'dot-', status()], pinImage()], DETAIL_ZOOM, pinImage()];
    }
    const byLook = (prop) => {
      const m = ['match', status()];
      for (const name in MapLook.LOOK) m.push(name, MapLook.LOOK[name][prop]);
      m.push('#CCCCCC');
      return m;
    };
    function catFilter() { return rule.cats.length ? ['in', ['get', 'cat'], ['literal', rule.cats]] : ['has', 'cat']; }
    function sortKey() {
      return rule.mode === 'map'
        ? ['match', status(), 'one', 4, 'gap', 3, 'answered', 2, 1]
        : ['match', status(), 'fit', 3, 'unknown', 2, 1];
    }
    const onlyFocus = () => ['in', ['get', 'id'], ['literal', [focus.hover, focus.open].filter(Boolean)]];

    // ---- Layers --------------------------------------------------------------------------
    function addLayers() {
      MapLook.addPinImages(map);
      const t = MapLook.THEMES[rule.mode];
      const world = [[-180, -85], [180, -85], [180, 85], [-180, 85], [-180, -85]];
      map.addSource('mask', { type: 'geojson', data: { type: 'Feature', geometry: { type: 'Polygon', coordinates: [world] } } });
      // 3D buildings, off until someone presses 3D. Under the mask, so only the borough's show.
      map.addLayer({ id: 'buildings-3d', type: 'fill-extrusion', source: 'openmaptiles', 'source-layer': 'building', minzoom: 13,
        layout: { visibility: 'none' },
        paint: { 'fill-extrusion-color': t.building3d, 'fill-extrusion-opacity': 0.82,
          'fill-extrusion-height': ['coalesce', ['get', 'render_height'], 8],
          'fill-extrusion-base': ['coalesce', ['get', 'render_min_height'], 0] } });
      map.setLight({ anchor: 'viewport', color: '#FFFFFF', intensity: 0.3, position: [1.4, 210, 35] });
      map.addLayer({ id: 'mask-fill', type: 'fill', source: 'mask', paint: { 'fill-color': t.outside, 'fill-opacity': 0.92 } });
      map.addSource('borough', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      map.addLayer({ id: 'borough-line', type: 'line', source: 'borough', paint: { 'line-color': t.outline, 'line-width': 2.5, 'line-opacity': 0.7 } });
      map.addSource('trip', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      map.addLayer({ id: 'trip-lines', type: 'line', source: 'trip',
        paint: { 'line-color': ['coalesce', ['get', 'colour'], '#26261F'], 'line-width': 2.5, 'line-opacity': 0.7, 'line-dasharray': [2, 2] } });

      map.addSource('places', { type: 'geojson', data: places, promoteId: 'id' });
      // Zoomed out: small dots, each with a soft shadow so it sits on the map, not in it.
      map.addLayer({ id: 'dots-shadow', type: 'circle', source: 'places', maxzoom: ICON_ZOOM,
        paint: { 'circle-radius': ['interpolate', ['linear'], ['zoom'], 11, 3.5, 14.5, 8], 'circle-color': 'rgba(20,35,15,0.4)',
          'circle-blur': 0.7, 'circle-translate': [0, 1.5] } });
      map.addLayer({ id: 'dots', type: 'circle', source: 'places', maxzoom: ICON_ZOOM,
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 11, 2.5, 14.5, 6],
          'circle-color': byLook('bg'),
          'circle-stroke-color': byLook('edge'),
          'circle-stroke-width': ['interpolate', ['linear'], ['zoom'], 11, 1, 14.5, 2],
          'circle-opacity': ['match', status(), 'nofit', 0.8, 1],
          'circle-stroke-opacity': ['match', status(), 'nofit', 0.8, 1]
        } });
      // Mappers: places that are already known stay small green dots even close up (as in the mockup).
      map.addLayer({ id: 'known-dots', type: 'circle', source: 'places', minzoom: ICON_ZOOM,
        paint: { 'circle-radius': 8, 'circle-color': MapLook.LOOK.known.bg, 'circle-stroke-color': MapLook.LOOK.known.edge, 'circle-stroke-width': 3 } });
      // Close up: round pins with the icon for the kind of place.
      map.addLayer({ id: 'pins', type: 'symbol', source: 'places', minzoom: ICON_ZOOM,
        layout: {
          'icon-image': pinsImage(), 'icon-anchor': 'bottom', 'icon-pitch-alignment': 'viewport',
          'icon-allow-overlap': true, 'icon-ignore-placement': true, 'symbol-sort-key': sortKey()
        },
        paint: { 'icon-opacity': ['match', status(), 'nofit', 0.8, 1] } });
      // The hovered and open places: a soft ring, and the pin at four times its icon size.
      map.addLayer({ id: 'focus-ring', type: 'circle', source: 'places', filter: onlyFocus(),
        paint: { 'circle-radius': 52, 'circle-color': byLook('ring'), 'circle-pitch-alignment': 'map' } });
      map.addLayer({ id: 'focus-pin', type: 'symbol', source: 'places', filter: onlyFocus(),
        layout: { 'icon-image': pinImage(), 'icon-size': MapLook.PIN.focus, 'icon-anchor': 'bottom', 'icon-pitch-alignment': 'viewport',
          'icon-allow-overlap': true, 'icon-ignore-placement': true } });
      applyRule();
    }

    function applyRule() {
      if (!map.getLayer('pins')) return;
      const visit = rule.mode === 'visit';
      const cat = catFilter();
      map.setFilter('dots', cat);
      map.setFilter('dots-shadow', cat);
      map.setFilter('pins', visit ? cat : ['all', cat, ['!=', status(), 'known']]);
      map.setFilter('known-dots', ['all', cat, ['==', status(), 'known']]);
      map.setLayoutProperty('known-dots', 'visibility', visit ? 'none' : 'visible');
      for (const id of ['dots', 'known-dots']) {
        map.setPaintProperty(id, 'circle-color', byLook('bg'));
        map.setPaintProperty(id, 'circle-stroke-color', byLook('edge'));
      }
      map.setPaintProperty('dots', 'circle-opacity', ['match', status(), 'nofit', 0.8, 1]);
      map.setPaintProperty('dots', 'circle-stroke-opacity', ['match', status(), 'nofit', 0.8, 1]);
      map.setLayoutProperty('pins', 'icon-image', pinsImage());
      map.setLayoutProperty('pins', 'symbol-sort-key', sortKey());
      map.setPaintProperty('pins', 'icon-opacity', ['match', status(), 'nofit', 0.8, 1]);
      map.setLayoutProperty('focus-pin', 'icon-image', pinImage());
      map.setPaintProperty('focus-ring', 'circle-color', byLook('ring'));
      const t = MapLook.THEMES[rule.mode];
      map.setPaintProperty('mask-fill', 'fill-color', t.outside);
      map.setPaintProperty('borough-line', 'line-color', t.outline);
      map.setPaintProperty('buildings-3d', 'fill-extrusion-color', t.building3d);
      MapLook.paintBasemap(map, rule.mode);
    }

    // ---- Hover and click -------------------------------------------------------------------
    const HIT = ['focus-pin', 'pins', 'known-dots', 'dots'];
    function hit(point) {
      const box = [[point.x - 6, point.y - 6], [point.x + 6, point.y + 6]];
      return map.queryRenderedFeatures(box, { layers: HIT.filter((l) => map.getLayer(l)) })[0];
    }
    // Pointing at a place shows a small card above its pin: the name, how far, and what's
    // known. The page writes the card (handlers.hoverCard); this only places it. Mouse only:
    // on touch screens a tap opens the place straight away.
    const tip = document.createElement('div');
    tip.className = 'lm-tip';
    tip.setAttribute('aria-hidden', 'true'); // the list and the place panel say the same for screen readers
    container.appendChild(tip);
    let tipAt = null;
    function placeTip() {
      if (!tipAt) return;
      const p = map.project(tipAt), w = container.clientWidth, tw = tip.offsetWidth, th = tip.offsetHeight;
      const x = Math.min(Math.max(p.x - tw / 2, 8), w - tw - 8);
      let y = p.y - (MapLook.PIN.size * MapLook.PIN.focus + MapLook.PIN.lift + 12) - th; // above the enlarged pin
      if (y < 8) y = p.y + 16; // no room above: show it below the place
      tip.style.transform = 'translate3d(' + Math.round(x) + 'px,' + Math.round(y) + 'px,0)';
    }
    function showTip(f) {
      const html = f && handlers.hoverCard ? handlers.hoverCard(f.properties.id) : '';
      if (!html) return hideTip();
      tip.innerHTML = html;
      tipAt = f.geometry.coordinates;
      placeTip();
      tip.classList.add('on');
    }
    function hideTip() { tipAt = null; tip.classList.remove('on'); }
    map.on('move', placeTip);

    map.on('mousemove', (e) => {
      const f = hit(e.point);
      map.getCanvas().style.cursor = f ? 'pointer' : '';
      const id = f ? f.properties.id : null;
      if (id !== focus.hover) { focus.hover = id; drawFocus(); showTip(f); }
    });
    map.on('mouseout', () => { hideTip(); if (focus.hover) { focus.hover = null; drawFocus(); } });
    map.on('click', (e) => { const f = hit(e.point); hideTip(); if (f && handlers.onPick) handlers.onPick(f.properties.id); });
    map.on('moveend', () => handlers.onMove && handlers.onMove());
    function drawFocus() {
      if (!map.getLayer('focus-pin')) return;
      map.setFilter('focus-pin', onlyFocus());
      map.setFilter('focus-ring', onlyFocus());
    }

    // ---- Opening a borough -----------------------------------------------------------------
    function bbox(geojson) {
      let w = Infinity, s = Infinity, e = -Infinity, n = -Infinity;
      const walk = (c) => { if (typeof c[0] === 'number') { w = Math.min(w, c[0]); e = Math.max(e, c[0]); s = Math.min(s, c[1]); n = Math.max(n, c[1]); } else c.forEach(walk); };
      geojson.features.forEach((f) => walk(f.geometry.coordinates));
      return [[w, s], [e, n]];
    }
    // Room to leave for the panel, so places don't end up hidden behind it.
    let panelOpen = true;
    function padding() {
      const phone = container.clientWidth < 760;
      return phone ? { top: 70, bottom: Math.round(container.clientHeight * 0.5), left: 20, right: 20 }
        : { top: 90, bottom: 40, left: panelOpen ? 460 : 70, right: 90 };
    }

    async function openBorough(b) {
      await ready;
      boundary = b.boundary;
      places = b.places;
      // the mask: the whole world with this borough cut out
      const holes = [];
      for (const f of boundary.features) {
        if (f.geometry.type === 'Polygon') holes.push(f.geometry.coordinates[0]);
        else f.geometry.coordinates.forEach((p) => holes.push(p[0]));
      }
      map.getSource('mask').setData({ type: 'Feature', geometry: { type: 'Polygon',
        coordinates: [[[-180, -85], [180, -85], [180, 85], [-180, 85], [-180, -85]], ...holes] } });
      map.getSource('borough').setData(boundary);
      map.getSource('places').setData(places);
      clearTrip();
      focus = { hover: null, open: null };
      drawFocus();
      const [[w, s], [e, n]] = bbox(boundary);
      const px = (e - w) * 0.4, py = (n - s) * 0.4;
      map.setMaxBounds(null);
      // Glide in from the whole of London to the borough, then stop the map wandering off.
      map.jumpTo({ center: LONDON, zoom: 9.8, pitch: 0, bearing: 0 });
      map.once('moveend', () => map.setMaxBounds([[w - px, s - py], [e + px, n + py]]));
      map.fitBounds([[w, s], [e, n]], { padding: padding(), duration: calm ? 0 : 1400, essential: true });
      if (threeD) setThreeD(false);
    }

    // ---- "You are here" and directions ----------------------------------------------------
    function setYou(lnglat) {
      if (!lnglat) { if (youMarker) youMarker.remove(); youMarker = null; return; }
      if (!youMarker) {
        const el = document.createElement('div');
        el.className = 'lm-you';
        el.setAttribute('aria-label', 'You are here');
        youMarker = new maplibregl.Marker({ element: el });
      }
      youMarker.setLngLat(lnglat).addTo(map);
    }
    function clearTrip() {
      tripMarkers.forEach((m) => m.remove());
      tripMarkers = [];
      if (map.getSource('trip')) map.getSource('trip').setData({ type: 'FeatureCollection', features: [] });
    }
    // Dashed lines from the place to each step-free station (and from you, if we know where you are).
    function showTrip(place, stations, you) {
      clearTrip();
      const at = place.geometry.coordinates;
      const lines = stations.map((s) => ({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: [[s.lon, s.lat], at] } }));
      if (you) lines.push({ type: 'Feature', properties: { colour: '#233A6B' }, geometry: { type: 'LineString', coordinates: [you, at] } });
      map.getSource('trip').setData({ type: 'FeatureCollection', features: lines });
      stations.forEach((s, i) => {
        const el = document.createElement('div');
        el.className = 'lm-station';
        el.innerHTML = '<span>' + String.fromCharCode(65 + i) + '</span><em></em>';
        el.querySelector('em').textContent = s.name;
        // anchor on the letter circle, not the middle of circle + name
        tripMarkers.push(new maplibregl.Marker({ element: el, anchor: 'left', offset: [-14, 0] }).setLngLat([s.lon, s.lat]).addTo(map));
      });
      const pts = [at, ...stations.map((s) => [s.lon, s.lat])];
      if (you) pts.push(you);
      const lons = pts.map((p) => p[0]), lats = pts.map((p) => p[1]);
      map.fitBounds([[Math.min(...lons), Math.min(...lats)], [Math.max(...lons), Math.max(...lats)]],
        { padding: padding(), maxZoom: 16.5, duration: calm ? 0 : 1200, essential: true });
    }

    // ---- 3D: tilt the map and raise the buildings ------------------------------------------
    let threeD = false;
    function setThreeD(on) {
      threeD = on;
      if (map.getLayer('buildings-3d')) map.setLayoutProperty('buildings-3d', 'visibility', on ? 'visible' : 'none');
      const to = on ? { pitch: 55, bearing: -17, zoom: Math.max(map.getZoom(), 15) } : { pitch: 0, bearing: 0 };
      if (calm) map.jumpTo(to); else map.easeTo(Object.assign(to, { duration: 900 }));
    }

    // ---- Small helpers for the page --------------------------------------------------------
    function placesInView() {
      const b = map.getBounds();
      return places.features.filter((f) => b.contains(f.geometry.coordinates));
    }
    function markAnswered(id) {
      const f = places.features.find((x) => x.properties.id === id);
      if (f) { f.properties.ans = true; map.getSource('places').setData(places); }
    }

    await ready;

    return {
      map,
      openBorough,
      setRule(r) { rule = Object.assign({}, rule, r); applyRule(); },
      setFocus(hover, open) { focus = { hover, open }; drawFocus(); },
      hideTip,
      // New Mapper answers arrived: redraw the pins from the same places data.
      refresh() { if (map.getSource('places')) map.getSource('places').setData(places); },
      // The panel was hidden or shown: slide the view so what was in the middle stays in the middle.
      setPanelOpen(open) {
        if (open === panelOpen) return;
        panelOpen = open;
        if (container.clientWidth >= 760) map.easeTo({ padding: padding(), duration: 350 });
      },
      placesInView,
      centre() { const c = map.getCenter(); return [c.lng, c.lat]; },
      // A smooth glide to a place: zooms out a little, travels, then settles (MapLibre's flyTo).
      flyTo(lnglat, zoom) {
        const to = { center: lnglat, zoom: Math.max(map.getZoom(), zoom || 16), padding: padding() };
        if (calm) map.jumpTo(to); else map.flyTo(Object.assign(to, { speed: 0.9, curve: 1.42, essential: true }));
      },
      zoomBy(d) { if (d > 0) map.zoomIn({ duration: 250 }); else map.zoomOut({ duration: 250 }); },
      setThreeD,
      resetNorth() { map.easeTo({ bearing: 0, duration: 400 }); },
      resize() { map.resize(); },
      setYou, showTrip, clearTrip, markAnswered
    };
  }

  window.LondonMap = { create, ICON_ZOOM };
})();
