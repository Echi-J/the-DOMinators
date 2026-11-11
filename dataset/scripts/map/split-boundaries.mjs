// split-boundaries.mjs — makes the borough outline files the map uses, from Xinrui's
// borough_boundaries.geojson (2 MB):
//   data/boundaries/<code>.json   one borough, loaded when that borough opens
//   data/boundaries/all.json      all 33, only loaded for "Use my location" (to find your borough)
// Coordinates are rounded to 5 decimal places (about 1 metre), which roughly halves the size.
//
// Run from the Website folder:  node tools/split-boundaries.mjs data/borough_boundaries.geojson data/boundaries
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const [src = 'data/borough_boundaries.geojson', outDir = 'data/boundaries'] = process.argv.slice(2);
mkdirSync(outDir, { recursive: true });
const round = (c) => (typeof c[0] === 'number' ? c.map((n) => Math.round(n * 1e5) / 1e5) : c.map(round));

const all = JSON.parse(readFileSync(src, 'utf8'));
const features = all.features.map((f) => ({
  type: 'Feature',
  properties: { code: f.properties.borough_code, name: f.properties.borough_name },
  geometry: { type: f.geometry.type, coordinates: round(f.geometry.coordinates) }
}));
for (const f of features) writeFileSync(join(outDir, f.properties.code + '.json'), JSON.stringify({ type: 'FeatureCollection', features: [f] }));
writeFileSync(join(outDir, 'all.json'), JSON.stringify({ type: 'FeatureCollection', features }));
console.log('Wrote', features.length, 'borough outlines and all.json');
