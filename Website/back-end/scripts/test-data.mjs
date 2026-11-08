import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';

const root = path.resolve(import.meta.dirname, '..');
const web = path.join(root, 'public');
const store = new Map();
const fetches = [];
const context = {
  URL, console, crypto: webcrypto, Map, Set, Blob,
  setTimeout: () => 1, clearTimeout: () => {},
  document: { currentScript: { src: 'http://access.test/js/access-data.js' }, getElementById: () => null, addEventListener: () => {} },
  location: new URL('http://access.test/map.html?noTiles=1'),
  history: { replaceState: (_a, _b, url) => { context.location.href = String(url); } },
  navigator: {}, URLSearchParams,
  localStorage: { getItem: key => store.get(key) ?? null, setItem: (key, value) => store.set(key, value), removeItem: key => store.delete(key) },
  fetch: async url => {
    fetches.push(String(url));
    try { const data = await fs.readFile(path.join(web, new URL(url).pathname)); return { ok: true, json: async () => JSON.parse(data) }; }
    catch { return { ok: false, status: 404 }; }
  },
  DCLogic: class { constructor() { this.state = {}; } setState(patch) { Object.assign(this.state, patch); } }
};
context.window = context;
vm.createContext(context);
for (const file of ['access-data.js','access-evidence.js','map-page.js','home-page.js','about-page.js','contact-page.js']) {
  vm.runInContext(await fs.readFile(path.join(web,'js',file),'utf8'), context, { filename: file });
}
const data = await context.AccessData.metadata();
assert.equal(data.catalog.record_count, 74500);
assert.equal(data.boroughs.length, 33);
assert.equal(fetches.length, 5);
await context.AccessData.metadata(); assert.equal(fetches.length, 5, 'metadata cache');
const hackney = await context.AccessData.places('E09000012');
const camden = await context.AccessData.places('E09000007');
assert.equal(hackney.length, 2530);
assert.notEqual(hackney[0].properties.id, camden[0].properties.id);
assert.equal(context.AccessData.findBorough({longitude:-0.0553,latitude:51.545},data.boundaries).properties.borough_code, 'E09000012');
assert.equal(context.AccessData.findBorough({longitude:0,latitude:0},data.boundaries),undefined);
assert.equal(context.AccessData.haversine({longitude:0,latitude:0},{longitude:0,latitude:0}),0);
assert.equal(context.AccessData.distance(null),'Distance not calculated');
assert.equal(context.AccessData.safeURL('javascript:alert(1)'), '');
await assert.rejects(context.AccessData.places('../private'), /Unknown borough/);

const page = new context.AccessMapPage();
await page.componentDidMount();
await page.openArea('HCK');
let view = page.renderVals();
assert.equal(view.results.length,40);
assert.equal(page.state.features.length,2530);
assert.equal(view.hasMore,true);
view.moreResults(); assert.equal(page.renderVals().results.length,80);
page.setState({cat:'toilet'}); view=page.renderVals();
assert.equal(view.results.length,31);
assert.equal(page.mapView.rows.length,31);
page.setState({need:{ent:true,toilet:false,lift:false,cp:false}}); view=page.renderVals();
assert.equal(view.noMatch,true);
assert.equal(view.results.length,31,'unknowns remain visible');
assert.ok(view.countText.startsWith('0 source-supported matches'));
page.setState({need:{ent:false,toilet:true,lift:false,cp:false}}); view=page.renderVals();
const knownToilets = hackney.filter(f=>f.properties.ui_category==='toilet' && f.properties.toilet==='yes').length;
assert.ok(view.countText.startsWith(knownToilets+' source-supported matches'));
assert.equal(page.mapView.rows.length,31);

page.setState({cat:'all',need:{},q:'acme fire cult'}); view=page.renderVals();
assert.equal(view.results.length,1);
view.results[0].open(); view=page.renderVals();
assert.equal(view.pl.name,'Acme Fire Cult');
assert.ok(view.pl.sourceURL.startsWith('https://www.openstreetmap.org/'));
assert.ok(!view.pl.confirm.includes('Confirmed by'));
view.act.save(); assert.equal(context.AccessData.isSaved(page.state.sel),true);
assert.equal(page.renderVals().pl.saved,'Unsave');

// All four mapper questions exist; recording one does not rewrite source facts.
page.setState({mode:'map',q:'',sel:null,cur:null,cat:'all'}); view=page.renderVals();
const noToilet = hackney.find(f=>f.properties.toilet==='unknown');
page.mapView.open(noToilet.properties.id); view=page.renderVals(); view.confirmPlace();
assert.equal(page.state.qKeys.length,4);
const original = page.state.features.find(f=>f.properties.id===noToilet.properties.id).properties.ent;
view=page.renderVals(); view.opts[0].pick();
assert.equal(context.AccessData.events().length,1);
assert.equal(context.AccessData.answers()[noToilet.properties.id].ent,'yes');
assert.equal(page.state.features.find(f=>f.properties.id===noToilet.properties.id).properties.ent,original);
for(let i=0;i<3;i++){view=page.renderVals();view.opts.at(-1).pick();}
assert.equal(page.state.mstep,'done');
assert.equal(context.AccessData.events().length,4);
const restored = new context.AccessMapPage(); await restored.componentDidMount();
assert.equal(restored.state.ans[noToilet.properties.id].ent,'yes');
context.AccessData.saveEvent('answer',{place_id:noToilet.properties.id,question_id:'ent',answer_raw:'no'});
assert.equal(context.AccessData.events().length,4,'repeat answer replaces local event');
assert.equal(context.AccessData.answers()[noToilet.properties.id].ent,'no');
page.setState({mode:'visit'});
await Promise.all([page.openArea('HCK'),page.openArea('CMD')]);
assert.equal(page.state.area,'CMD');
assert.equal(page.state.features[0].properties.borough_code,'E09000007','last requested borough wins');
const about = new context.AccessAboutPage(); await about.loadData(); const chart=about.renderVals();
assert.equal(chart.pts.length,33); assert.equal(chart.boroughRows.length,33);
assert.ok(chart.pts.every(p=>+p.cx>=70 && +p.cx<=870 && +p.cy>=20 && +p.cy<=360));
assert.equal(chart.x0,'10%');
assert.ok(!JSON.stringify(chart.pts).includes('sample'));

