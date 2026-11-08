"""Compare evidence snapshots by OSM object; removal means absent from this extraction."""
import argparse
import json
from pathlib import Path
from common import write_csv

def compare(previous,current,output):
    def read(path):return {f['id']:f for f in json.loads(path.read_text())['features']}
    old,new=read(previous),read(current);rows=[]
    for fid in sorted(old.keys()|new.keys()):
        a,b=old.get(fid),new.get(fid)
        change='added' if a is None else 'removed_from_extract' if b is None else None
        if a and b and (a['properties']['source_tags']!=b['properties']['source_tags'] or a['geometry']!=b['geometry'] or a['properties']['name_raw']!=b['properties']['name_raw']):change='changed'
        if change:
            rows.append({'feature_id':fid,'change':change,'previous_snapshot_at':a['properties']['source_snapshot_at'] if a else None,'current_snapshot_at':b['properties']['source_snapshot_at'] if b else None,'previous_tags':a['properties']['source_tags'] if a else None,'current_tags':b['properties']['source_tags'] if b else None,'review_status':'pending','note':'Source changes do not constitute a field survey or proof of closure.'})
    write_csv(output,rows,['feature_id','change','previous_snapshot_at','current_snapshot_at','previous_tags','current_tags','review_status','note'])
    print(json.dumps({'changed_records':len(rows)}))

if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__)
    for name in ['previous','current','output']:p.add_argument('--'+name,type=Path,required=True)
    a=p.parse_args();compare(a.previous,a.current,a.output)
