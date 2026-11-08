"""Select an unobserved pilot queue. This creates tasks, not survey findings."""
import argparse
from collections import Counter
import datetime as dt
import json
from pathlib import Path


def build(output_root, borough, count):
    data = output_root/'Website/data'
    source = json.loads((data/'places'/f'{borough}.geojson').read_text())['features']
    catalog = json.loads((data/'catalog.json').read_text())
    # Target missing wheelchair information; rotate categories so parks, culture
    # and toilets are not lost among the larger food/shop populations.
    categories = ['park', 'toilet', 'museum', 'food', 'shop']
    buckets = {category: sorted([f['properties'] for f in source
                if f['properties']['ui_category'] == category
                and f['properties']['wheelchair_access'] == 'unknown'],
                key=lambda p: (p['name_en'].casefold(), p['id'])) for category in categories}
    chosen = []
    while len(chosen) < count and any(buckets.values()):
        for category in categories:
            if buckets[category] and len(chosen) < count:
                chosen.append(buckets[category].pop(0))
    tasks = [{'place_id': p['id'], 'name_en': p['name_en'], 'borough_code': p['borough_code'],
              'category': p['ui_category'], 'longitude': p['longitude'], 'latitude': p['latitude'],
              'source_wheelchair_status': p['wheelchair_access'], 'task_status': 'not_started',
              'observed_at': None, 'reviewed_at': None, 'findings': [],
              'submission_path': 'observations.html?borough='+borough+'&place='+p['id']}
             for p in chosen]
    target = output_root/'dataset/surveys/pilot_queue.json'
    target.parent.mkdir(parents=True, exist_ok=True)
    result = {'type': 'survey_task_plan', 'created_at': dt.datetime.now(dt.timezone.utc).isoformat(),
              'source_snapshot_at': catalog['osm_snapshot_at'], 'borough_code': borough,
              'planned_places': len(tasks), 'completed_observations': 0,
              'selection': 'Unknown OSM wheelchair status; category rotation; stable alphabetical order.',
              'required_checks': ['Specific entrance and steps', 'Ramp availability and restrictions',
                  'Lift presence, served floors and current operation', 'Accessible toilet and access restrictions'],
              'submission_rule': 'Record an actual date, exact scope and supporting evidence. Submit through Contribute; another reviewer must approve. Do not infer official Changing Places registration.',
              'tasks': tasks}
    target.write_text(json.dumps(result, ensure_ascii=False, indent=2)+'\n')
    print(json.dumps({'planned_places': len(tasks), 'completed_observations': 0,
                      'categories': dict(Counter(t['category'] for t in tasks))}))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output-root', type=Path, required=True)
    parser.add_argument('--borough', default='E09000004')
    parser.add_argument('--count', type=int, default=100)
    args = parser.parse_args()
    if not 1 <= args.count <= 500:
        parser.error('Choose 1–500 planned places')
    build(args.output_root, args.borough, args.count)
