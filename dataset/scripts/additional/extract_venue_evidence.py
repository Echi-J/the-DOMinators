"""Extract OSM source evidence. No feature is treated as a reviewed site survey."""
import argparse
from collections import Counter
import hashlib
import json
from pathlib import Path
import re
import osmium
from pyproj import Transformer
from shapely import wkb
from shapely.geometry import Point, shape, mapping
from shapely.strtree import STRtree
from common import borough_lookup, digest, write_csv, write_json

EVIDENCE_KEYS = {'wheelchair','wheelchair:description','wheelchair:entrance_width','entrance','entrance:step_count','entrance:width','entrance:threshold','entrance:ramp','door','door:width','door:automatic','width','incline','ramp','ramp:wheelchair','ramp:portable','step_count','toilets:wheelchair','toilets:access','toilets:changing_places','changing_places','changing_table:adult','hoist','toilets:hoist','level','level:ref','min_level','max_level','access','fee','opening_hours','check_date','check_date:wheelchair','survey:date','source:date'}

def kinds(tags):
    result=[]
    if tags.get('entrance') not in (None,'no') and any(k in tags for k in ['wheelchair','wheelchair:entrance_width','entrance:step_count','entrance:width','entrance:threshold','entrance:ramp','door:width','step_count','ramp:wheelchair']):result.append('entrance')
    if tags.get('highway')=='elevator' or tags.get('indoor')=='elevator':result.append('lift')
    if any(k in tags for k in ['ramp:wheelchair','entrance:ramp','ramp:portable']):result.append('ramp_claim')
    if 'toilets:wheelchair' in tags or (tags.get('amenity')=='toilets' and 'wheelchair' in tags):result.append('accessible_toilet_claim')
    if any(tags.get(k) in {'yes','designated'} for k in ['changing_places','toilets:changing_places','changing_table:adult']) or tags.get('amenity')=='changing_places' or re.search(r'\bchanging places?\b',tags.get('name',''),re.I):result.append('adult_changing_candidate')
    return result

class Extract(osmium.SimpleHandler):
    def __init__(self):
        super().__init__();self.records={};self.areas={};self.factory=osmium.geom.WKBFactory()
    def capture(self,obj,kind):
        categories=kinds(obj.tags)
        if not categories:return None
        sid=f'{kind}/{obj.id}'
        self.records[sid]={'source_id':sid,'feature_kinds':categories,'osm_version':obj.version,'osm_last_modified_at':obj.timestamp.isoformat(),'tags':dict(obj.tags),'geometry':None,'geometry_method':'unassembled'}
        return self.records[sid]
    def node(self,obj):
        record=self.capture(obj,'node')
        if record is not None and obj.location.valid():record.update(geometry=Point(obj.location.lon,obj.location.lat),geometry_method='osm_node')
    def way(self,obj):
        record=self.capture(obj,'way')
        if record is not None:
            try:record.update(geometry=wkb.loads(self.factory.create_linestring(obj),hex=True),geometry_method='osm_way_representative_point')
            except (RuntimeError,ValueError):pass
    def relation(self,obj):self.capture(obj,'relation')
    def area(self,obj):
        if not kinds(obj.tags):return
        sid=f'{"way" if obj.from_way() else "relation"}/{obj.orig_id()}'
        try:self.areas[sid]=wkb.loads(self.factory.create_multipolygon(obj),hex=True)
        except (RuntimeError,ValueError):pass

