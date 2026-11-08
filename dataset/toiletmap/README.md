# Toilet Map London snapshot

Source: https://www.toiletmap.org.uk/dataset · CC BY 4.0.

The website reads `Website/data/toiletmap/london_toilets.geojson` and `metadata.json` in Facilities. This release retains 1,921 active source records inside the 33 London boundaries from the 8 November 2026 export.

`accessible`, `radar`, payment and other flags remain source claims. Null becomes `unknown`; `false` remains the source's negative answer. Update and verification timestamps are not Access London survey dates. The export does not document weekday order, so the interface displays recorded time ranges without assigning weekdays. Empty daily schedules remain unspecified.

476 records have OSM toilet candidates within 20 metres. `match_review.json` contains these candidates, not approved matches. No cross-source merges or OSM tag replacements were applied. Twelve groups of coincident Toilet Map coordinates also remain separate source records.

Refresh from the source repository root, using Python with the dependencies in `dataset/scripts/additional/requirements.txt`:

```sh
python dataset/scripts/additional/refresh_toiletmap.py --output-root . --cache-dir /tmp/access-london-toiletmap --boundaries Website/data/borough_boundaries.geojson
```

The refresher saves raw inputs and their checksum outside the repository, validates in staging, and stops if the London count falls by more than 10%. Review the Git diff, record counts, candidate matches and field coverage before committing the new snapshot. It is a manual refresh command, not an automatic daily update.

Attribution: Contains data from the Toilet Map © 2025 – CC BY 4.0. Changes: London filtering, field normalization, source IDs and explicit unknowns. These records do not establish official Changing Places registration.
