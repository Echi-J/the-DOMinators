# Access London client

`index.html` opens the website. `map.html` contains Places, Stations and Facilities in one workspace. Runtime files are in `data/`; client controllers are in `js/`.

Facilities includes OSM evidence and the cleaned Toilet Map London snapshot. Source filters keep overlapping records identifiable. `about.html` and `how-to-use.html` explain coverage, source dates and interpretation.

The hosted application supplies `/api/tfl/lifts`, `/api/observations`, `/api/reviews` and `/api/session`. Shared observations use D1 storage and require authenticated submissions and review. Quick Local survey answers and bookmarks stay on the current device.

Run the repository's backend for API functionality. A static HTTP server can show snapshot data, but does not supply authentication, shared storage or the live proxy. No official Changing Places registry or field-survey results have been imported.