// Every runtime borough asset exists and reconciles, with identical source IDs.
let total=0;
for(const borough of data.boroughs){const fsx=await context.AccessData.places(borough.borough_code);assert.equal(fsx.length,borough.n_osm_objects);total+=fsx.length;}
assert.equal(total,74500);
// Operator statements must join the intended venue and remain separate from OSM.
const operators=await context.AccessEvidence.operators();assert.equal(operators.length,2);
for(const record of operators){
 const borough=await context.AccessData.places(record.borough_code),place=borough.find(f=>f.properties.id===record.place_id)?.properties;
 assert.ok(place);assert.equal(place.name_en,record.venue_name);
 assert.ok(new URL(place.website).hostname.endsWith(record.source_domain));
 assert.equal(record.survey_observed_at,null);assert.equal(record.official_changing_places_registration,'not_verified');
 assert.ok(record.claims.every(c=>c.scope&&c.summary));
}
await page.openArea('E09000020','osm:relation/29795');
await page.loadAdditional('E09000020',page.request);
assert.equal(page.renderVals().pl.operatorClaims.length,5);
assert.equal(page.state.features.find(f=>f.properties.id==='osm:relation/29795').properties.ent,'unknown','Operator claims must not silently overwrite source tags');
// Regression for the three formerly empty access-need buttons.
page.setState({mode:'visit',sel:null,vstep:'list',cat:'all',q:'',need:{ent:true,toilet:false,lift:false,cp:false}});
view=page.renderVals();
assert.ok(view.countText.startsWith('1 source-supported match'));
assert.equal(view.results[0].name,'Victoria and Albert Museum');
assert.ok(view.results[0].marks.some(m=>m.text==='Step-free: Yes (operator)'));
assert.equal(data.needEvidence.coverage.ent.positive_places,1);
assert.deepEqual(Array.from(data.needEvidence.resolutions['osm:relation/29795'].ent.positive_scopes),['Cromwell Road entrance','Exhibition Road entrance']);
assert.equal(data.needEvidence.resolutions['osm:relation/29795'].ent.other_scopes[0].value,'no');
for(const key of ['lift','cp']){
 const option=view.needs.find(n=>n.id===key);assert.equal(option.available,false);assert.equal(option.unavailable,true);
 const before=JSON.stringify(page.state.need);option.toggle();assert.equal(JSON.stringify(page.state.need),before,'Unavailable need must not trap the visitor in zero matches');
 assert.equal(data.needEvidence.coverage[key].positive_places,0);
 assert.equal(data.needEvidence.resolutions['osm:way/27765411'][key],undefined,'Lift/equipment presence must not infer all-floor access or registration');
}
view.needs.find(n=>n.id==='ent').toggle();assert.equal(new URL(context.location.href).searchParams.has('needs'),false);
page.renderVals().needs.find(n=>n.id==='ent').toggle();assert.equal(new URL(context.location.href).searchParams.get('needs'),'ent');
await page.openArea('HCK');view=page.renderVals();
assert.equal(view.noMatch,true);assert.equal(view.hasEntranceExample,true);assert.equal(view.results.length,40);
assert.ok(view.liftRecordsURL.includes('kind=lift'));assert.ok(view.entranceRecordsURL.includes('kind=entrance'));
await view.openEntranceExample();view=page.renderVals();
assert.equal(view.pl.name,'Victoria and Albert Museum');assert.equal(view.pl.entranceSupported,true);
assert.ok(view.pl.rows.find(r=>r.label==='Step-free entrance').value.includes('operator statement'));
assert.equal(page.state.features.find(f=>f.properties.id==='osm:relation/29795').properties.ent,'unknown');
page.setState({sel:null,vstep:'list',q:'no-such-venue-unique-test'});view=page.renderVals();assert.equal(view.noPlaceResults,true);assert.equal(view.noMatch,false,'An empty text search is different from missing access evidence');
const deepLinkPage=new context.AccessMapPage();context.location.href='http://access.test/map.html?borough=E09000020&needs=ent';await deepLinkPage.componentDidMount();assert.equal(deepLinkPage.state.need.ent,true);assert.ok(deepLinkPage.renderVals().countText.startsWith('1 source-supported match'));
await fs.mkdir(path.join(root,'docs'),{recursive:true});
const result={status:'passed',places:total,boroughs:33,checks:['metadata cache','borough switching','category and need filters','unknown visibility','pagination','search','source provenance','bookmarks','four mapper questions','local persistence','source data unchanged by contributions','last-request race handling','actual ONS scatter bounds','all 33 data files','scoped operator entrance matching','unavailable floor and registry filters','no lift or equipment inference','entrance evidence example navigation','need deep links','empty text search versus unknown evidence'],browser_qa:'Recorded separately in VALIDATION.md'};
await fs.writeFile(path.join(root,'docs/automated-validation.json'),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result,null,2));
