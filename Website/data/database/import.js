// seed.js — loads the seed/ folder into MySQL
// seed/ has the cleaned data from Xinrui's Python pipeline (OSM places, borough
// figures and outlines, TfL stations) plus our simulated survey responses.
// Once this runs, the website reads everything from MySQL and never touches seed/ again.
// Running it again is fine because we clear the tables first, so nothing gets counted twice.
// Sources: lecture slides (L5 file reading, L7 databases / create tables / import data)
// and a few W3Schools pages I looked up (filesystem, mysql, mysql insert, JSON.parse,
// string methods like split/trim/slice). Can't remember the exact URLs. Code is ours.
import { readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import mysql from 'mysql2/promise';

const seed = (file) => new URL('../seed/' + file, import.meta.url);
const readJSON = (file) => JSON.parse(readFileSync(seed(file), 'utf8'));
const round = (n) => Math.round(n * 1e6) / 1e6;

const db = await mysql.createConnection({
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'access_london',
  multipleStatements: true,   // schema.sql has many statements
  timezone: 'Z',
});

// Insert many rows at once, 1,000 at a time (much faster than one by one).
// W3Schools: https://www.w3schools.com/nodejs/nodejs_mysql_insert.asp (INSERT INTO ... VALUES ? with many rows)
async function insertRows(table, columns, rows) {
  for (let i = 0; i < rows.length; i += 1000) {
    try {
      await db.query(`INSERT INTO ${table} (${columns.join(', ')}) VALUES ?`, [rows.slice(i, i + 1000)]);
    } catch (error) {
      throw new Error(`Importing ${table} failed near row ${i + 1}: ${error.sqlMessage || error.message}`);
    }
  }
  console.log(`  ${table}: ${rows.length} rows`);
}

// 1. Tables and views ---------------------------------------------------------------------------
console.log('1. Creating tables from database/schema.sql');
await db.query(readFileSync(new URL('./schema.sql', import.meta.url), 'utf8'));

// 2. Boroughs: figures from boroughs.json, outlines from borough_boundaries.geojson -------------
console.log('2. Importing data');
const outlines = {};
for (const f of readJSON('borough_boundaries.geojson').features) outlines[f.properties.borough_code] = f.geometry;
await insertRows('boroughs',
  ['code', 'name', 'ui_code', 'grid_row', 'grid_col', 'disability_pct', 'imd_score', 'boundary'],
  readJSON('boroughs.json').map((b) => [
    b.borough_code, b.borough_name, b.ui_code, b.grid_row, b.grid_column,
    b.disability_rate_pct, b.imd_average_score, JSON.stringify(outlines[b.borough_code]),
  ]));

// 3. Places: one file per borough -------------------------------------------------------------
const places = [];
for (const file of readdirSync(seed('places/')).filter((f) => f.endsWith('.geojson')).sort()) {
  for (const f of readJSON('places/' + file).features) {
    const p = f.properties;
    let address = (p.address || '').trim();
    if (p.postcode && !address.includes(p.postcode)) address = address ? address + ', ' + p.postcode : p.postcode;
    places.push([
      p.id, p.borough_code, p.name_en, p.name_en_method !== 'category_and_source_id_fallback',
      p.ui_category, p.subcategory, round(f.geometry.coordinates[0]), round(f.geometry.coordinates[1]),
      p.wheelchair_access, p.wheelchair_display_status, p.toilet,
      address || null, p.opening_hours_raw || null, p.website || null,
      p.wheelchair_description_raw || null, p.source_last_modified_at ? p.source_last_modified_at.slice(0, 7) : null,
    ]);
  }
}
await insertRows('places',
  ['id', 'borough_code', 'name', 'has_real_name', 'category', 'subcategory', 'lon', 'lat',
   'wheelchair_tag', 'wheelchair', 'toilet', 'address', 'opening_hours', 'website', 'access_note', 'last_edited'],
  places);

// 4. TfL stations (only those with a location) ------------------------------------------------
await insertRows('stations', ['name', 'line_names', 'step_free', 'lon', 'lat'],
  readJSON('tfl/stations.geojson').features.map((f) => [
    f.properties.station_name, JSON.stringify(f.properties.line_names_raw || []),
    f.properties.accessibility_type_raw, round(f.geometry.coordinates[0]), round(f.geometry.coordinates[1]),
  ]));

// 5. Simulated survey responses -> answers (is_simulated = TRUE) ------------------------------
// Each survey respondent counts as one person, exactly like someone answering on the map.
const boroughOf = Object.fromEntries(places.map((p) => [p[0], p[1]]));
const lines = readFileSync(seed('simulated_surveys.csv'), 'utf8').trim().split(/\r?\n/);
const head = lines.shift().split(',');
const col = (name) => head.indexOf(name);
const orNull = (v) => v || null;   // an empty cell means the question was not asked
await insertRows('answers',
  ['place_id', 'borough_code', 'person', 'ent', 'toilet', 'lift', 'is_simulated', 'answered_at'],
  lines.map((line) => {
    // place names may contain commas, so take the fixed columns from both ends
    const cells = line.split(',');
    const end = cells.slice(-5);  // ent, toilet, lift, submitted_at_utc, is_synthetic
    const placeId = cells[col('place_id')];
    if (!boroughOf[placeId]) throw new Error('Survey place not found in places: ' + placeId);
    return [
      placeId, boroughOf[placeId],
      createHash('sha256').update('survey:' + cells[col('respondent_id')]).digest('hex').slice(0, 16),
      orNull(end[0]), orNull(end[1]), orNull(end[2]),
      true, end[3].replace('T', ' ').replace('Z', ''),
    ];
  }));

// 6. Check ----------------------------------------------------------------------------------
const [[counts]] = await db.query(`SELECT
  (SELECT COUNT(*) FROM boroughs) AS boroughs, (SELECT COUNT(*) FROM places) AS places,
  (SELECT COUNT(*) FROM stations) AS stations, (SELECT COUNT(*) FROM answers) AS answers,
  (SELECT COUNT(DISTINCT place_id) FROM confirmed_answers) AS places_with_a_confirmed_answer`);
console.log('3. Done:', counts);
await db.end();
