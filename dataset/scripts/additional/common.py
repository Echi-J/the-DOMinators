import csv
import hashlib
import json
from pathlib import Path


def digest(value):
    return hashlib.sha256(value.encode()).hexdigest()[:16]


def write_json(path, value):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, separators=(',', ':')) + '\n', encoding='utf-8')


def write_csv(path, rows, fields=None):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    fields = fields or list(dict.fromkeys(k for row in rows for k in row))
    if not fields:
        raise ValueError('CSV needs explicit columns when there are no records')
    with path.open('w', newline='', encoding='utf-8') as file:
        writer = csv.DictWriter(file, fieldnames=fields)
        writer.writeheader()
        for row in rows:
            writer.writerow({k: json.dumps(v, ensure_ascii=False, separators=(',', ':')) if isinstance(v, (dict, list)) else v for k, v in row.items()})


def borough_lookup(path):
    from shapely.geometry import shape, Point
    features = json.loads(Path(path).read_text())['features']
    areas = [(shape(f['geometry']), f['properties']) for f in features]
    def lookup(lon, lat):
        if lon is None or lat is None:
            return {'borough_code': '', 'borough_name': '', 'within_london': None}
        point = Point(lon, lat)
        matches = [p for g, p in areas if g.covers(point)]
        if len(matches) == 1:
            return {**matches[0], 'within_london': True}
        return {'borough_code': '', 'borough_name': '', 'within_london': bool(matches)}
    return lookup
