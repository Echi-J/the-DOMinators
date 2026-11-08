import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
const root=path.resolve(import.meta.dirname,'..'),web=path.join(root,'public');
const load=async file=>JSON.parse(await fs.readFile(path.join(web,'data',file),'utf8'));
const [data,meta,catalog]=await Promise.all([load('toiletmap/london_toilets.geojson'),load('toiletmap/metadata.json'),load('catalog.json')]);
assert.equal(meta.counts.london_records,data.features.length);
assert.equal(meta.counts.source_records,data.features.length+Object.values(meta.counts.excluded).reduce((a,b)=>a+b,0));
assert.equal(new Set(data.features.map(f=>f.id)).size,data.features.length);
assert.equal(new Set(data.features.map(f=>f.properties.borough_code)).size,33);
const context={URL,Map,Set,console,document:{currentScript:{src:'http://test/js/access-data.js'}},location:{href:'http://test/map.html'}};
context.window=context;vm.createContext(context);
vm.runInContext(await fs.readFile(path.join(web,'js/access-data.js'),'utf8'),context);
const boundaries=await load('borough_boundaries.geojson');
const claims={yes:0,no:0,unknown:0};
for(const f of data.features){
 const p=f.properties;assert.equal(p.feature_id,f.id);assert.equal(p.source_provider,'toiletmap');
 assert.deepEqual(f.geometry.coordinates,[p.longitude,p.latitude]);
 assert.equal(context.AccessData.findBorough(p,boundaries)?.properties.borough_code,p.borough_code);
 assert.equal(p.survey_observed_at,null);assert.equal(p.matched_place_id,null);
 assert.equal(p.official_changing_places_registration,'not_verified');
 assert.ok(!/[\u3400-\u9fff]/.test(p.name_en));
 assert.ok(Object.values(p.source_claims).every(v=>['yes','no','unknown'].includes(v)));
 claims[p.source_claims.accessible]++;
 for(const c of p.candidate_osm_matches){assert.ok(c.distance_m<=20);assert.equal(c.review_status,'unreviewed');}
}
assert.deepEqual(claims,meta.claim_counts.accessible);
assert.equal(catalog.additional_datasets.find(r=>r.id==='toiletmap_london').records,data.features.length);
assert.equal(catalog.record_count,74500,'Additional source must not inflate OSM coverage denominator');
assert.equal(meta.license,'CC-BY-4.0');
const index=JSON.parse(await fs.readFile(path.join(root,'lib/place-index.json'),'utf8'));
for(const f of data.features){assert.equal(index[f.id]?.[0],f.properties.borough_code);assert.equal(index[f.id]?.[2],'facility','New facility must be an accepted contribution target');}
console.log(`Passed: ${data.features.length} Toilet Map records, all borough assignments, source claims, nulls, candidate separation and catalogue totals.`);
