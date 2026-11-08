"""Build a London Toilet Map snapshot without merging independent source claims.

Requires Shapely. Input is the provider's unmodified JSON export and a download
manifest containing its SHA-256, URL and retrieval time. No registry status or
survey date is inferred from names, update times or ordinary toilet flags.
"""
import argparse
from collections import Counter
import datetime as dt
import hashlib
import json
import math
from pathlib import Path
import re

from shapely.geometry import Point, box, shape
from shapely.strtree import STRtree

PAGE = 'https://www.toiletmap.org.uk/dataset'
ATTRIBUTION = 'Contains data from the Toilet Map © 2025 – CC BY 4.0'
FLAGS = ['accessible', 'radar', 'no_payment', 'baby_change', 'attended',
         'automatic', 'men', 'women', 'all_gender', 'urinal_only', 'children']


def write(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, separators=(',', ':')) + '\n')


def flag(value):
    # JSON null and absent fields must not become false.
    return 'yes' if value is True else 'no' if value is False else 'unknown'


def distance(a, b):
    lon1, lat1, lon2, lat2 = map(math.radians, [*a, *b])
    h = math.sin((lat2-lat1)/2)**2 + math.cos(lat1)*math.cos(lat2)*math.sin((lon2-lon1)/2)**2
    return 6371000 * 2 * math.asin(min(1, math.sqrt(h)))


def opening_hours(value):
    # Empty daily arrays are retained as unspecified, not relabelled "closed".
    if value is None:
        return None
    if not isinstance(value, list) or len(value) != 7:
        return None
    result = []
    for entry in value:
        if entry == []:
            result.append(None)
        elif isinstance(entry, list) and len(entry) == 2 and all(
            isinstance(t, str) and re.fullmatch(r'(?:[01]\d|2[0-3]):[0-5]\d|24:00', t) for t in entry
        ):
            result.append(entry)
        else:
            return None
    return result


def osm_toilets(web):
    """Collect source objects once by stable OSM ID for candidate review only."""
    records = {}
    for path in sorted((web/'data/places').glob('*.geojson')):
        for feature in json.loads(path.read_text())['features']:
            p = feature['properties']
            if p['ui_category'] == 'toilet':
                records[p['id']] = {'id': p['id'], 'name': p['name_en'],
                                    'coordinates': [p['longitude'], p['latitude']]}
    evidence = web/'data/venue_evidence/source_features.geojson'
    if evidence.exists():
        for feature in json.loads(evidence.read_text())['features']:
            p = feature['properties']
            if 'accessible_toilet_claim' in p['feature_kinds']:
                records.setdefault(p['feature_id'], {'id': p['feature_id'],
                    'name': p['name_en'], 'coordinates': [p['longitude'], p['latitude']]})
    return list(records.values())


