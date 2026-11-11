// slim-stations.mjs — a small copy of Xinrui's TfL station file for the "Get there" screen.
// Keeps name, lines, step-free type and location for all 466 London stations.
// Run from the Website folder:   node tools/slim-stations.mjs data/tfl/stations.geojson data/stations-slim.json
import { readFileSync, writeFileSync } from 'node:fs';

const [inFile = 'data/tfl/stations.geojson', outFile = 'data/stations-slim.json'] = process.argv.slice(2);
const src = JSON.parse(readFileSync(inFile, 'utf8'));
const stations = src.features.map((f) => ({
  name: f.properties.station_name,
  lines: f.properties.line_names_raw || [],
  type: f.properties.accessibility_type_raw, // Full, Partial, Interchange or None (TfL's own words)
  lon: Math.round(f.geometry.coordinates[0] * 1e5) / 1e5,
  lat: Math.round(f.geometry.coordinates[1] * 1e5) / 1e5
}));
writeFileSync(outFile, JSON.stringify(stations));
console.log(outFile, stations.length, 'stations');
