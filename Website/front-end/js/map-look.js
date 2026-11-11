/*
 * map-look.js — how the map looks: the basemap colours for each mode, and the round pins.
 *
 * Colours and icons come straight from Namita's map mockup (map.html), so the real map
 * matches the design: cream and sage for visitors, sand and terracotta for mappers.
 *
 *   MapLook.loadBasemap()           OpenFreeMap's Positron style, cut down to the layers we keep
 *   MapLook.paintBasemap(map, mode) recolour it for 'visit' or 'map' (no reload)
 *   MapLook.addPinImages(map)       draws the pin pictures once per style
 *   MapLook.PIN / LOOK / ICON        sizes, colours and icon shapes used by london-map.js
 */
(function () {
  'use strict';

  const SOURCE_STYLE = 'https://tiles.openfreemap.org/styles/positron';

  // Basemap colours per mode, from the mockup's street view.
  const THEMES = {
    visit: { land: '#E8EBD2', residential: '#E5E8CC', park: '#C9DDA8', wood: '#B5D19A', water: '#9CC7C0', waterLabel: '#3F7F86',
      building: '#DEE0C3', buildingEdge: '#D3D0B4', road: '#FBFAF0', roadEdge: '#D3D0B4', path: '#D9D9BD', rail: '#C9C9AE',
      label: '#4B4C3D', parkLabel: '#4E8A4F', halo: '#E8EBD2', outside: '#F2F3DC', outline: '#2F6B3C', building3d: '#DCDBC2' },
    map: { land: '#F1E6D2', residential: '#EEE2CB', park: '#E7DDB8', wood: '#DCCB9F', water: '#BFD3CC', waterLabel: '#5E8A86',
      building: '#E9DCC4', buildingEdge: '#E0D2B6', road: '#FBF6EC', roadEdge: '#E0D2B6', path: '#E3D3BC', rail: '#D6C6AA',
      label: '#5C4A33', parkLabel: '#9A7A48', halo: '#F1E6D2', outside: '#F7EEDD', outline: '#B4562A', building3d: '#E6D8BE' }
  };

  // Positron layers we keep, and which paint property gets which colour.
  const KEEP = {
    background: { 'background-color': 'land' },
    landuse_residential: { 'fill-color': 'residential' },
    park: { 'fill-color': 'park' },
    landcover_wood: { 'fill-color': 'wood' },
    water: { 'fill-color': 'water' },
    waterway: { 'line-color': 'water' },
    building: { 'fill-color': 'building', 'fill-outline-color': 'buildingEdge' },
    highway_path: { 'line-color': 'path' },
    highway_minor: { 'line-color': 'road' },
    highway_major_casing: { 'line-color': 'roadEdge' },
    highway_major_inner: { 'line-color': 'road' },
    highway_motorway_casing: { 'line-color': 'roadEdge' },
    highway_motorway_inner: { 'line-color': 'road' },
    railway: { 'line-color': 'rail' },
    water_name_line_label: { 'text-color': 'waterLabel', 'text-halo-color': 'halo' },
    'highway-name-major': { 'text-color': 'label', 'text-halo-color': 'halo' },
    'highway-name-minor': { 'text-color': 'label', 'text-halo-color': 'halo' }
  };

  function paintFor(id, t) {
    const out = {};
    for (const prop in KEEP[id]) out[prop] = t[KEEP[id][prop]];
    return out;
  }

  // Load Positron and keep only our layers. If it can't be reached, a plain background
  // still lets the pins work.
  async function loadBasemap() {
    const t = THEMES.visit;
    let style;
    try {
      const res = await fetch(SOURCE_STYLE);
      if (!res.ok) throw new Error('style ' + res.status);
      style = await res.json();
    } catch (e) {
      console.warn('Basemap not reachable, using a plain background.', e);
      return { version: 8, glyphs: 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf', sources: {},
        layers: [{ id: 'background', type: 'background', paint: { 'background-color': t.land } }] };
    }
    const layers = style.layers.filter((l) => KEEP[l.id]).map((l) => Object.assign({}, l, { paint: Object.assign({}, l.paint, paintFor(l.id, t)) }));
    // Parks: Positron draws them under houses, so many came out cream. Put them on top,
    // and add grass areas in the same green.
    const park = layers.find((l) => l.id === 'park');
    const rest = layers.filter((l) => l.id !== 'park');
    const at = rest.findIndex((l) => l.id === 'landcover_wood') + 1;
    rest.splice(at, 0, { id: 'landcover_grass', type: 'fill', source: 'openmaptiles', 'source-layer': 'landcover',
      filter: ['==', ['get', 'class'], 'grass'], paint: { 'fill-color': t.park } }, park);
    // Park names in italics, like "Willow Park" in the mockup.
    rest.push({ id: 'park-name', type: 'symbol', source: 'openmaptiles', 'source-layer': 'park', minzoom: 13.5,
      filter: ['has', 'name'],
      layout: { 'text-field': ['coalesce', ['get', 'name:en'], ['get', 'name']], 'text-font': ['Noto Sans Italic'], 'text-size': 13, 'text-max-width': 8 },
      paint: { 'text-color': t.parkLabel, 'text-halo-color': t.halo, 'text-halo-width': 1.5 } });
    style.layers = rest;
    delete style.sources.ne2_shaded;
    return style;
  }

  // Switching mode recolours the basemap in place, without loading it again.
  function paintBasemap(map, mode) {
    const t = THEMES[mode];
    for (const id in KEEP) {
      if (!map.getLayer(id)) continue;
      const p = paintFor(id, t);
      for (const prop in p) map.setPaintProperty(id, prop, p[prop]);
    }
    if (map.getLayer('landcover_grass')) map.setPaintProperty('landcover_grass', 'fill-color', t.park);
    if (map.getLayer('park-name')) {
      map.setPaintProperty('park-name', 'text-color', t.parkLabel);
      map.setPaintProperty('park-name', 'text-halo-color', t.halo);
    }
  }

  // ---- Pins ----------------------------------------------------------------------------------
  // Icon shapes from the mockup (24 x 24 grid, drawn as lines).
  const ICON = {
    food: 'M7 3v8M5 3v4a2 2 0 0 0 4 0V3M7 11v10M17 3c-2 0-3 2-3 5s1 4 3 4v9',
    park: 'M12 3l5 7h-3l4 6H6l4-6H7zM12 16v5',
    museum: 'M3 9l9-5 9 5M5 10v8M9.5 10v8M14.5 10v8M19 10v8M3 20h18',
    shop: 'M5 8h14l-1 12H6zM9 8V6a3 3 0 0 1 6 0v2',
    toilet: 'M10 4a2 2 0 1 0 0 .01M9 8v6h6l2 5M9 11h5M7.5 12.5a5 5 0 1 0 7 5.5'
  };
  // The looks a pin can have. Every look has a white or dark edge and a white or dark icon,
  // so no pin blends into the cream and sage map (the earlier grey ones did).
  //   Visitor: fit (has what you need), unknown (not known yet), nofit (doesn't).
  //   Mapper:  gap (nobody knows yet), answered (you answered), known (already known).
  const LOOK = {
    fit: { bg: '#2F6B3C', fg: '#FFFFFF', edge: '#FFFFFF', dashed: false, ring: 'rgba(47,107,60,0.22)' },
    unknown: { bg: '#FFFFFF', fg: '#26261F', edge: '#4B4C3D', dashed: true, ring: 'rgba(38,38,31,0.14)' },
    nofit: { bg: '#7D7866', fg: '#FFFFFF', edge: '#FFFFFF', dashed: false, ring: 'rgba(38,38,31,0.16)' },
    gap: { bg: '#FFFFFF', fg: '#8A3B1C', edge: '#B4562A', dashed: true, ring: 'rgba(232,135,58,0.3)' },
    answered: { bg: '#E8873A', fg: '#26261F', edge: '#FFFFFF', dashed: false, ring: 'rgba(232,135,58,0.3)' },
    one: { bg: '#F2C994', fg: '#26261F', edge: '#B4562A', dashed: true, ring: 'rgba(232,135,58,0.3)' },
    known: { bg: '#5E9440', fg: '#FFFFFF', edge: '#FFFFFF', dashed: false, ring: 'rgba(94,148,64,0.25)' }
  };
  // Sizes in CSS pixels. A pin is a 44 px circle with a 20 px icon, lifted 6 px above a soft
  // shadow on the ground, so it reads as standing on the map (and stands up in 3D).
  // Hovered or open, it grows to 80 px: four times the icon. FOCUS is that as a scale.
  const PIN = { size: 44, icon: 20, lift: 6, focus: 80 / 44, dot: 14, pad: 6 };
  const RATIO = 2; // drawn at double resolution so they stay sharp on phones
  const W = PIN.size + PIN.pad * 2;            // picture width
  const H = PIN.size + PIN.pad * 2 + PIN.lift + 6; // picture height: room for the ground shadow

  function circle(ctx, cx, cy, r, look, edgeWidth, dash) {
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = look.bg;
    ctx.fill();
    ctx.lineWidth = edgeWidth;
    ctx.strokeStyle = look.edge;
    ctx.setLineDash(look.dashed ? dash : []);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  function canvas() {
    const c = document.createElement('canvas');
    c.width = W * RATIO;
    c.height = H * RATIO;
    const ctx = c.getContext('2d');
    ctx.scale(RATIO, RATIO);
    return [c, ctx];
  }
  // The ground shadow: a soft oval where the pin touches the map. The picture's bottom
  // centre sits exactly on the place (london-map.js anchors pins at the bottom).
  function groundShadow(ctx, w) {
    const g = ctx.createRadialGradient(W / 2, H - 5, 0, W / 2, H - 5, w);
    g.addColorStop(0, 'rgba(20,35,15,0.35)');
    g.addColorStop(1, 'rgba(20,35,15,0)');
    ctx.save();
    ctx.translate(0, (H - 5) * 0.55);
    ctx.scale(1, 0.45);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H * 2);
    ctx.restore();
  }

  function drawPin(look, cat) {
    const [c, ctx] = canvas();
    const r = PIN.size / 2 - 1.5;
    const cx = W / 2, cy = H - 5 - PIN.lift - r; // circle floats PIN.lift above the ground
    groundShadow(ctx, 16);
    // a soft drop shadow under the circle itself
    ctx.save();
    ctx.shadowColor = 'rgba(20,35,15,0.28)'; ctx.shadowBlur = 8; ctx.shadowOffsetY = 3;
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fillStyle = look.bg; ctx.fill();
    ctx.restore();
    circle(ctx, cx, cy, r, look, 3, [5, 4]);
    // the icon, scaled from the 24 x 24 grid to 20 px and centred
    ctx.save();
    const s = PIN.icon / 24;
    ctx.translate(cx - PIN.icon / 2, cy - PIN.icon / 2);
    ctx.scale(s, s);
    ctx.lineWidth = 2.4; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.strokeStyle = look.fg;
    ctx.stroke(new Path2D(ICON[cat]));
    ctx.restore();
    return ctx.getImageData(0, 0, W * RATIO, H * RATIO);
  }

  // Shops (and, for visitors, unchecked places) stay small dots until you zoom in close.
  function drawDot(look) {
    const [c, ctx] = canvas();
    groundShadow(ctx, 8);
    circle(ctx, W / 2, H - 5 - 3 - PIN.dot / 2, PIN.dot / 2, look, 2.5, [3, 2.5]);
    return ctx.getImageData(0, 0, W * RATIO, H * RATIO);
  }

  let pictures = null;
  function addPinImages(map) {
    if (!pictures) {
      pictures = {};
      for (const name in LOOK) {
        for (const cat in ICON) pictures['pin-' + name + '-' + cat] = drawPin(LOOK[name], cat);
        pictures['dot-' + name] = drawDot(LOOK[name]);
      }
    }
    for (const id in pictures) if (!map.hasImage(id)) map.addImage(id, pictures[id], { pixelRatio: RATIO });
  }

  window.MapLook = { THEMES, ICON, LOOK, PIN, loadBasemap, paintBasemap, addPinImages };
})();
