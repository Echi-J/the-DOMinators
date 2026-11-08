"""Normalize cached TfL downloads. Preserve LRAD claims without inferring live access."""
import argparse
from collections import Counter, defaultdict
import datetime as dt
from email.utils import parsedate_to_datetime
import json
from pathlib import Path
import re
import unicodedata
import xml.etree.ElementTree as ET
from common import borough_lookup, digest, write_csv, write_json

STATION_TYPES = {'NaptanMetroStation', 'NaptanRailStation', 'TransportInterchange'}
# Name changes/disambiguators checked against the current official StopPoint responses.
# These aliases only supply a station coordinate; they do not update LRAD access claims.
NAME_ALIASES = {
    'Burnham':('Burnham (Berks) Rail Station','elizabeth-line'),
    'Langley':('Langley (Berks) Rail Station','elizabeth-line'),
    'Sutton':('Sutton (London) Rail Station','national-rail'),
    'Emirates Greenwich Peninsula':('Greenwich Peninsula','cable-car'),
    'Emirates Royal Docks':('Royal Docks','cable-car'),
}

def normal(name):
    name = name.casefold().replace('&', 'and')
    name = re.sub(r'\s+(underground station|dlr station|rail station|tram stop|station)$', '', name)
    return ''.join(c for c in unicodedata.normalize('NFKD', name) if c.isalnum())

def tree(node):
    if not len(node):
        return (node.text or '').strip()
    values = defaultdict(list)
    for child in node:
        values[child.tag].append(tree(child))
    return {k: v if len(v)>1 else v[0] for k,v in values.items()}

def flag(value):
    return {'yes':'yes', 'no':'no'}.get((value or '').strip().casefold(), 'unknown')

def load_stops(raw, manifest):
    stops = {}
    sources = {}
    for file in sorted(raw.glob('stop_points_page_*.json')):
        for row in json.loads(file.read_text())['stopPoints']:
            if row.get('stopType') in STATION_TYPES:
                stops[row['id']] = row
                sources[row['id']] = manifest[file.name]
    for file in sorted(raw.glob('stop_search_*.json')):
        for row in json.loads(file.read_text()).get('matches', []):
            if row['id'] not in stops:
                stops[row['id']] = {**row, 'commonName':row['name'], 'stopType':'search_match'}
                sources[row['id']] = manifest[file.name]
    return stops, sources

def match_station(node, stops):
    code = node.findtext('NaptanCode')
    if code:
        return stops.get(code), 'source_naptan' if code in stops else 'unmatched_source_naptan', []
    alias=NAME_ALIASES.get(node.findtext('StationName'))
    if alias:
        matches=[s for s in stops.values() if s['commonName']==alias[0] and alias[1] in s.get('modes',[])]
        if len(matches)==1:return matches[0],'documented_name_alias_and_mode',matches
    candidates = [s for s in stops.values() if normal(s['commonName']) == normal(node.findtext('StationName'))]
    if len(candidates)==1:
        return candidates[0], 'unique_normalized_name', candidates
    hubs = [s for s in candidates if s.get('stopType')=='TransportInterchange']
    if len(hubs)==1:
        return hubs[0], 'unique_normalized_name_hub_coordinate', candidates
    # A single mode-specific station can disambiguate e.g. Bethnal Green.
    line_modes = set()
    for name in node.findall('.//Line/LineName'):
        line_modes.add({'London Overground':'overground', 'Overground':'overground', 'DLR':'dlr', 'Tram':'tram', 'TfL Rail':'elizabeth-line', 'Thameslink':'national-rail', 'Emirates Air Line':'cable-car'}.get(name.text, 'tube'))
    filtered = [s for s in candidates if line_modes and line_modes <= set(s.get('modes', []))]
    if len(filtered)==1:
        return filtered[0], 'unique_normalized_name_and_modes', candidates
    return None, 'ambiguous' if candidates else 'unmatched', candidates

