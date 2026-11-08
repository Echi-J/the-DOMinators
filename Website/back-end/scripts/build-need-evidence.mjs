import fs from 'node:fs/promises';
import path from 'node:path';

const KEYS=['ent','toilet','lift','cp'];

// This overlay is separate from the original place files. An entrance answer
// means at least one specifically named entrance, not a verified street route.
export async function buildNeedEvidence(web){
  const read=async file=>JSON.parse(await fs.readFile(path.join(web,'data',file),'utf8'));
  const [catalog,operators]=await Promise.all([read('catalog.json'),read('venue_evidence/operator_statements.json')]);
  const places=new Map();
  for(const filename of (await fs.readdir(path.join(web,'data/places'))).filter(f=>f.endsWith('.geojson')).sort()){
    for(const f of (await read('places/'+filename)).features)places.set(f.properties.id,f.properties);
  }
  const resolutions={};
  for(const statement of operators.statements){
    const place=places.get(statement.place_id);
    if(!place||place.name_en!==statement.venue_name)throw new Error('Operator statement venue identity needs review.');
    const website=new URL(place.website),source=new URL(statement.source_url);
    const official=hostname=>hostname===statement.source_domain||hostname.endsWith('.'+statement.source_domain);
    if(source.protocol!=='https:'||!official(source.hostname)||!official(website.hostname))throw new Error('Operator statement source identity needs review.');
    for(const [key,attribute] of [['ent','entrance_step_free'],['toilet','toilet_wheelchair_accessible']]){
      const claims=statement.claims.filter(c=>c.attribute===attribute);
      const positive=claims.filter(c=>c.value==='yes'&&c.scope);
      if(!positive.length)continue;
      const sameScopeConflict=positive.some(a=>claims.some(b=>b.scope===a.scope&&['no','partial'].includes(b.value)));
      const core=place[key]||'unknown',conflict=sameScopeConflict||['no','partly'].includes(core);
      (resolutions[place.id]??={})[key]={value:conflict?'unknown':'yes',basis:'operator_statement',
        core_value:core,conflict,positive_scopes:positive.map(c=>c.scope),
        other_scopes:claims.filter(c=>c.value!=='yes').map(c=>({scope:c.scope,value:c.value})),
        source_url:statement.source_url,checked_at:statement.checked_at};
    }
    // lift_present and adult_changing_equipment_present deliberately have no
    // mapping to all-public-floor access or official registry status.
  }
  const coverage=Object.fromEntries(KEYS.map(key=>[key,{positive_places:0,by_borough:{},examples:[]}]));
  for(const p of places.values())for(const key of KEYS){
    if((resolutions[p.id]?.[key]?.value??p[key])!=='yes')continue;
    const c=coverage[key];c.positive_places++;c.by_borough[p.borough_code]=(c.by_borough[p.borough_code]||0)+1;
    if(c.examples.length<3)c.examples.push({place_id:p.id,name:p.name_en,borough_code:p.borough_code,borough_name:p.borough_name});
  }
  const output={schema_version:'access-london-need-evidence-1',core_record_count:places.size,
    source_dates:{osm:catalog.osm_snapshot_at,operator_statements_checked_at:operators.checked_at},
    rules:{ent:'At least one named entrance is explicitly reported step-free. Other entrances may differ.',
      toilet:'Explicit core toilet claim or a scoped operator statement.',
      lift:'A mapped lift is insufficient to establish access to every public floor.',
      cp:'Ordinary toilet or adult-changing equipment claims do not establish official registration.'},
    coverage,resolutions};
  await fs.writeFile(path.join(web,'data/need_evidence.json'),JSON.stringify(output,null,2)+'\n');
  return output;
}
