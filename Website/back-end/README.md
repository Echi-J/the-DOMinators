# Access London — backend

Node.js / Express API on MySQL (`mysql2/promise`). Run it from the **Website** project root — this folder alone won't install or start the app.

- `server.js` — mounts `/api` and serves the front end
- `db.js` — shared MySQL pool
- `routes/` — boroughs, places, stations, answers, journeys, barrier reports

Two things that trip people up:
- The "two agreeing answers = confirmed" rule lives in the SQL views in `database/schema.sql`, not in the routes.
- Barrier reports stay hidden until reviewed. The ORS key stays server-side in `.env`.

Only comments were changed — no code, endpoints, or SQL touched. Check against your deployed copy before swapping files in.