def clean(raw, output, boundaries):
    manifest = {m['file']:m for m in json.loads((raw/'download_manifest.json').read_text()) if m.get('file')}
    for file, m in manifest.items():
        import hashlib
        if (raw/file).exists() and hashlib.sha256((raw/file).read_bytes()).hexdigest()!=m['sha256']:
            raise ValueError('Source checksum mismatch: '+file)
    xml = ET.parse(raw/'lrad-v2.xml').getroot()
    if xml.tag!='Stations' or not len(xml):
        raise ValueError('Unexpected or empty LRAD source')
    from lxml import etree
    schema=etree.XMLSchema(etree.parse(str(raw/'lrad-v2.xsd')))
    xsd_valid=schema.validate(etree.parse(str(raw/'lrad-v2.xml')))
    xsd_report={'valid':xsd_valid,'error_count':len(schema.error_log),'error_type_counts':dict(Counter(e.type_name for e in schema.error_log)),'policy':'Official XSD inconsistencies are reported; explicit record-count, ID, checksum and field checks govern normalization.'}
    headers = (raw/'lrad-v2.xml.headers').read_text() if (raw/'lrad-v2.xml.headers').exists() else ''
    modified = [line.split(':',1)[1].strip() for line in headers.splitlines() if line.lower().startswith('last-modified:')]
    modified_at = parsedate_to_datetime(modified[-1]).isoformat() if modified else None
    common = {'source_url':manifest['lrad-v2.xml'].get('resolved_url',manifest['lrad-v2.xml']['url']), 'retrieved_at':manifest['lrad-v2.xml']['retrieved_at'], 'source_http_last_modified_at':modified_at}
    lookup = borough_lookup(boundaries)
    stops, stop_sources = load_stops(raw, manifest)
    stations, platforms, lifts, toilets, detailed, review, issues = [], [], [], [], [], [], []
    for index, node in enumerate(xml, 1):
        name = node.findtext('StationName')
        sid = 'tfl:lrad:' + digest(name+'|'+(node.findtext('NaptanCode') or ''))
        stop, method, candidates = match_station(node, stops)
        row = {'station_id':sid, 'station_name':name, 'source_naptan_id':node.findtext('NaptanCode') or '', 'matched_naptan_id':stop['id'] if stop else '', 'coordinate_match_method':method, 'longitude':stop.get('lon') if stop else None, 'latitude':stop.get('lat') if stop else None, 'coordinate_is_verified_accessible_entrance':False, 'accessibility_type_raw':node.findtext('AccessibilityType'), 'accessibility_scope':'typical_street_to_platform_or_interchange_not_live', 'line_names_raw':sorted({x.text for x in node.findall('.//Line/LineName')}), **common}
        if stop:
            row.update({'coordinate_source_url':stop_sources[stop['id']]['url'], 'coordinate_retrieved_at':stop_sources[stop['id']]['retrieved_at'],'api_station_name':stop['commonName']})
        row.update(lookup(row['longitude'], row['latitude']))
        stations.append(row)
        detailed.append({**row, 'source_record':tree(node), 'source_row':index})
        if not stop:
            review.append({'station_id':sid, 'station_name':name, 'reason':method, 'candidate_naptan_ids':[c['id'] for c in candidates], 'review_status':'pending'})
        seen_platforms=set()
        for number, line in enumerate(node.findall('.//Line'), 1):
            pid = sid+':platform:'+str(number)
            p = {'platform_record_id':pid,'station_id':sid,'source_platform_record':number}
            fingerprint=json.dumps(tree(line),sort_keys=True)
            p['duplicate_source_record']=fingerprint in seen_platforms
            if p['duplicate_source_record']:
                issues.append({'record_id':pid,'field':'Line','raw_value':tree(line),'issue':'duplicate_source_platform_record_retained'})
            seen_platforms.add(fingerprint)
            if line not in node.findall('Lines/Line'):
                issues.append({'record_id':pid,'field':'Line','raw_value':None,'issue':'nested_source_lines_container_flattened'})
            for src,dst in [('LineName','line_name_raw'),('Platform','platform_raw'),('Direction','direction_raw'),('DirectionTowards','direction_towards_raw'),('AccessibilityType','accessibility_type_raw'),('SpecificEntranceRequired','specific_entrance_raw'),('AdditionalAccessibilityInformation','additional_information_raw'),('LocationOfLevelAccess','level_access_location_raw')]:
                p[dst]=line.findtext(src)
            for src in ['StepMin','StepMax','StepAverage','GapMin','GapMax','GapAverage']:
                value = line.findtext(src)
                try:
                    p[re.sub(r'(?<!^)(?=[A-Z])','_',src).lower()+'_mm']=float(value) if value is not None else None
                except ValueError:
                    p[re.sub(r'(?<!^)(?=[A-Z])','_',src).lower()+'_mm']=None
                    issues.append({'record_id':pid,'field':src,'raw_value':value,'issue':'non_numeric'})
            for src,dst in [('LevelAccessByManualRamp','manual_ramp'),('DesignatedLevelAccessPoint','designated_level_access_point')]:
                values=[x.text for x in line.findall(src)]
                value=values[0] if len(values)==1 else None
                p[dst+'_raw']=values if len(values)>1 else value
                p[dst]=flag(value)
                if len(values)>1 or (value and flag(value)=='unknown'):
                    issues.append({'record_id':pid,'field':src,'raw_value':values,'issue':'invalid_or_repeated_boolean_preserved_as_unknown'})
            p['lift_route_alternatives']=[[x.text for x in route.findall('Lift')] for route in line.findall('LiftRoutes/LiftRoute')]
            platforms.append(p)
        for number,lift in enumerate(node.findall('Lifts/Lift'),1):
            lifts.append({'lift_record_id':sid+':lift:'+str(number),'station_id':sid,'lift_id_raw':lift.findtext('LiftID'),'lift_name_raw':lift.findtext('LiftName'),'from_stop_area':lift.findtext('FromStopArea'),'to_stop_area':lift.findtext('ToStopArea'),'limited_capacity':flag(lift.findtext('LimitedCapacityLift')),'limited_capacity_raw':lift.findtext('LimitedCapacityLift'),'notes_raw':lift.findtext('LiftNotes'),'operating_status':'unknown'})
        for number,toilet in enumerate(node.findall('Toilets/Toilet'),1):
            toilets.append({'toilet_record_id':sid+':toilet:'+str(number),'station_id':sid,'type_raw':toilet.findtext('Type'),'accessible':flag(toilet.findtext('Accessible')),'inside_gate_line':flag(toilet.findtext('InsideGateLine')),'baby_changing':flag(toilet.findtext('BabyChanging')),'fee_charged':flag(toilet.findtext('FeeCharged')),'not_managed_by_tfl':flag(toilet.findtext('NotManagedByTfL')),'location_raw':toilet.findtext('Location'),'survey_observed_at':None})
    if len({s['station_id'] for s in stations})!=len(stations):
        raise ValueError('Station ID collision; review the new source')
    by_name=defaultdict(list)
    for s in stations:by_name[normal(s['station_name'])].append(s)
    disruption_meta=manifest['lift_disruptions.json']
    retrieved=disruption_meta['retrieved_at']
    expires=(dt.datetime.fromisoformat(retrieved)+dt.timedelta(minutes=15)).isoformat()
    disruptions=[]
    source_disruptions=json.loads((raw/'lift_disruptions.json').read_text())
    if not isinstance(source_disruptions,list):raise ValueError('Unexpected disruptions response')
    for d in source_disruptions:
        if not all(isinstance(d.get(k),str) for k in ['naptanCode','stopPointName','message']):raise ValueError('Invalid disruption record')
        matched=[s for s in stations if d['naptanCode'] in (s['source_naptan_id'],s['matched_naptan_id'])]
        method='naptan'
        if not matched:
            matched=by_name[normal(d['stopPointName'])];method='unique_normalized_station_name'
        if len(matched)!=1:matched=[];method='unmatched_or_ambiguous'
        disruptions.append({'disruption_id':'tfl:lift:'+digest(json.dumps(d,sort_keys=True)),'station_id':matched[0]['station_id'] if matched else None,'station_match_method':method,'naptan_id':d['naptanCode'],'station_name':d['stopPointName'],'ics_code':d.get('icsCode'),'from_stop_area':d.get('outageStartArea'),'to_stop_area':d.get('outageEndArea'),'message':d['message'],'outage_started_at':None,'retrieved_at':retrieved,'expires_at':expires,'source_url':disruption_meta['url']})
    static_dir=output/'dataset/tfl';runtime=output/'Website/data/tfl'
    for name,rows in [('stations',stations),('platforms',platforms),('lifts',lifts),('toilets',toilets),('lift_disruptions',disruptions)]:
        write_csv(static_dir/(name+'.csv'),rows)
    write_csv(static_dir/'station_match_review.csv',review,['station_id','station_name','reason','candidate_naptan_ids','review_status'])
    write_csv(static_dir/'source_issues.csv',issues,['record_id','field','raw_value','issue'])
    write_json(runtime/'stations.geojson',{'type':'FeatureCollection','features':[{'type':'Feature','id':s['station_id'],'geometry':{'type':'Point','coordinates':[s['longitude'],s['latitude']]},'properties':s} for s in stations if s['longitude'] is not None]})
    write_json(runtime/'station_access.json',{'source':common,'stations':detailed})
    write_json(runtime/'lift_disruptions.json',{'retrieved_at':retrieved,'expires_at':expires,'freshness_policy_minutes':15,'snapshot_only':True,'empty_or_expired_feed_does_not_mean_lifts_work':True,'records':disruptions})
    report={'station_records':len(stations),'station_coordinates_matched':sum(s['longitude'] is not None for s in stations),'station_coordinates_within_london':sum(s['within_london'] is True for s in stations),'station_match_review':len(review),'platform_records':len(platforms),'lift_records':len(lifts),'toilet_records':len(toilets),'lift_disruptions':len(disruptions),'disruptions_matched_to_station':sum(bool(d['station_id']) for d in disruptions),'source_issues':len(issues),'accessibility_type_counts':dict(Counter(s['accessibility_type_raw'] for s in stations)),'lrad_http_last_modified_at':modified_at,'disruptions_retrieved_at':retrieved,'disruptions_expire_at':expires,'source_record_policy':'No LRAD station discarded; geometry omitted when coordinate match needs review. Legacy line names retained. LRAD is not a real-time accessibility guarantee.'}
    write_json(static_dir/'metadata.json',{'counts':report,'coordinate_name_aliases':NAME_ALIASES,'official_xsd_validation':xsd_report,'sources':[m for f,m in manifest.items() if f!='stations.kml'],'excluded_coordinate_source':{'file':'stations.kml','reason':'HTTP Last-Modified 2014; current API used instead'}})
    print(json.dumps(report,indent=2))

if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--raw-dir',type=Path,required=True)
    parser.add_argument('--output-root',type=Path,required=True)
    parser.add_argument('--boundaries',type=Path,required=True)
    args=parser.parse_args()
    clean(args.raw_dir,args.output_root,args.boundaries)
