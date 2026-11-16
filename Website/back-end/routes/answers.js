// routes/answers.js — Mapper answers to the three questions. No sign-in.
//
//   GET  /api/answers?borough=E09000012&device=<id>
//        -> { places: { "<place id>": { ent, toilet, lift, people, simulated, latest, mine } } }
//           each question: { value: 'yes', count: 3, confirmed: true, disagree: false } or null
//   POST /api/answers   { place_id, device_id, ans: { ent: 'yes', toilet: 'no', lift: 'unsure' } }
//        -> the same summary for that one place
//
// The two-agree rule itself lives in the database (the confirmed_answers view in schema.sql).
import { Router } from 'express';
import { createHash } from 'node:crypto';
import rateLimit from 'express-rate-limit';
import { db } from '../db.js';

const router = Router();

const ALLOWED = {
  ent: ['yes', 'no', 'unsure'],            // Is there a step-free way in?
  toilet: ['yes', 'no', 'unsure'],         // Is there an accessible toilet?
  lift: ['yes', 'no', 'one', 'unsure'],    // Every floor without stairs? ("one" = one floor only)
};

// The browser's random id is never stored, only a one-way code of it, so nobody can read
// someone's id out of the database and answer as them.
const personCode = (deviceId) => createHash('sha256').update('device:' + deviceId).digest('hex').slice(0, 16);
const validDevice = (id) => typeof id === 'string' && /^[A-Za-z0-9-]{6,64}$/.test(id);

// Builds { placeId: { ent, toilet, lift, people, simulated, latest, mine } } for some places.
async function summarise(where, values, deviceId) {
  // How many people gave each answer, and which questions are confirmed (both views in schema.sql)
  const [counts] = await db.query(`SELECT place_id, question, value, people FROM answer_counts WHERE ${where}`, values);
  const [confirmed] = await db.query(`SELECT place_id, question, value FROM confirmed_answers WHERE ${where}`, values);
  // Who answered, how many of them are simulated, and when the last answer came in
  const [people] = await db.query(
    `SELECT place_id, COUNT(*) AS people, SUM(is_simulated) AS simulated, MAX(answered_at) AS latest,
            SUM(person = ?) AS mine
       FROM answers WHERE ${where} GROUP BY place_id`, [validDevice(deviceId) ? personCode(deviceId) : '', ...values]);

  const places = {};
  for (const p of people) {
    places[p.place_id] = {
      ent: null, toilet: null, lift: null,
      people: p.people, simulated: Number(p.simulated), latest: p.latest, mine: Number(p.mine) > 0,
    };
  }
  // For each question: the most common answer, how many gave it, and whether anyone disagreed.
  const options = {};
  for (const c of counts) ((options[c.place_id] ??= {})[c.question] ??= []).push(c);
  for (const [placeId, questions] of Object.entries(options)) {
    for (const [question, list] of Object.entries(questions)) {
      list.sort((a, b) => b.people - a.people);
      places[placeId][question] = { value: list[0].value, count: list[0].people, confirmed: false, disagree: list.length > 1 };
    }
  }
  for (const c of confirmed) places[c.place_id][c.question].confirmed = true;
  return places;
}

router.get('/answers', async (req, res) => {
  const borough = String(req.query.borough || '');
  if (borough !== 'all' && !/^E09\d{6}$/.test(borough)) return res.status(400).json({ error: 'Add a borough code or ?borough=all' });
  const where = borough === 'all' ? '1=1' : 'borough_code = ?';
  const values = borough === 'all' ? [] : [borough];
  res.json({ borough, places: await summarise(where, values, req.query.device) });
});

// At most 60 answers every 15 minutes from one internet connection, to stop floods.
const limit = rateLimit({ windowMs: 15 * 60 * 1000, limit: 60, message: { error: 'Too many answers. Please try again later.' } });

router.post('/answers', limit, async (req, res) => {
  const { place_id: placeId, device_id: deviceId, ans } = req.body || {};

  // 1. Check the answer: a real place, a sensible device id, allowed values only.
  const [[place]] = await db.query('SELECT id, borough_code FROM places WHERE id = ?', [String(placeId)]);
  if (!place) return res.status(400).json({ error: 'Unknown place.' });
  if (!validDevice(deviceId)) return res.status(400).json({ error: 'Invalid device id.' });
  if (!ans || typeof ans !== 'object') return res.status(400).json({ error: 'No answers given.' });
  const clean = {};
  for (const [question, allowed] of Object.entries(ALLOWED)) {
    const value = ans[question] ?? null;
    if (value !== null && !allowed.includes(value)) return res.status(400).json({ error: `Invalid answer for ${question}.` });
    clean[question] = value;
  }
  if (!clean.ent && !clean.toilet && !clean.lift) return res.status(400).json({ error: 'No answers given.' });

  // 2. Save it. If this person already answered this place, update their row instead:
  //    one person, one answer per place. A question not asked this time keeps the old answer.
  await db.query(
    `INSERT INTO answers (place_id, borough_code, person, ent, toilet, lift, is_simulated, answered_at)
     VALUES (?, ?, ?, ?, ?, ?, FALSE, UTC_TIMESTAMP())
     ON DUPLICATE KEY UPDATE
       ent = COALESCE(VALUES(ent), ent),
       toilet = COALESCE(VALUES(toilet), toilet),
       lift = COALESCE(VALUES(lift), lift),
       answered_at = VALUES(answered_at)`,
    [place.id, place.borough_code, personCode(deviceId), clean.ent, clean.toilet, clean.lift]);

  // 3. Send back the place's new summary, so the page can show "1 more" or "Confirmed" at once.
  const summary = await summarise('place_id = ?', [place.id], deviceId);
  res.status(201).json({ place: place.id, borough: place.borough_code, summary: summary[place.id] });
});

export default router;
