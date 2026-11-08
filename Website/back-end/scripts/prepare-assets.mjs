import fs from 'node:fs/promises';
import path from 'node:path';
import { buildNeedEvidence } from './build-need-evidence.mjs';
const root=path.resolve(import.meta.dirname,'..');
const front=path.resolve(root,'../front-end'),data=path.resolve(root,'../data');
await buildNeedEvidence(path.resolve(root,'..'));
const read=async file=>JSON.parse(await fs.readFile(path.join(data,file),'utf8'));
const features=(await read('venue_evidence/source_features.geojson')).features;
const grouped={};
for(const f of features)(grouped[f.properties.borough_code]??=[]).push(f);
const folder=path.join(data,'venue_evidence/boroughs');await fs.mkdir(folder,{recursive:true});
for(const [code,rows] of Object.entries(grouped))await fs.writeFile(path.join(folder,code+'.json'),JSON.stringify(rows));
const index={};
for(const filename of (await fs.readdir(path.join(data,'places'))).filter(x=>x.endsWith('.geojson'))){
 for(const f of (await read('places/'+filename)).features){const p=f.properties;index[p.id]=[p.borough_code,p.name_en];}
}
for(const f of features){const p=f.properties;index[p.feature_id]??=[p.borough_code,p.name_en,'facility'];}
for(const f of (await read('toiletmap/london_toilets.geojson')).features){const p=f.properties;index[p.feature_id]=[p.borough_code,p.name_en,'facility'];}
await fs.writeFile(path.join(root,'lib/place-index.json'),JSON.stringify(index));
await fs.rm(path.join(root,'public'),{recursive:true,force:true});
await fs.cp(front,path.join(root,'public'),{recursive:true});
await fs.cp(data,path.join(root,'public/data'),{recursive:true});
console.log('Prepared '+Object.keys(index).length+' places and facilities from sibling front-end/ and data/.');
