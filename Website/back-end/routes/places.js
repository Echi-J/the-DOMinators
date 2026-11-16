// routes/places.js — the places in a borough (map 2), their details, and the search list.
//
//   GET /api/places?borough=E09000012            every place as a map pin (GeoJSON, 6 fields each)
//   GET /api/places/details?borough=E09000012    address, opening hours, website... for the place card
//   GET /api/search-index                        every place name in London, for the search box
import { Router } from 'express';
import { db } from '../db.js';

const router = Router();

// Places whose name was made up from the category ("has_real_name = FALSE") are not shown.
router.get('/places', async (req, res) => {
  const [rows] = await db.query(
    `SELECT id, name, category, subcategory, wheelchair, toilet, lon, lat
       FROM places WHERE borough_code = ? AND has_real_name ORDER BY id`, [req.query.borough]);
  res.json({
    type: 'FeatureCollection',
    features: rows.map((p) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [Number(p.lon), Number(p.lat)] },
      properties: { id: p.id, name: p.name, cat: p.category, sub: p.subcategory, wc: p.wheelchair, toilet: p.toilet },
    })),
  });
});

router.get('/places/details', async (req, res) => {
  const [rows] = await db.query(
    `SELECT id, address, opening_hours, website, access_note, last_edited
       FROM places WHERE borough_code = ? AND has_real_name`, [req.query.borough]);
  const details = {};
  for (const p of rows) {
    // short names keep the reply small: a = address, h = hours, w = website, n = note, e = last edited
    const d = {};
    if (p.address) d.a = p.address;
    if (p.opening_hours) d.h = p.opening_hours;
    if (p.website) d.w = p.website;
    if (p.access_note) d.n = p.access_note;
    if (p.last_edited) d.e = p.last_edited;
    details[p.id] = d;
  }
  res.json(details);
});

