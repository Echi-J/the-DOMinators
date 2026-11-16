// routes/boroughs.js — the 33 boroughs for the tile map (map 1), and their outlines.
//
//   GET /api/boroughs            [{ code, name, ui, row, col, places, checked, unknown, score, scoreOk, disability, imd }]
//   GET /api/boundaries          all 33 outlines (GeoJSON), for "Use my location"
//   GET /api/boundaries/:code    one outline, e.g. /api/boundaries/E09000012
import { Router } from 'express';
import { db } from '../db.js';

const router = Router();

// The figures are worked out from the places table every time, so a confirmed Mapper
// answer about a step-free entrance changes its borough straight away.
router.get('/boroughs', async (req, res) => {
  const [rows] = await db.query(`
    SELECT b.code, b.name, b.ui_code, b.grid_row, b.grid_col, b.disability_pct, b.imd_score,
           COUNT(*)              AS places,
           SUM(tag = 'yes')      AS yes,
           SUM(tag = 'limited')  AS limited,
           SUM(tag = 'no')       AS no,
           SUM(tag = 'unknown')  AS unknown
      FROM boroughs b
      JOIN (
            -- each place's wheelchair tag; a confirmed answer replaces an unknown or old tag
            SELECT p.borough_code, COALESCE(c.value, p.wheelchair_tag) AS tag
              FROM places p
              LEFT JOIN confirmed_answers c ON c.place_id = p.id AND c.question = 'ent'
           ) t ON t.borough_code = b.code
     GROUP BY b.code
     ORDER BY b.code`);

  res.json(rows.map((b) => {
    const checked = 100 * (b.places - b.unknown) / b.places;      // % of places with any wheelchair information
    const rated = Number(b.yes) + Number(b.limited) + Number(b.no);
    return {
      code: b.code, name: b.name, ui: b.ui_code, row: b.grid_row, col: b.grid_col,
      places: b.places,
      checked: Math.round(checked),
      unknown: Math.round(100 - checked),
      // Score out of 100: yes = 1, limited = 0.5, no = 0 (Xinrui's formula)
      score: rated ? Math.round(100 * (Number(b.yes) + 0.5 * Number(b.limited)) / rated) : null,
      // Only show a score once at least 15% of places have been checked (Xinrui's rule)
      scoreOk: checked >= 15,
      disability: Number(b.disability_pct),   // Census 2021, % of residents
      imd: Number(b.imd_score),               // IMD 2025 average score
    };
  }));
});

const outline = (row) => ({ type: 'Feature', properties: { code: row.code, name: row.name }, geometry: row.boundary });

router.get('/boundaries', async (req, res) => {
  const [rows] = await db.query('SELECT code, name, boundary FROM boroughs ORDER BY code');
  res.json({ type: 'FeatureCollection', features: rows.map(outline) });
});

router.get('/boundaries/:code', async (req, res) => {
  const [rows] = await db.query('SELECT code, name, boundary FROM boroughs WHERE code = ?', [req.params.code]);
  if (!rows.length) return res.status(404).json({ error: 'No borough with that code.' });
  res.json({ type: 'FeatureCollection', features: rows.map(outline) });
});

export default router;
