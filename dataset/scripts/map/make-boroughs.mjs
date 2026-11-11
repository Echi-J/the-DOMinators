// make-boroughs.mjs — a small copy of Xinrui's boroughs.json with only what the map page needs:
// tile position, score, % of places checked, % unknown, and whether the score can be shown.
// Run from the Website folder:  node tools/make-boroughs.mjs ../data/boroughs-map.json data/boroughs-map.json
import { readFileSync, writeFileSync } from 'node:fs';

const [src = '../data/boroughs-map.json', out = 'data/boroughs-map.json'] = process.argv.slice(2);
const all = JSON.parse(readFileSync(src, 'utf8'));
const keep = all.map((b) => ({
  code: b.borough_code, name: b.borough_name, ui: b.ui_code, row: b.grid_row, col: b.grid_column,
  places: b.n_osm_objects,
  score: b.osm_wheelchair_tag_score == null ? null : Math.round(b.osm_wheelchair_tag_score),
  checked: Math.round(b.osm_wheelchair_tag_coverage_pct),
  unknown: Math.round(b.osm_wheelchair_unknown_pct),
  scoreOk: !!b.tag_score_displayable_under_prototype_rule // Xinrui's rule: enough places checked to show a score
}));
writeFileSync(out, JSON.stringify(keep, null, 1));
console.log('Wrote', keep.length, 'boroughs');
