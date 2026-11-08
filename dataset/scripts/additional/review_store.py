"""Local administrative storage and review CLI. This is not a hosted or authenticated API."""
import argparse
import csv
import datetime as dt
import json
from pathlib import Path
import sqlite3
from urllib.parse import urlparse
import uuid
from common import digest, write_json

def now():return dt.datetime.now(dt.timezone.utc).isoformat()

def connect(path):
    path=Path(path);path.parent.mkdir(parents=True,exist_ok=True)
    db=sqlite3.connect(path);db.row_factory=sqlite3.Row
    db.executescript((Path(__file__).parents[2]/'maintenance/schema.sql').read_text())
    return db

def import_data(db, places_dir, claims_csv=None, duplicates_csv=None):
    with db:
        for file in sorted(Path(places_dir).glob('*.geojson')):
            for feature in json.loads(file.read_text())['features']:
                p=feature['properties']
                db.execute('INSERT INTO places VALUES (?,?) ON CONFLICT(place_id) DO UPDATE SET name_en=excluded.name_en',(p['id'],p['name_en']))
        if claims_csv:
            with open(claims_csv,encoding='utf-8-sig',newline='') as file:
                for row in csv.DictReader(file):
                    body=json.dumps(row,sort_keys=True)
                    old=db.execute('SELECT payload_json FROM source_claims WHERE claim_id=? AND source_snapshot_at=?',(row['claim_id'],row['source_snapshot_at'])).fetchone()
                    if old and old[0]!=body:raise ValueError('Existing source claim changed within the same snapshot')
                    db.execute('INSERT OR IGNORE INTO source_claims VALUES (?,?,?,?)',(row['claim_id'],row['source_snapshot_at'],row['place_id'] or None,body))
        if duplicates_csv:
            with open(duplicates_csv,encoding='utf-8-sig',newline='') as file:
                for row in csv.DictReader(file):
                    pair=sorted([row['left_id'],row['right_id']]);cid=digest('|'.join(pair))
                    db.execute('INSERT OR IGNORE INTO duplicate_candidates VALUES (?,?,?,?)',(cid,*pair,float(row['distance_metres'])))

def submit(db, payload):
    required=['place_id','attribute','value','scope','observed_at','evidence_url','notes','contributor_id']
    if any(not isinstance(payload.get(k),str) for k in required):raise ValueError('All observation fields must be strings')
    if any(not payload[k].strip() for k in required if k!='notes'):raise ValueError('Missing required observation field')
    if len(payload['notes'])>2000:raise ValueError('Notes must be at most 2000 characters')
    # A date is accepted as day-level evidence; a timestamp must include its timezone.
    observed=dt.datetime.fromisoformat(payload['observed_at'].replace('Z','+00:00'))
    if len(payload['observed_at'])==10:observed=observed.replace(tzinfo=dt.timezone.utc)
    if observed.tzinfo is None:raise ValueError('Observation timestamp needs a timezone')
    if observed>dt.datetime.now(dt.timezone.utc):raise ValueError('Observation date cannot be in the future')
    url=urlparse(payload['evidence_url'])
    if url.scheme not in {'http','https'} or not url.netloc:raise ValueError('An evidence URL is required')
    oid=str(uuid.uuid4())
    with db:db.execute('INSERT INTO observations VALUES (?,?,?,?,?,?,?,?,?,?)',(oid,*[payload[k].strip() for k in required],now()))
    return oid

def review(db, oid, reviewer, decision, reason):
    if not reviewer.strip() or not reason.strip():raise ValueError('Reviewer and reason are required')
    with db:db.execute('INSERT INTO observation_reviews(observation_id,decision,reviewer_id,reason,reviewed_at) VALUES (?,?,?,?,?)',(oid,decision,reviewer.strip(),reason.strip(),now()))

def export_public(db,path):
    columns='observation_id,place_id,attribute,value,scope,observed_at,evidence_url,notes,reviewed_at'
    rows=[dict(row) for row in db.execute('SELECT '+columns+' FROM approved_observations ORDER BY observed_at,observation_id')]
    write_json(path,{'exported_at':now(),'records':rows,'policy':'Latest review must be approved. Conflicting observations remain separate and dated; do not flatten them to a single venue score.'})
    return rows

def status(db):
    tables=['places','source_claims','observations','observation_reviews','approved_observations','duplicate_candidates','duplicate_reviews']
    return {t:db.execute('SELECT COUNT(*) FROM '+t).fetchone()[0] for t in tables}

if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--db',type=Path,required=True)
    commands=p.add_subparsers(dest='command',required=True)
    c=commands.add_parser('import');c.add_argument('--places',type=Path,required=True);c.add_argument('--claims',type=Path);c.add_argument('--duplicates',type=Path)
    c=commands.add_parser('submit');c.add_argument('json_file',type=Path)
    c=commands.add_parser('review');c.add_argument('observation_id');c.add_argument('--reviewer',required=True);c.add_argument('--decision',choices=['approved','rejected','needs_changes'],required=True);c.add_argument('--reason',required=True)
    c=commands.add_parser('review-duplicate');c.add_argument('candidate_id');c.add_argument('--reviewer',required=True);c.add_argument('--decision',choices=['same_place','distinct','uncertain'],required=True);c.add_argument('--reason',required=True)
    c=commands.add_parser('export');c.add_argument('json_file',type=Path)
    commands.add_parser('status')
    c=commands.add_parser('duplicate-queue')
    a=p.parse_args();db=connect(a.db)
    if a.command=='import':import_data(db,a.places,a.claims,a.duplicates)
    elif a.command=='submit':print(submit(db,json.loads(a.json_file.read_text())))
    elif a.command=='review':review(db,a.observation_id,a.reviewer,a.decision,a.reason)
    elif a.command=='review-duplicate':
        if not a.reviewer.strip() or not a.reason.strip():raise ValueError('Reviewer and reason are required')
        with db:db.execute('INSERT INTO duplicate_reviews(candidate_id,decision,reviewer_id,reason,reviewed_at) VALUES (?,?,?,?,?)',(a.candidate_id,a.decision,a.reviewer.strip(),a.reason.strip(),now()))
    elif a.command=='export':export_public(db,a.json_file)
    elif a.command=='duplicate-queue':
        rows=[dict(r) for r in db.execute('SELECT * FROM duplicate_candidates c WHERE NOT EXISTS (SELECT 1 FROM duplicate_reviews r WHERE r.candidate_id=c.candidate_id) ORDER BY distance_m')]
        print(json.dumps(rows,indent=2))
    print(json.dumps(status(db),indent=2));db.close()
