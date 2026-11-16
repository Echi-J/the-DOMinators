// server.js — starts the site: one Express server for both pages and API.
//
//   npm start   then open http://localhost:3000
//
//   Browser ──▶ /map.html, /js/...        ──▶ files in front-end/
//   Browser ──▶ /api/boroughs, /api/...   ──▶ routes/ ──▶ MySQL (db.js)
import express from 'express';
import { fileURLToPath } from 'node:url';
import { db } from './db.js';
import boroughs from './routes/boroughs.js';
import places from './routes/places.js';
import stations from './routes/stations.js';
import answers from './routes/answers.js';
import journey from './routes/journey.js';
import barriers from './routes/barriers.js';

const app = express();
// Report photos are compressed into <=900 KB JPEG data URLs; route validators enforce their own size limits.
app.use(express.json({ limit: '1.7mb' }));

// The API: every route reads from or writes to MySQL.
app.use('/api', boroughs);    // GET  /api/boroughs, /api/boundaries, /api/boundaries/:code
app.use('/api', places);      // GET  /api/places?borough=, /api/places/details?borough=, /api/search-index
app.use('/api', stations);    // GET  /api/stations
app.use('/api', answers);     // GET / POST /api/answers
app.use('/api', journey);     // server-side ORS routing and location search
app.use('/api', barriers);    // moderated geolocated photo reports

// Is the database there? Handy for checking the setup.
app.get('/api/health', async (req, res) => {
  const [[row]] = await db.query('SELECT COUNT(*) AS places, (SELECT COUNT(*) FROM answers) AS answers FROM places');
  res.json({ status: 'ok', database: 'mysql', ...row });
});

app.use('/api', (req, res) => res.status(404).json({ error: 'No such API route.' }));

// The website's pages, styles and scripts.
app.use(express.static(fileURLToPath(new URL('../front-end/', import.meta.url))));

// Any error ends up here, so the browser gets a short message instead of a crash.
app.use((error, req, res, next) => {
  const status = error.status || 500;
  if (status === 500) console.error(error);
  res.status(status).json({ error: status === 500 ? 'Something went wrong on the server.' : error.message });
});

const port = Number(process.env.PORT || 3000);
app.listen(port, (error) => {
  if (error) throw new Error(`Could not start on port ${port} (${error.code}). Is another server already using it?`);
  console.log(`Access London is running: http://localhost:${port}`);
});
