// routes/stations.js — TfL stations and how step-free they are, for "Get there".
//
//   GET /api/stations   [{ name, lines, type, lon, lat }]   type = Full, Partial, Interchange or None
import { Router } from 'express';
import { db } from '../db.js';

const router = Router();

router.get('/stations', async (req, res) => {
  const [rows] = await db.query('SELECT name, line_names, step_free, lon, lat FROM stations ORDER BY name');
  res.set('Cache-Control', 'public, max-age=600');
  res.json(rows.map((s) => ({ name: s.name, lines: s.line_names, type: s.step_free, lon: Number(s.lon), lat: Number(s.lat) })));
});

export default router;
