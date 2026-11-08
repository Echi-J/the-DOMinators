"""Prepare an authorized official registry export and propose OSM matches for review."""
import argparse
import csv
import datetime as dt
import json
import math
from pathlib import Path
from urllib.parse import urlparse
from common import borough_lookup, write_csv, write_json

def distance(a,b):
    lat1,lat2=map(math.radians,[a['latitude'],b['latitude']]);dlat=lat2-lat1;dlon=math.radians(b['longitude']-a['longitude'])
    return 6371000*2*math.asin(min(1,math.sqrt(math.sin(dlat/2)**2+math.cos(lat1)*math.cos(lat2)*math.sin(dlon/2)**2)))

def prepare(registry,permission,candidates,boundaries,output):
    rights=json.loads(permission.read_text())
    for key in ['source_url','permission_reference','attribution','permission_checked_at','source_retrieved_at']:
        if not isinstance(rights.get(key),str) or not rights[key].strip():raise ValueError('Missing rights metadata: '+key)
    if rights.get('public_website_reuse_allowed') is not True or rights.get('public_github_redistribution_allowed') is not True:
        raise ValueError('Public website and GitHub reuse have not both been confirmed')
    # These fields document the operator's verification; software cannot grant permission.
    lookup=borough_lookup(boundaries);seen=set();rows=[];outside=[]
    with registry.open(encoding='utf-8-sig',newline='') as file:
        reader=csv.DictReader(file)
        required={'registry_id','name','longitude','latitude','registry_url','registration_status'}
        if not required<=set(reader.fieldnames or []):raise ValueError('Missing registry columns: '+','.join(sorted(required)))
        for source in reader:
            rid=source['registry_id'].strip()
            if not rid or rid in seen:raise ValueError('Blank or duplicate registry ID')
            seen.add(rid)
            lon,lat=float(source['longitude']),float(source['latitude'])
            if not (-180<=lon<=180 and -90<=lat<=90):raise ValueError('Invalid coordinates')
            if source['registration_status'] not in {'registered','withdrawn','unknown'}:raise ValueError('Use a documented registration status')
            url=urlparse(source['registry_url'])
            if url.scheme!='https' or not url.netloc:raise ValueError('Registry source URL required')
            area=lookup(lon,lat)
            row={'registry_id':rid,'name':source['name'].strip(),'longitude':lon,'latitude':lat,'registry_url':source['registry_url'],'registration_status':source['registration_status'],**area,'source_retrieved_at':rights['source_retrieved_at']}
            (rows if area['within_london'] else outside).append(row)
    with candidates.open(encoding='utf-8-sig',newline='') as file:
        osm=[{**r,'longitude':float(r['longitude']),'latitude':float(r['latitude'])} for r in csv.DictReader(file)]
    matches=[]
    for row in rows:
        for candidate in osm:
            metres=distance(row,candidate)
            if metres<=100:
                matches.append({'registry_id':row['registry_id'],'candidate_feature_id':candidate['feature_id'],'distance_m':round(metres,2),'name_matches':row['name'].casefold()==candidate['name_raw'].casefold(),'review_status':'pending','match_basis':'within_100m_only_not_verified_same_facility'})
    target=output/'dataset/changing_places'
    write_csv(target/'authorized_registry.csv',rows,list(rows[0]) if rows else ['registry_id','name','longitude','latitude','registry_url','registration_status'])
    write_csv(target/'registry_match_review.csv',matches,['registry_id','candidate_feature_id','distance_m','name_matches','review_status','match_basis'])
    write_json(target/'registry_metadata.json',{'rights':rights,'london_records':len(rows),'excluded_outside_london':len(outside),'pending_match_pairs':len(matches),'processed_at':dt.datetime.now(dt.timezone.utc).isoformat()})
    print(json.dumps({'london_records':len(rows),'pending_matches':len(matches)}))

if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__)
    for name in ['registry','permission','candidates','boundaries','output-root']:p.add_argument('--'+name,type=Path,required=True)
    a=p.parse_args();prepare(a.registry,a.permission,a.candidates,a.boundaries,a.output_root)
