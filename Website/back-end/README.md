# Access London backend

The application builds the client from `../front-end/` and snapshots from `../data/`. It serves TfL lift reports and moderated observations through same-origin API routes. D1 tables and migrations are in `db/` and `drizzle/`. The lift adapter identifies requests to TfL and preserves the 15-minute expiry policy.

From this directory, with Node 22.13 or later:

```sh
npm ci
npm test
npm run build
npm run db:local
npm start
```

The final command prints the local preview address. `node server.js` is an alternative development entry. Local database contents are separate from production. No field observations are seeded.

Production is the existing Access London Sites deployment. Its trusted authentication gateway supplies user identity; D1 and the reviewer allowlist are runtime configuration. Do not expose this header-based authentication directly through an untrusted public proxy. The hosting manifest identifies the existing project and contains no credentials. Publishing requires authorized Sites access. GitHub Pages alone serves static snapshots and cannot run these APIs or authenticated moderation.

No `.dev.vars`, tokens, local databases, `node_modules` or generated build output belongs in Git.

When shared server requests receive TfL HTTP 429, the API backs off and the client tries the same public official feed directly with CORS. The interface labels its transport and retrieval time. `TFL_APP_KEY` can be configured server-side for a dedicated subscription; never put it in client code.