// One list of every named place in London: [name, short id, borough number, category].
// "osm:node/123" is shortened to "n123" to keep the list small.
router.get('/search-index', async (req, res) => {
  const [boroughs] = await db.query('SELECT code FROM boroughs ORDER BY code');
  const codes = boroughs.map((b) => b.code);
  const [rows] = await db.query('SELECT id, name, borough_code, category FROM places WHERE has_real_name ORDER BY borough_code, id');
  res.set('Cache-Control', 'public, max-age=600');
  res.json({
    codes,
    places: rows.map((p) => [p.name, p.id.replace('osm:', '').replace(/^(.)[a-z]*\//, '$1'), codes.indexOf(p.borough_code), p.category]),
  });
});

// City overview: cluster REAL place coordinates, never rounded longitude/latitude grid centres.
// Filtering takes place before clustering, so the displayed counts reflect the selected needs.
const overviewCache = new Map();
router.get('/places/overview', async (req, res) => {
  const cats = String(req.query.cats || '').split(',').filter(Boolean).sort();
  const needs = String(req.query.needs || '').split(',').filter(Boolean).sort();
  const validCats = new Set(['food', 'park', 'museum', 'shop', 'toilet']);
  const validNeeds = new Set(['ent', 'toilet']);
  if (cats.some((cat) => !validCats.has(cat)) || needs.some((need) => !validNeeds.has(need)))
    return res.status(400).json({ error: 'Invalid accessibility filter.' });

  const key = cats.join(',') + '|' + needs.join(',');
  try {
    const cached = overviewCache.get(key);
    if (!cached || cached.expiresAt < Date.now()) {
      const where = ['p.has_real_name'];
      const params = [];
      if (cats.length) {
        where.push(`p.category IN (${cats.map(() => '?').join(',')})`);
        params.push(...cats);
      }
      // Confirmed Mapper answers take precedence over the original OSM fields.
      // An unknown/partly/no value is never treated as YES.
      const needEnt = needs.includes('ent');
      const needToilet = needs.includes('toilet');
      const joins = [
        needEnt ? "LEFT JOIN confirmed_answers ca_ent ON ca_ent.place_id = p.id AND ca_ent.question = 'ent'" : '',
        needToilet ? "LEFT JOIN confirmed_answers ca_toilet ON ca_toilet.place_id = p.id AND ca_toilet.question = 'toilet'" : ''
      ].filter(Boolean).join(' ');
      if (needEnt) where.push("COALESCE(ca_ent.value, p.wheelchair) = 'yes'");
      if (needToilet) where.push("COALESCE(ca_toilet.value, p.toilet) = 'yes'");

      const [rows] = await db.query(`
        SELECT p.lon, p.lat FROM places p ${joins}
        WHERE ${where.join(' AND ')} ORDER BY p.id`, params);
      // Each GeoJSON point represents exactly one named place. MapLibre clusters
      // these genuine coordinates, removing the artificial square-grid pattern.
      const geojson = {
        type: 'FeatureCollection',
        features: rows.map((r) => ({
          type: 'Feature',
          properties: { count: 1 },
          geometry: { type: 'Point', coordinates: [Number(r.lon), Number(r.lat)] }
        }))
      };
      // Keep only the most recent few combinations to limit server memory use.
      if (overviewCache.size >= 5) overviewCache.delete(overviewCache.keys().next().value);
      overviewCache.set(key, { data: geojson, expiresAt: Date.now() + 20000 });
    }
    // A new Mapper confirmation should not be hidden by a browser cache.
    res.set('Cache-Control', 'no-store');
    res.json(overviewCache.get(key).data);
  } catch (error) {
    console.error('London overview:', error);
    res.status(500).json({ error: 'Unable to load the London overview.' });
  }
});

// Resolve full UK postcodes (E15 4QR) or postcode districts (E15).
// Uses the public Postcodes.io geocoder; no API key is required.
router.get('/postcode', async (req, res) => {
  const raw = String(req.query.postcode || '').trim().toUpperCase().replace(/\s+/g, '');
  const full = /^(?:GIR0AA|[A-Z]{1,2}\d[A-Z\d]?\d[A-Z]{2})$/.test(raw);
  const district = /^[A-Z]{1,2}\d[A-Z\d]?$/.test(raw);
  if (!full && !district) return res.status(400).json({ error: 'Enter a full UK postcode or postcode district.' });
  const provider = 'https://api.postcodes.io/' + (full ? 'postcodes/' : 'outcodes/') + encodeURIComponent(raw);
  try {
    const response = await fetch(provider, { signal: AbortSignal.timeout(7000) });
    if (response.status === 404) return res.status(404).json({ error: 'Postcode not found.' });
    if (!response.ok) throw new Error('Geocoding service error');
    const json = await response.json();
    const result = json.result;
    if (!result || !Number.isFinite(result.longitude) || !Number.isFinite(result.latitude))
      throw new Error('Postcode has no coordinates');
    const lon = result.longitude, lat = result.latitude;
    if (lon < -0.53 || lon > 0.35 || lat < 51.27 || lat > 51.72)
      return res.status(422).json({ error: 'This postcode is outside the London map.' });
    res.json({ postcode: result.postcode || result.outcode || raw, lon, lat });
  } catch (error) {
    console.error('Postcode lookup:', error.message);
    res.status(502).json({ error: 'Postcode lookup is unavailable. Please try again.' });
  }
});

// Fetch real places only in the part of London visible on screen (zoomed-in map).
// No destructive schema changes or downloads of all 74,500 records are required.
router.get('/places/viewport', async (req, res) => {
  const west = Number(req.query.west), south = Number(req.query.south);
  const east = Number(req.query.east), north = Number(req.query.north);
  if (![west, south, east, north].every(Number.isFinite) ||
      west >= east || south >= north || east - west > 2 || north - south > 1 ||
      west < -180 || east > 180 || south < -90 || north > 90) {
    return res.status(400).json({ error: 'Supply a valid, limited map bounding box.' });
  }
  const MAX = 10000;
  const [rows] = await db.query(
    `SELECT id, name, category, subcategory, wheelchair, toilet, lon, lat, borough_code
       FROM places
      WHERE has_real_name AND lon BETWEEN ? AND ? AND lat BETWEEN ? AND ?
      ORDER BY id LIMIT ?`, [west, east, south, north, MAX + 1]);
  const truncated = rows.length > MAX;
  res.set('Cache-Control', 'public, max-age=15');
  res.json({
    truncated,
    type: 'FeatureCollection',
    features: rows.slice(0, MAX).map((p) => ({
      type: 'Feature', geometry: { type: 'Point', coordinates: [Number(p.lon), Number(p.lat)] },
      properties: { id: p.id, name: p.name, cat: p.category, sub: p.subcategory,
        wc: p.wheelchair, toilet: p.toilet, borough: p.borough_code }
    }))
  });
});

// Search can zoom directly to a place without first loading its entire borough.
router.get('/places/locate', async (req, res) => {
  const id = String(req.query.id || '');
  if (!id || id.length > 40) return res.status(400).json({ error: 'Invalid place id.' });
  const [[p]] = await db.query('SELECT lon, lat, borough_code FROM places WHERE id = ? LIMIT 1', [id]);
  if (!p) return res.status(404).json({ error: 'Place not found.' });
  res.json({ lon: Number(p.lon), lat: Number(p.lat), borough: p.borough_code });
});

// Details are loaded when a particular place is opened, rather than for the whole city.
router.get('/places/detail', async (req, res) => {
  const id = String(req.query.id || '');
  if (!id || id.length > 40) return res.status(400).json({ error: 'Invalid place id.' });
  const [[p]] = await db.query(
    'SELECT address, opening_hours, website, access_note, last_edited FROM places WHERE id = ? LIMIT 1', [id]);
  if (!p) return res.status(404).json({ error: 'Place not found.' });
  res.json({ a: p.address || '', h: p.opening_hours || '', w: p.website || '',
    n: p.access_note || '', e: p.last_edited || '' });
});

export default router;
