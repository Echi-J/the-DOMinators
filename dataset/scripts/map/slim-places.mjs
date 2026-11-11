// slim-places.mjs — makes small copies of Xinrui's place files for the website.
//
// Her files keep 40 fields per place for the report and checking. The website needs two
// small files per borough instead:
//
//   data/places-slim/<code>.json     what the map needs to draw every pin (6 fields per place).
//                                    Downloaded when the borough opens.
//   data/places-detail/<code>.json   address, opening hours, website, last edit, mapper's note.
//                                    Only downloaded when someone opens a place's card, so the
//                                    map itself stays quick on phones.
//
// Places whose name is a made-up fallback ("category_and_source_id_fallback") are left out.
//
// Run from the Website folder:   node tools/slim-places.mjs data/places data
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { join, basename } from 'node:path';

const [inDir = 'data/places', outRoot = 'data'] = process.argv.slice(2);
const slimDir = join(outRoot, 'places-slim');
const detailDir = join(outRoot, 'places-detail');
mkdirSync(slimDir, { recursive: true });
mkdirSync(detailDir, { recursive: true });

const round = (n) => Math.round(n * 1e5) / 1e5; // 5 decimal places is about 1 metre

let kept = 0;
let dropped = 0;
for (const file of readdirSync(inDir).filter((f) => f.endsWith('.geojson'))) {
  const src = JSON.parse(readFileSync(join(inDir, file), 'utf8'));
  const features = [];
  const details = {};
  for (const f of src.features) {
    const p = f.properties;
    if (p.name_en_method === 'category_and_source_id_fallback') { dropped++; continue; }
    features.push({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: f.geometry.coordinates.map(round) },
      properties: {
        id: p.id,                          // e.g. "osm:node/1558137005"
        name: p.name_en,
        cat: p.ui_category,                // food, park, museum, shop, toilet
        sub: p.subcategory,                // cafe, pub, library... picks the pin's icon
        wc: p.wheelchair_display_status,   // yes, partly, no, unknown
        toilet: p.toilet                   // yes, partly, no, unknown
      }
    });
    // Details: only the fields that have something in them, with short names to keep it small.
    const d = {};
    let address = (p.address || '').trim();
    if (p.postcode && !address.includes(p.postcode)) address = address ? address + ', ' + p.postcode : p.postcode;
    if (address) d.a = address;
    if (p.opening_hours_raw) d.h = p.opening_hours_raw;               // OpenStreetMap format, e.g. "Mo-Fr 09:00-17:00"
    if (p.website) d.w = p.website;
    if (p.wheelchair_description_raw) d.n = p.wheelchair_description_raw; // a mapper's own words about access
    if (p.source_last_modified_at) d.e = p.source_last_modified_at.slice(0, 7); // "2026-01": when it was last edited
    details[p.id] = d;
  }
  kept += features.length;
  const code = basename(file, '.geojson');
  // .json so the server compresses it
  writeFileSync(join(slimDir, code + '.json'), JSON.stringify({ type: 'FeatureCollection', features }));
  writeFileSync(join(detailDir, code + '.json'), JSON.stringify(details));
  console.log(code, features.length, 'places');
}
console.log(`Done: ${kept} places kept, ${dropped} without a real name left out.`);
