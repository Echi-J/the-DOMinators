# Access London — CASA0017 website source

This repository contains the Access London source organised in the course template's `front-end/` and `back-end/` layout. It is an Express 5 + MySQL implementation. The original Cloudflare Worker / D1 source in another repository is a different architecture. **Confirm the exact version deployed on the Raspberry Pi before describing this archive as the live version.**

## Project layout

- `front-end/` — static HTML, CSS and JavaScript, including map, route planning, accessibility answers and barrier issue-report UI
- `back-end/server.js` — Express application and API route registration
- `back-end/routes/` — places, boroughs, stations, answers, journeys and moderated barrier reports
- `database/schema.sql` — core database structure (contains destructive DROP statements)
- `database/import.js` — initial import (resets core tables)
- `database/migrate.js` and `database/migrations/` — additive table migration
- `data/` — the group's published borough, place and TfL data files
- `seed/` — database import inputs, to be uploaded separately if not already present
- `test/` — optional test scripts, to be uploaded separately if available

## Requirements and local installation

- Node.js >= 22.13; npm; local MySQL server with an empty database created by an administrator
- From `Website/`, run `npm ci` (requires access to the package registry).
- Copy `.env.example` to `.env`, set your **own** local database username, password, host and database; use an account with narrowly scoped permissions where possible. Set an ORS key for routing and a review secret for moderation, if testing those features.
- **For a fresh, disposable database only:** run `npm run db:setup`, then `npm run db:migrate`. Initial import clears/recreates core tables. NEVER run this against the live Pi database or an existing populated database.
- Start: `npm start` from `Website/`, then visit `http://localhost:3000/` (or your configured `PORT`). 

## Testing

- `npm run test:structure` — code structure and journey helper tests; no MySQL required. requires the `test/` directory to be present.
- `npm test` — integration tests that **connect to and change test answers in MySQL**; run only against a disposable test database and running local server; review the test script first.
- Route requests and web pages need a running MySQL database with imported seed data.

## Important scope and submission notes

The application has separate flows: mapper answers use a two-agree SQL confirmation rule, while physical barrier reports are moderated before public display. Do not confuse these in the group report. This GitHub source tree must not contain live user reports or database exports. Verify the deployment against this source before claiming the versions match.

Complete course-specific attribution, the final group report, AI use declaration, team contribution statement, actual deployment URL and screenshot evidence separately. See `PI_DEPLOY_GUIDE.md` and `DATA_LICENSES.txt`. Verify licenses and dataset provenance with the original data owners before releasing or submitting datasets externally.
