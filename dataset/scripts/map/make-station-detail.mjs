// make-station-detail.mjs — every TfL station with its step-free type, and the step and gap
// between platform and train for each line and direction (from TfL's lrad-v2 data in Xinrui's
// Website/data/tfl/station_access.json). Not live: lifts can be out of order.
//   node tools/make-station-detail.mjs ../data/tfl/station_access.json data/stations-detail.json
import { readFileSync, writeFileSync } from 'node:fs';
const [src, out] = process.argv.slice(2);
const all = JSON.parse(readFileSync(src, 'utf8')).stations;
const LINE = { 'TfL Rail': 'Elizabeth line', Overground: 'London Overground', 'Emirates Air Line': 'IFS Cloud Cable Car' }; // renamed in 2022
const num = (v) => (v === '' || v == null || isNaN(+v) ? null : +v);
const arr = (x) => (x == null ? [] : Array.isArray(x) ? x : [x]);
const rows = [];
for (const s of all) {
  if (!s.within_london || s.longitude == null) continue;
  const r = s.source_record || {};
  const platforms = arr(r.Lines && r.Lines.Line).map((l) => ({
    line: LINE[l.LineName] || l.LineName, towards: l.DirectionTowards || l.Direction || '',
    step: [num(l.StepMin), num(l.StepMax)], gap: [num(l.GapMin), num(l.GapMax)]
  }));
  rows.push({
    name: s.station_name, type: s.accessibility_type_raw, code: s.matched_naptan_id || null,
    lines: [...new Set((s.line_names_raw || []).map((l) => LINE[l] || l))],
    lifts: arr(r.Lifts && r.Lifts.Lift).length, borough: s.borough_code,
    lon: +s.longitude.toFixed(5), lat: +s.latitude.toFixed(5), platforms
  });
}
writeFileSync(out, JSON.stringify({ source: 'TfL lrad-v2 via Xinrui Li\'s station_access.json', not_live: true, file_dated: all[0].source_http_last_modified_at, stations: rows }));
console.log(rows.length, 'stations ->', out);