def extract(pbf,base,output,snapshot_at):
    reader=osmium.io.Reader(str(pbf));header_snapshot=reader.header().get('osmosis_replication_timestamp');reader.close()
    if header_snapshot and header_snapshot!=snapshot_at:raise ValueError('Snapshot date does not match the PBF header')
    lookup=borough_lookup(base/'borough_boundaries.geojson')
    venues={}
    for path in sorted((base/'places').glob('*.geojson')):
        for f in json.loads(path.read_text())['features']:venues[f['properties']['id']]=f
    projected=Transformer.from_crs(4326,27700,always_xy=True).transform
    venue_ids=sorted(venues)
    venue_points=[Point(*projected(*venues[k]['geometry']['coordinates'])) for k in venue_ids]
    index=STRtree(venue_points)
    handler=Extract();handler.apply_file(str(pbf),locations=True,idx='flex_mem')
    features=[];claims=[];nearby=[];cp=[];excluded=[]
    for sid,r in sorted(handler.records.items()):
        geom=handler.areas.get(sid,r['geometry'])
        if geom is None or geom.is_empty:
            excluded.append({'source_id':sid,'reason':'no_usable_geometry'});continue
        point=geom if geom.geom_type=='Point' else geom.representative_point()
        borough=lookup(point.x,point.y)
        if not borough['within_london']:
            excluded.append({'source_id':sid,'reason':'outside_london_boundary'});continue
        tags=r['tags'];fid='osm:'+sid;v=venues.get(fid)
        name_raw=tags.get('name','')
        name_en=v['properties']['name_en'] if v else tags.get('name:en',name_raw)
        if not name_en or re.search('[\u3400-\u9fff]',name_en):name_en=r['feature_kinds'][0].replace('_',' ').capitalize()
        selected={k:v for k,v in tags.items() if k in EVIDENCE_KEYS or k in {'amenity','highway','indoor','operator','website','ref:changing_places','ref:changing-places'} }
        record={'feature_id':fid,'name_en':name_en,'name_raw':name_raw,'feature_kinds':r['feature_kinds'],'longitude':round(point.x,8),'latitude':round(point.y,8),**borough,'matched_place_id':fid if v else None,'place_match_method':'same_osm_object' if v else 'unmatched','source_url':'https://www.openstreetmap.org/'+sid,'source_snapshot_at':snapshot_at,'source_last_modified_at':r['osm_last_modified_at'],'osm_version':r['osm_version'],'source_tags':selected,'review_status':'source_claim_not_independently_verified','survey_observed_at':None,'geometry_method':'area_representative_point' if sid in handler.areas else r['geometry_method'],'point_is_verified_accessible_entrance':False}
        features.append({'type':'Feature','id':fid,'geometry':mapping(Point(record['longitude'],record['latitude'])),'properties':record})
        for key,value in sorted(selected.items()):
            if key not in EVIDENCE_KEYS and key not in {'amenity','highway','indoor'}:continue
            claims.append({'claim_id':'osm:claim:'+digest(fid+'|'+key+'|'+str(r['osm_version'])),'feature_id':fid,'place_id':fid if v else None,'source_field':key,'value_raw':value,'source_url':record['source_url'],'source_snapshot_at':snapshot_at,'source_last_modified_at':r['osm_last_modified_at'],'survey_observed_at':None,'review_status':'source_claim_not_independently_verified'})
        if not v:
            metric=Point(*projected(point.x,point.y))
            matches=sorted([(metric.distance(venue_points[int(i)]),venue_ids[int(i)]) for i in index.query(metric.buffer(20)) if metric.distance(venue_points[int(i)])<=20])[:3]
            for distance,pid in matches:
                nearby.append({'feature_id':fid,'candidate_place_id':pid,'distance_m':round(distance,2),'match_basis':'representative_point_within_20m_not_proof_of_belonging','review_status':'pending'})
        if 'adult_changing_candidate' in r['feature_kinds']:
            cp.append({**record,'registry_status':'not_verified','official_registry_id':None,'official_registry_url':None,'candidate_basis':'OSM name or adult-changing tags; not an official registration claim'})
    data=output/'dataset/venue_evidence'
    write_json(output/'Website/data/venue_evidence/source_features.geojson',{'type':'FeatureCollection','features':features})
    write_csv(data/'source_features.csv',[f['properties'] for f in features])
    write_csv(data/'source_claims.csv',claims)
    write_csv(data/'place_match_review.csv',nearby,['feature_id','candidate_place_id','distance_m','match_basis','review_status'])
    write_csv(data/'excluded_features.csv',excluded,['source_id','reason'])
    write_csv(output/'dataset/changing_places/osm_candidates.csv',cp, list(cp[0]) if cp else ['feature_id','registry_status','official_registry_id','candidate_basis'])
    write_json(output/'Website/data/venue_evidence/changing_places_candidates.geojson',{'type':'FeatureCollection','registry_records_connected':False,'features':[{'type':'Feature','id':r['feature_id'],'geometry':mapping(Point(r['longitude'],r['latitude'])),'properties':r} for r in cp]})
    report={'source_features':len(features),'source_claims':len(claims),'feature_kind_counts':dict(Counter(kind for f in features for kind in f['properties']['feature_kinds'])),'exact_existing_place_matches':sum(bool(f['properties']['matched_place_id']) for f in features),'nearby_match_review_pairs':len(nearby),'adult_changing_candidates':len(cp),'official_registry_records':0,'reviewed_field_observations':0,'excluded_features':len(excluded),'source_snapshot_at':snapshot_at,'raw_pbf_sha256':hashlib.sha256(pbf.read_bytes()).hexdigest(),'scope':'Greater London; feature categories overlap. Source tags are claims, not new field surveys. Nearby points remain unlinked until reviewed.'}
    write_json(data/'metadata.json',report)
    source_metadata=pbf.with_suffix(pbf.suffix+'.metadata.json')
    if source_metadata.exists():write_json(data/'source_download.json',json.loads(source_metadata.read_text()))
    print(json.dumps(report,indent=2))

if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--pbf',type=Path,required=True);p.add_argument('--base-data',type=Path,required=True);p.add_argument('--output-root',type=Path,required=True);p.add_argument('--snapshot-at',required=True)
    a=p.parse_args();extract(a.pbf,a.base_data,a.output_root,a.snapshot_at)
