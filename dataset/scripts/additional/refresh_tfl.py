"""Fetch a dated TfL snapshot and validate it before publishing output files."""
import argparse
from concurrent.futures import ThreadPoolExecutor
import datetime as dt
import hashlib
import json
import os
from pathlib import Path
import shutil
import tempfile
import time
from urllib.parse import urlencode, urlsplit, urlunsplit, parse_qsl
from urllib.request import Request, urlopen
import xml.etree.ElementTree as ET
from build_tfl import clean, normal
from common import write_json

MODES='tube,dlr,overground,elizabeth-line,tram,cable-car,river-bus'

def download(url,raw,name):
    parts=urlsplit(url)
    request_url=url
    if parts.hostname=='api.tfl.gov.uk' and os.environ.get('TFL_APP_KEY'):
        query=parse_qsl(parts.query)+[('app_key',os.environ['TFL_APP_KEY'])]
        request_url=urlunsplit(parts._replace(query=urlencode(query)))
    for attempt in range(3):
        try:
            with urlopen(Request(request_url,headers={'User-Agent':'AccessLondonData/1.0'}),timeout=45) as response:
                data=response.read(30_000_001)
                if len(data)>30_000_000:raise ValueError('Unexpectedly large source response')
                headers=str(response.headers)
            break
        except Exception:
            if attempt==2:raise RuntimeError('Failed to fetch '+url) from None
            time.sleep(attempt+1)
    (raw/name).write_bytes(data);(raw/(name+'.headers')).write_text(headers)
    return {'file':name,'url':url,'status':'200','bytes':len(data),'sha256':hashlib.sha256(data).hexdigest(),'retrieved_at':dt.datetime.now(dt.timezone.utc).isoformat()}

def publish(stage,output):
    # All transformations must finish successfully before the first destination write.
    # Each replacement is atomic; this does not implement a cross-file release transaction.
    for source in sorted(stage.rglob('*')):
        if source.is_file():
            dest=output/source.relative_to(stage);dest.parent.mkdir(parents=True,exist_ok=True)
            temp=dest.with_name(dest.name+'.new');shutil.copyfile(source,temp);os.replace(temp,dest)

def refresh(output,cache,boundaries,kind):
    stamp=dt.datetime.now(dt.timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')
    raw=cache/stamp;raw.mkdir(parents=True,exist_ok=False)
    if kind=='lifts':
        previous=json.loads((output/'dataset/tfl/metadata.json').read_text())['sources']
        manifest=[]
        # Reuse the retained static snapshot and coordinate sources; only the lift feed changes.
        # Find each prior input by its exact checksum in the private cache.
        for entry in previous:
            if entry['file']=='lift_disruptions.json':continue
            found=None
            for candidate in cache.rglob(entry['file']):
                if raw in candidate.parents:continue
                if hashlib.sha256(candidate.read_bytes()).hexdigest()==entry['sha256']:found=candidate;break
            if found is None:raise ValueError('Static source not in cache; run --kind full first')
            try:os.link(found,raw/entry['file'])
            except OSError:shutil.copyfile(found,raw/entry['file'])
            header=found.with_name(found.name+'.headers')
            if header.exists():shutil.copyfile(header,raw/header.name)
            manifest.append(entry)
        manifest.append(download('https://api.tfl.gov.uk/Disruptions/Lifts/',raw,'lift_disruptions.json'))
    else:
        urls=[('https://content.tfl.gov.uk/lrad-v2.xml','lrad-v2.xml'),('https://content.tfl.gov.uk/lrad-v2.xsd','lrad-v2.xsd'),('https://api.tfl.gov.uk/Disruptions/Lifts/','lift_disruptions.json')]
        with ThreadPoolExecutor(max_workers=3) as pool:manifest=list(pool.map(lambda pair:download(pair[0],raw,pair[1]),urls))
        page=1;seen=set()
        while True:
            name=f'stop_points_page_{page}.json'
            manifest.append(download(f'https://api.tfl.gov.uk/StopPoint/Mode/{MODES}?page={page}',raw,name))
            payload=json.loads((raw/name).read_text());rows=payload['stopPoints']
            seen.update(r['id'] for r in rows)
            if len(seen)>=payload['total']:break
            if not rows or page>=30:raise ValueError('Incomplete StopPoint pagination')
            page+=1
        names=set()
        for file in raw.glob('stop_points_page_*.json'):
            names.update(normal(s['commonName']) for s in json.loads(file.read_text())['stopPoints'] if s.get('stopType') in {'NaptanMetroStation','NaptanRailStation','TransportInterchange'})
        missing=sorted({s.findtext('StationName') for s in ET.parse(raw/'lrad-v2.xml').getroot() if normal(s.findtext('StationName')) not in names})
        def fetch_name(name):
            url='https://api.tfl.gov.uk/StopPoint/Search?'+urlencode({'query':name,'modes':'national-rail,elizabeth-line,cable-car','maxResults':50,'includeHubs':'true'})
            return download(url,raw,'stop_search_'+hashlib.sha256(name.encode()).hexdigest()[:12]+'.json')
        with ThreadPoolExecutor(max_workers=4) as pool:manifest.extend(pool.map(fetch_name,missing))
    write_json(raw/'download_manifest.json',manifest)
    with tempfile.TemporaryDirectory(prefix='access-london-tfl-') as temporary:
        stage=Path(temporary)
        clean(raw,stage,boundaries)
        new_meta=json.loads((stage/'dataset/tfl/metadata.json').read_text())
        old_file=output/'dataset/tfl/metadata.json'
        if old_file.exists():
            old_count=json.loads(old_file.read_text())['counts']['station_records']
            if new_meta['counts']['station_records']<old_count*0.9:raise ValueError('Station count fell by over 10%; review before publishing')
        catalog_file=output/'Website/data/catalog.json'
        if catalog_file.exists():
            catalog=json.loads(catalog_file.read_text());counts=new_meta['counts']
            for entry in catalog.get('additional_datasets',[]):
                if entry['id']=='tfl_station_access':
                    entry.update({'records':counts['station_records'],'matched_coordinates':counts['station_coordinates_matched'],
                                  'london_coordinates':counts['station_coordinates_within_london'],
                                  'static_source_http_modified_at':counts['lrad_http_last_modified_at'],
                                  'snapshot_retrieved_at':next(s['retrieved_at'] for s in new_meta['sources'] if s['file']=='lrad-v2.xml')})
            catalog['updated_at']=dt.datetime.now(dt.timezone.utc).isoformat()
            write_json(stage/'Website/data/catalog.json',catalog)
        publish(stage,output)
    print('Published validated snapshot from '+str(raw))

if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output-root',type=Path,required=True);parser.add_argument('--cache-dir',type=Path,required=True);parser.add_argument('--boundaries',type=Path,required=True);parser.add_argument('--kind',choices=['full','lifts'],default='full')
    a=parser.parse_args();refresh(a.output_root,a.cache_dir,a.boundaries,a.kind)