def clean(raw_json, manifest_file, output_root, boundaries, reference_web=None):
    content = raw_json.read_bytes()
    manifest = json.loads(manifest_file.read_text())
    checksum = hashlib.sha256(content).hexdigest()
    if checksum != manifest['sha256']:
        raise ValueError('Raw source checksum does not match the download manifest')
    rows = json.loads(content)
    if not isinstance(rows, list) or not rows:
        raise ValueError('Expected a non-empty Toilet Map JSON array')
    source_ids = [r.get('id') for r in rows]
    if any(not isinstance(i, str) or not i for i in source_ids) or len(set(source_ids)) != len(rows):
        raise ValueError('Missing or duplicate source IDs require review before publishing')
    boroughs = json.loads(boundaries.read_text())['features']
    areas = [shape(f['geometry']) for f in boroughs]
    if len(areas) != 33 or not all(g.is_valid for g in areas):
        raise ValueError('Expected 33 valid borough boundaries')
    area_tree = STRtree(areas)
    web = output_root/'Website'
    reference_web = reference_web or web
    candidates = osm_toilets(reference_web)
    candidate_tree = STRtree([Point(*r['coordinates']) for r in candidates])
    excluded, issues, features, review = Counter(), [], [], []
    snapshot = re.search(r'toilets-(\d{4}-\d\d-\d\d)T', manifest['url'])
    snapshot_date = snapshot.group(1) if snapshot else None
    for row in rows:
        sid = 'toiletmap:' + row['id']
        if row.get('active') is not True:
            excluded['inactive_or_active_unknown'] += 1
            continue
        loc = row.get('location') or {}
        coords = loc.get('coordinates')
        if (loc.get('type') != 'Point' or not isinstance(coords, list) or len(coords) != 2
            or any(type(v) not in (int, float) or not math.isfinite(v) for v in coords)
            or not -180 <= coords[0] <= 180 or not -90 <= coords[1] <= 90):
            excluded['invalid_geometry'] += 1
            continue
        point = Point(*coords)
        matches = [int(i) for i in area_tree.query(point) if areas[int(i)].covers(point)]
        if len(matches) != 1:
            excluded['outside_london' if not matches else 'ambiguous_borough_boundary'] += 1
            continue
        borough = boroughs[matches[0]]['properties']
        name_raw = row.get('name') if isinstance(row.get('name'), str) else None
        name = (name_raw or '').strip()
        if not name or re.search(r'[\u3400-\u9fff]', name):
            name = 'Unnamed toilet · Toilet Map'
        hours = opening_hours(row.get('opening_times'))
        if row.get('opening_times') is not None and hours is None:
            issues.append({'source_id': sid, 'field': 'opening_times', 'issue': 'unexpected_shape_retained_in_raw'})
        for key in FLAGS:
            if row.get(key) is not None and type(row[key]) is not bool:
                issues.append({'source_id': sid, 'field': key, 'issue': 'unexpected_value_normalized_to_unknown'})
        nearby = []
        dx = 20/(111320*math.cos(math.radians(coords[1])))
        dy = 20/110500
        for i in candidate_tree.query(box(coords[0]-dx, coords[1]-dy, coords[0]+dx, coords[1]+dy)):
            candidate = candidates[int(i)]
            metres = distance(coords, candidate['coordinates'])
            if metres <= 20:
                nearby.append({'source_id': candidate['id'], 'name': candidate['name'],
                               'distance_m': round(metres, 1), 'review_status': 'unreviewed'})
        nearby.sort(key=lambda r: (r['distance_m'], r['source_id']))
        if nearby:
            review.append({'source_id': sid, 'candidates': nearby, 'decision': None,
                           'policy': 'Proximity is not identity. No cross-source merge applied.'})
        properties = {
            'feature_id': sid, 'source_provider': 'toiletmap', 'name_en': name,
            'name_raw': name_raw, 'longitude': coords[0], 'latitude': coords[1],
            'borough_code': borough['borough_code'], 'borough_name': borough['borough_name'],
            'within_london': True, 'feature_kinds': ['toiletmap_toilet'],
            'source_url': PAGE, 'source_snapshot_date': snapshot_date,
            'retrieved_at': manifest['retrieved_at'],
            'source_updated_at': row.get('updated_at'),
            'source_verified_at': row.get('verified_at'),
            'survey_observed_at': None, 'official_changing_places_registration': 'not_verified',
            'source_claims': {key: flag(row.get(key)) for key in FLAGS},
            'opening_times_source': row.get('opening_times'), 'opening_times_normalized': hours,
            'notes_source': row.get('notes'), 'payment_details_source': row.get('payment_details'),
            'source_area_name': (row.get('areas') or {}).get('name'),
            'candidate_osm_matches': nearby[:3], 'matched_place_id': None,
        }
        features.append({'type': 'Feature', 'id': sid,
                         'geometry': {'type': 'Point', 'coordinates': coords}, 'properties': properties})
    features.sort(key=lambda f: f['id'])
    if not features:
        raise ValueError('No London facilities survived validation')
    props = [f['properties'] for f in features]
    coordinate_groups = Counter(tuple(f['geometry']['coordinates']) for f in features)
    metadata = {
        'schema_version': 'access-london-toiletmap-1',
        'built_at': dt.datetime.now(dt.timezone.utc).isoformat(),
        'source_page': PAGE, 'source_export_url': manifest['url'],
        'source_snapshot_date': snapshot_date, 'retrieved_at': manifest['retrieved_at'],
        'source_sha256': checksum, 'license': 'CC-BY-4.0',
        'license_url': 'https://creativecommons.org/licenses/by/4.0/', 'attribution': ATTRIBUTION,
        'changes': 'London boundary filter; active/geometry checks; stable IDs; explicit unknowns; source fields retained; no cross-source merge.',
        'counts': {'source_records': len(rows), 'london_records': len(features),
            'excluded': dict(excluded), 'boroughs_with_records': len({p['borough_code'] for p in props}),
            'source_verified_at_present': sum(bool(p['source_verified_at']) for p in props),
            'opening_times_present': sum(p['opening_times_normalized'] is not None and any(p['opening_times_normalized']) for p in props),
            'records_with_osm_candidates': len(review),
            'coincident_coordinate_groups': sum(v > 1 for v in coordinate_groups.values()),
            'field_issues': len(issues)},
        'claim_counts': {key: dict(Counter(p['source_claims'][key] for p in props)) for key in FLAGS},
        'borough_counts': dict(sorted(Counter(p['borough_code'] for p in props).items())),
        'limitations': ['Source claims are not independent field verification.',
            'Source verified/updated timestamps are not project survey dates.',
            'Missing daily hours are unspecified, not confirmed closed.',
            'The export does not document weekday ordering; the interface shows time ranges without assigning weekdays.',
            'Overlapping OSM and Toilet Map records remain separate; counts are source records, not unique toilets.',
            'Ordinary accessibility flags do not establish Changing Places registration.'],
    }
    if len(features) + sum(excluded.values()) != len(rows):
        raise AssertionError('Source record reconciliation failed')
    write(web/'data/toiletmap/london_toilets.geojson', {'type': 'FeatureCollection', 'features': features})
    write(web/'data/toiletmap/metadata.json', metadata)
    write(output_root/'dataset/toiletmap/match_review.json', review)
    write(output_root/'dataset/toiletmap/field_issues.json', issues)
    write(output_root/'dataset/toiletmap/download_manifest.json', manifest)
    catalog_file = reference_web/'data/catalog.json'
    if catalog_file.exists():
        catalog = json.loads(catalog_file.read_text())
        entry = {'id': 'toiletmap_london', 'records': len(features),
                 'source_snapshot_date': snapshot_date, 'license': 'CC-BY-4.0',
                 'url': 'toiletmap/london_toilets.geojson', 'metadata_url': 'toiletmap/metadata.json',
                 'records_are_unique_toilets': False, 'cross_source_merges_applied': 0}
        catalog['additional_datasets'] = [r for r in catalog.get('additional_datasets', []) if r['id'] != entry['id']] + [entry]
        catalog['updated_at'] = metadata['built_at']
        write(web/'data/catalog.json', catalog)
    print(json.dumps({'counts': metadata['counts'], 'claim_counts': metadata['claim_counts']}, indent=2))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--raw-json', type=Path, required=True)
    parser.add_argument('--manifest', type=Path, required=True)
    parser.add_argument('--output-root', type=Path, required=True)
    parser.add_argument('--boundaries', type=Path, required=True)
    args = parser.parse_args()
    clean(args.raw_json, args.manifest, args.output_root, args.boundaries)
