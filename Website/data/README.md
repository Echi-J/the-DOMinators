# Runtime data

The website reads these versioned snapshots over HTTP. `catalog.json` lists sources and paths; `boroughs.json` links each of the 33 borough place files. Coordinates use WGS84 longitude/latitude.

- `places/`: 74,500 OSM objects, snapshot 18 October 2026.
- `borough_boundaries.geojson` and `boroughs.json`: administrative boundaries and ONS/IMD context.
- `tfl/`: static station facilities and coordinates, re-fetched 8 November 2026. Live lift reports come separately from `/api/tfl/lifts`; a saved JSON snapshot is not a live service.
- `venue_evidence/`: 4,514 OSM source objects, snapshot 3 November 2026; `operator_statements.json` adds a two-venue pilot of nine operator claims checked on 8 November 2026. No field survey is implied.
- `toiletmap/`: 1,921 London toilet source records from the 8 November 2026 export, plus provenance and coverage metadata.

Use `name_en` for display; retain `name_raw` for traceability. Unknown values remain unknown. Overlapping Toilet Map and OSM records have not been merged. Additional sources do not change the OSM coverage denominator. Shared, approved observations come from `/api/observations`; local survey notes are separate. No official Changing Places registry or completed project field surveys are included.

Provider notices and reuse terms are recorded in `attribution.json` and each source's metadata. OSM: © OpenStreetMap contributors, ODbL. Toilet Map: Contains data from the Toilet Map © 2025 – CC BY 4.0; London filter and normalization applied.
