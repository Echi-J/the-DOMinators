// make-search-index.mjs — one small file of every place's name, so typing a name can find it
// anywhere in London (not only in the borough that's open). Loaded the first time someone types.
//   data/search-index.json = { codes: [...33 borough codes], places: [[name, id, borough, cat], ...] }
//   ids are shortened: "osm:node/123" -> "n123", "osm:way/45" -> "w45", "osm:relation/6" -> "r6".
// Run from the Website folder:  node tools/make-search-index.mjs data/places-slim data/search-index.json
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join, basename } from 'node:path';

const [dir = 'data/places-slim', out = 'data/search-index.json'] = process.argv.slice(2);
const codes = [];
const places = [];
for (const file of readdirSync(dir).filter((f) => f.endsWith('.json')).sort()) {
  const b = codes.push(basename(file, '.json')) - 1;
  for (const f of JSON.parse(readFileSync(join(dir, file), 'utf8')).features) {
    const p = f.properties;
    const short = p.id.replace('osm:', '').replace(/^(.)[a-z]*\//, '$1');
    places.push([p.name, short, b, p.cat]);
  }
}
writeFileSync(out, JSON.stringify({ codes, places }));
console.log('Wrote', places.length, 'names');
