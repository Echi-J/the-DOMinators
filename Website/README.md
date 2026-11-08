# Access London

- `front-end/`: the supplied website, now wired to real data in one Places / Stations / Facilities workspace.
- `data/`: runtime snapshots read by the client; keep borough filenames and stable IDs.
- `back-end/`: Worker application, API routes, D1 schema, validation and build scripts.

The public deployment is https://access-london-data-20261103.dbibd.chatgpt.site/ . It is separate from GitHub Pages hosting, but uses this implementation and these data sources.

To run the complete application, follow `back-end/README.md`. To preview snapshots only, serve `Website/` over HTTP and open `front-end/index.html`; static hosting does not provide the API routes.

Toilet Map adds 1,921 London source records. OSM retains its own 74,500-object coverage denominator. Facility sources may overlap; nearby candidates are not merged. The official Changing Places registry is not imported. `dataset/surveys/pilot_queue.json` is a 100-place task queue with no collected findings.

Data refresh scripts are in `../dataset/scripts/additional/`. Source years, download dates, unknown values and attribution remain in the runtime metadata.
