// make-toilets.mjs — The Toilet Map's London toilets (CC BY 4.0), slimmed for the map.
//   node tools/make-toilets.mjs ../data/toiletmap/london_toilets.geojson data/toilets.json
import { readFileSync, writeFileSync } from 'node:fs';
const [src, out] = process.argv.slice(2);
const f = JSON.parse(readFileSync(src, 'utf8')).features;
const rows = f.filter((x) => x.properties.within_london).map((x) => {
  const p = x.properties, c = p.source_claims || {};
  return { name: p.name_en || p.name_raw || 'Public toilet', lon: +p.longitude.toFixed(5), lat: +p.latitude.toFixed(5), borough: p.borough_code,
    accessible: c.accessible, radar: c.radar, free: c.no_payment, baby_change: c.baby_change, all_gender: c.all_gender,
    note: p.notes_source || null, updated: (p.source_updated_at || '').slice(0, 10) || null };
});
writeFileSync(out, JSON.stringify({ source: 'The Toilet Map (toiletmap.org.uk), CC BY 4.0, via Xinrui Li', snapshot: '2026-11-08', toilets: rows }));
console.log(rows.length, 'toilets ->', out);
