"""Download a Geofabrik Greater London PBF with checksum and snapshot metadata."""
import argparse
import datetime as dt
import hashlib
import json
from pathlib import Path
import subprocess
import osmium

def fetch(url,folder):
    if not url.startswith('https://download.geofabrik.de/europe/united-kingdom/england/greater-london-') or not url.endswith('.osm.pbf'):
        raise ValueError('Expected a Geofabrik Greater London PBF URL')
    folder.mkdir(parents=True,exist_ok=True)
    target=folder/url.rsplit('/',1)[1];temporary=target.with_suffix(target.suffix+'.part')
    subprocess.run(['curl','--fail','--silent','--show-error','--location','--retry','2','--max-time','180','-o',str(temporary),url],check=True)
    checksum=subprocess.run(['curl','--fail','--silent','--show-error','--location','--max-time','40',url+'.md5'],check=True,capture_output=True,text=True).stdout.split()[0]
    content=temporary.read_bytes()
    if hashlib.md5(content).hexdigest()!=checksum:raise ValueError('Geofabrik checksum mismatch; do not use this download')
    temporary.replace(target)
    reader=osmium.io.Reader(str(target));header=reader.header();snapshot=header.get('osmosis_replication_timestamp');reader.close()
    if not snapshot:raise ValueError('PBF has no replication timestamp')
    meta={'source_url':url,'retrieved_at':dt.datetime.now(dt.timezone.utc).isoformat(),'source_snapshot_at':snapshot,'sha256':hashlib.sha256(content).hexdigest(),'md5':checksum,'bytes':len(content),'license_url':'https://www.openstreetmap.org/copyright'}
    target.with_suffix(target.suffix+'.metadata.json').write_text(json.dumps(meta,indent=2)+'\n')
    print(json.dumps(meta,indent=2))

if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--url',default='https://download.geofabrik.de/europe/united-kingdom/england/greater-london-latest.osm.pbf')
    parser.add_argument('--cache-dir',type=Path,required=True)
    a=parser.parse_args();fetch(a.url,a.cache_dir)
