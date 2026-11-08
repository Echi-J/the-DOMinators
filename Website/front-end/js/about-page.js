
window.AccessAboutPage = class extends DCLogic {
componentDidMount() { this.loadData(); }
async loadData() {
this.setState({ dataLoading: true, dataError: null });
try { this.setState({ ...await AccessData.metadata(), dataLoading: false, dataReady: true }); }
catch (error) { this.setState({ dataLoading: false, dataError: error.message }); }
}
componentDidUpdate() {
const body=document.getElementById('al-borough-table-body');
if(!body || !this.state.boroughs || (body===this.tableElement && this.tableData===this.state.boroughs)) return;
this.tableElement=body; this.tableData=this.state.boroughs;
const fragment=document.createDocumentFragment();
for(const b of this.state.boroughs){
const row=document.createElement('tr');
const values=[b.borough_name,AccessData.fmt(b.n_osm_objects),AccessData.pct(b.disability_rate_pct),AccessData.pct(b.osm_wheelchair_tag_coverage_pct),AccessData.pct(b.imd_average_score)];
values.forEach((value,i)=>{const cell=document.createElement(i===0?'th':'td');if(i===0)cell.scope='row';cell.textContent=value;row.appendChild(cell);});
fragment.appendChild(row);
}
body.replaceChildren(fragment);
}
renderVals() {
const S = this.state;
const c = S.c || { yes: 6, partly: 2, no: 2, unknown: 10 };
const labelled = c.yes + c.partly + c.no;
const all = labelled + c.unknown;
const score = labelled ? Math.round((c.yes + c.partly * 0.5) / labelled * 100) : null;
const coverage = all ? Math.round(labelled / all * 100) : 0;
const conf = coverage < 15 ? 'Low' : coverage < 35 ? 'Medium' : 'High';
const greens = ['#E3E9C9', '#C2D69E', '#8DB866', '#4E8A4F', '#2A5E35'];
const lv = score === null ? -1 : score < 45 ? 0 : score < 55 ? 1 : score < 65 ? 2 : score < 78 ? 3 : 4;
const K = [['yes', 'Wheelchair: yes', '#2F6B3C', 'none'], ['partly', 'Partly', '#C2D69E', 'none'], ['no', 'No', '#F2C994', 'none'], ['unknown', 'Not known', '#F2F3DC', '3px dashed #8E8F78']];
const set = (k, d) => { const n = Object.assign({}, c); n[k] = Math.max(0, Math.min(20, n[k] + d)); this.setState({ c: n }); };
const dots = [];
K.forEach((k) => { for (let i = 0; i < c[k[0]]; i++) dots.push({ bg: k[2], border: k[3] }); });
const openF = S.faq === undefined ? 0 : S.faq;
const FAQ = [
['Is this real data?', 'Yes. The map reads 74,500 OSM objects from the 18 October 2026 snapshot. Borough context comes from ONS Census 2021 and IMD 2025. The home background is an illustration.'],
['Why do some boroughs show a question mark?', 'The retained display rule hides a score below 15% overall wheelchair-tag coverage. This is a display heuristic, not statistical confidence.'],
['What happens to my answers?', 'Quick mapper notes remain local. Use Shared observations to submit dated evidence online. Submissions are private until approved and do not overwrite original source tags.'],
['Does unknown mean inaccessible?', 'No. It means the selected data has insufficient evidence. Source coordinates are not verified entrances and no accessible walking route is calculated. The station view shows a refreshed TfL lift feed with explicit stale/unavailable states.']
];
const boroughs = S.boroughs || [];
const xMin = boroughs.length ? Math.floor(Math.min(...boroughs.map(b => b.disability_rate_pct))) : 10;
const xMax = boroughs.length ? Math.ceil(Math.max(...boroughs.map(b => b.disability_rate_pct))) : 20;
const yMin = 0, yMax = boroughs.length ? Math.max(20, Math.ceil(Math.max(...boroughs.map(b => b.osm_wheelchair_tag_coverage_pct)) / 10) * 10) : 40;
const pts = boroughs.map(b => ({ cx: (70 + (b.disability_rate_pct-xMin)/(xMax-xMin)*800).toFixed(1), cy: (360 - b.osm_wheelchair_tag_coverage_pct/yMax*340).toFixed(1),
fill: b.osm_wheelchair_tag_coverage_pct < 15 ? '#C2602A' : b.osm_wheelchair_tag_coverage_pct < 35 ? '#E8973F' : '#4E8A4F',
title: b.borough_name + ': ' + b.disability_rate_pct.toFixed(2) + '% disabled residents; ' + b.osm_wheelchair_tag_coverage_pct.toFixed(2) + '% OSM wheelchair-tag coverage', code: b.ui_code }));
const ptLabels = ['WST','CMD','BAR','HAV'].flatMap(code => { const p=pts.find(p=>p.code===code); if(!p) return []; const b=boroughs.find(b=>b.ui_code===code); return [{ x:(+p.cx > 640 ? +p.cx-150 : +p.cx+12).toFixed(1), y:(+p.cy+(code==='BAR'?22:-12)).toFixed(1), name:b.borough_name }]; });
const goVisit = () => { try { localStorage.setItem('al-mode', 'visit'); } catch (e) {} };
const goMap = () => { try { localStorage.setItem('al-mode', 'map'); } catch (e) {} };
return {
dataLoading: !!S.dataLoading, dataError: S.dataError || '', dataReady: !!S.dataReady, retryData: () => this.loadData(),
dataSummary: 'ONS Census 2021 + OSM snapshot 18 Oct 2026 · 33 boroughs',
x0:xMin+'%',x1:(xMin+(xMax-xMin)*0.25).toFixed(1)+'%',x2:(xMin+(xMax-xMin)*0.5).toFixed(1)+'%',x3:(xMin+(xMax-xMin)*0.75).toFixed(1)+'%',x4:xMax+'%',
y0:yMax+'%',y1:(yMax*0.75).toFixed(1)+'%',y2:(yMax*0.5).toFixed(1)+'%',y3:(yMax*0.25).toFixed(1)+'%',y4:'0%',
boroughRows: boroughs.map(b => ({name:b.borough_name, disability:AccessData.pct(b.disability_rate_pct), coverage:AccessData.pct(b.osm_wheelchair_tag_coverage_pct), count:AccessData.fmt(b.n_osm_objects), imd:AccessData.pct(b.imd_average_score)})),
pts: pts, ptLabels: ptLabels, goVisit: goVisit, goMap: goMap,
rows: K.map((k) => ({ label: k[1], dot: k[2], border: k[3], n: c[k[0]], dec: () => set(k[0], -1), inc: () => set(k[0], 1), decLabel: 'Fewer ' + k[1], incLabel: 'More ' + k[1] })),
dots: dots,
score: score === null ? '?' : score,
scoreBg: lv < 0 || conf === 'Low' ? '#DCDAC8' : greens[lv], scoreFg: lv >= 3 && conf !== 'Low' ? '#F2F3DC' : '#26261F',
coverage: coverage, conf: conf,
confBg: conf === 'High' ? '#CFE3BF' : conf === 'Medium' ? '#F6E3CC' : '#E9EBCD', confFg: conf === 'High' ? '#1F4A2A' : conf === 'Medium' ? '#7A3A12' : '#4B4C3D',
pipe: [
{ step: '01', title: 'Collect', text: 'Places and wheelchair tags from OpenStreetMap', bg: '#E3E6C4', fg: '#26261F' },
{ step: '02', title: 'Clean', text: 'Python joins places to the 33 boroughs', bg: '#C2D69E', fg: '#26261F' },
{ step: '03', title: 'Store', text: 'Versioned GeoJSON and CSV snapshots', bg: '#8DB866', fg: '#26261F' },
{ step: '04', title: 'Serve', text: 'Static files loaded per borough', bg: '#4E8A4F', fg: '#F2F3DC' },
{ step: '05', title: 'Show', text: 'This site: map, tiles and place cards', bg: '#2A5E35', fg: '#F2F3DC' }
],
sources: [
{ name: 'OpenStreetMap', use: 'Places and their wheelchair tag: yes, limited, no or missing. Extracted from the retained Geofabrik-origin PBF snapshot.', licence: 'ODbL' },
{ name: 'London Datastore', use: 'Borough boundaries, so each place is counted in the right borough.', licence: 'Open Government Licence' },
{ name: 'ONS Census 2021', use: 'Age-unadjusted disability rates by borough; not wheelchair-user prevalence.', licence: 'Open Government Licence' },
{ name: 'Index of Multiple Deprivation', use: 'To check whether gaps are bigger in poorer areas.', licence: 'Open Government Licence' },
{ name: 'TfL station accessibility and lift disruptions', use: '468 station source records, 466 matched coordinates and a refreshed lift-disruption feed. Static access source last modified May 2025; no route guarantee.', licence: 'TfL transport data terms' },
{ name: 'OSM facility evidence', use: '4,514 entrances, lifts, ramp and toilet evidence objects from 3 November 2026; source tags remain unreviewed.', licence: 'ODbL' },
{ name: 'Reviewed observations', use: 'Dated submissions with evidence links, stored online and published only after review. No survey records are pre-filled.', licence: 'User-submitted evidence' }
],
limits: [
'A source tag is not an independent inspection. Places and facilities change.',
'“Partly” can mean very different things in different places.',
'Lower source-tag coverage can reflect mapping gaps rather than venue accessibility.',
'Detailed facility claims do not automatically establish a step-free entrance route or access to every floor.',
'Official Changing Places registry data is not connected. The one OSM candidate is not verified registration.'
],
a11y: ['Keyboard only', 'Screen readers', 'Text resizes to 200%', 'Targets 44px or more', 'No dragging needed', 'Motion can be paused', 'Never colour alone', 'Plain English'],
faq: FAQ.map((f, i) => ({ q: f[0], a: f[1], open: openF === i, expanded: openF === i ? 'true' : 'false', sign: openF === i ? '−' : '+', toggle: () => this.setState({ faq: openF === i ? -1 : i }) }))
};
}
}
