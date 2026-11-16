# Raspberry Pi deployment and version verification

**This is a guide for checking or reproducing the source; it does not assert that the Pi currently runs this exact revision.** Do not overwrite the live deployment solely to align folder names for submission.

## Compare versions without changing the Pi

On the Pi, find the process manager's actual working directory and entry command (for example systemd `WorkingDirectory` and `ExecStart`, or the running Node process arguments). Confirm whether the running server uses `back-end/server.js` or a different path. Compare file hashes (`sha256sum`) for representative source files on the Pi with this archive, such as the server entrypoint, API routes, map controller and issue-report module. Differences may be legitimate template-path adaptations; document them precisely. Compare actual API behavior via read-only endpoints. Never copy `.env` or database backups into a submission.

## Clean installation on a separate machine/test database

1. Install Node >=22.13 and MySQL. Create a **new empty** `access_london` test database and least-privileged credentials; the initialization process requires schema-creation permissions.
2. In `Website/`, run `npm ci`. Copy `.env.example` to `.env` and populate **local values only**.
3. For that newly created disposable database, run `npm run db:setup` and then `npm run db:migrate`.
4. Start with `npm start`. Check `/api/health`, the map and all key UI flows. Routing requires a suitable ORS API key; moderation requires a separate strong REVIEW_KEY.
5. Run `npm run test:structure`. Run integration tests only against the disposable database because they insert and delete rows.

## Live Pi precautions

- Do **not** run `db:setup` on the live MySQL database; `schema.sql` drops core tables/views. Do not reset, reimport or replace Pi data during a source-only submission.
- Back up live systems using a private secure operational process, not the source submission. Do not put credentials, user-uploaded pictures, database exports or logs in Git.
- The GitHub final commit and Moodle archive should contain the same documented source version. The actual Pi deployment should be reconciled through hashes/commit identity and clearly described if different.
