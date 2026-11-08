
window.AccessHomePage = class extends DCLogic {
componentDidMount() {
this.setState({ auto: false });
this.loadData();
let reduce = false;
try { reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) {}
this.reduce = reduce;
if (reduce) this.setState({ auto: false });
this.modeTimer = setInterval(() => {
if (this.state.auto === false) return;
const next = (this.state.mode || 'visit') === 'visit' ? 'map' : 'visit';
this.setState({ mode: next, cycle: (this.state.cycle || 0) + 1, step: 0 });
}, 4000);
this.cardTimer = setInterval(() => {
if (this.reduce || this.state.auto === false) return;
this.setState({ step: ((this.state.step || 0) + 1) % 3 });
}, 1333);
}
async loadData() {
this.setState({ dataLoading: true, dataError: null });
try {
const data = await AccessData.metadata();
const features = await AccessData.places(data.catalog.default_borough);
const named = features.map(f => f.properties).filter(p => p.name_en_method !== 'category_and_source_id_fallback');
this.setState({ ...data, samplePlaces: named.slice(0,3), dataReady: true, dataLoading: false });
} catch (error) { this.setState({ dataLoading: false, dataError: error.message }); }
}
componentWillUnmount() { clearInterval(this.modeTimer); clearInterval(this.cardTimer); }
renderVals() {
const S = this.state;
const mode = S.mode || 'visit';
const V = mode === 'visit';
const auto = S.auto !== false;
const step = S.step || 0;
const cycle = S.cycle || 0;
const IC = {
food: 'M7 3v8M5 3v4a2 2 0 0 0 4 0V3M7 11v10M17 3c-2 0-3 2-3 5s1 4 3 4v9',
park: 'M12 3l5 7h-3l4 6H6l4-6H7zM12 16v5',
museum: 'M3 9l9-5 9 5M5 10v8M9.5 10v8M14.5 10v8M19 10v8M3 20h18',
shop: 'M5 8h14l-1 12H6zM9 8V6a3 3 0 0 1 6 0v2',
toilet: 'M10 4a2 2 0 1 0 0 .01M9 8v6h6l2 5M9 11h5M7.5 12.5a5 5 0 1 0 7 5.5',
visit: 'M12 21s-6-5.5-6-11a6 6 0 0 1 12 0c0 5.5-6 11-6 11zM12 10h.01',
map: 'M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z',
go: 'M3 11l18-8-8 18-2-8z'
};
const save = (m, b) => { try { localStorage.setItem('al-mode', m); if (b) localStorage.setItem('al-boro', b); else localStorage.removeItem('al-boro'); } catch (e) {} };
const stop = () => this.setState({ auto: false });
const PINS = [
[18, 20, 'food'], [34, 30, 'shop'], [50, 15, 'museum'], [61, 42, 'food'], [74, 22, 'park'],
[87, 40, 'toilet'], [68, 67, 'museum'], [83, 78, 'food'], [53, 62, 'shop'], [92, 16, 'food'],
[53, 33, 'museum'], [51, 49, 'food'], [43, 63, 'park']
];
const vStat = ['fit', 'fit', 'fit', 'fit', 'unknown', 'fit', 'nofit', 'fit', 'fit', 'unknown', 'fit', 'fit', 'fit'];
const mStat = ['gap', 'known', 'gap', 'gap', 'known', 'gap', 'gap', 'known', 'gap', 'gap', 'gap', 'gap', 'known'];
let narrow = false;
try { narrow = window.innerWidth < 760; } catch (e) {}
const featured = S.samplePlaces || [];
const indices = narrow ? [11,10,12] : [3,5,6];
const vCards = [0,1,2].map((i) => ({ pin: indices[i], name: featured[i]?.name_en || 'Loading real places…', meta: 'Hackney · OSM source', tags: [['Wheelchair: ' + (featured[i]?.wheelchair_access || 'unknown'), 'q']] }));
const mCards = [0,1,2].map((i) => ({ pin: indices[i], name: featured[i]?.name_en || 'Loading real places…', meta: 'Add a local observation', tags: [['Detailed access needs review', 'q']] }));
const cardsSrc = V ? vCards : mCards;
const activePin = cardsSrc[step % 3].pin;
const pins = PINS.map((p, i) => {
const on = i === activePin;
let bg, border, fg, op = 1, iconOp = 1, size = 44;
if (V) {
const st = vStat[i];
if (st === 'fit') { bg = '#2F6B3C'; border = '3px solid #F2F3DC'; fg = '#F2F3DC'; }
else if (st === 'unknown') { bg = '#F2F3DC'; border = '3px dashed #8E8F78'; fg = '#5C5D4C'; }
else { bg = '#CFCDB8'; border = '3px solid #F2F3DC'; fg = '#5C5D4C'; op = 0.8; }
} else {
const st = mStat[i];
if (st === 'gap') { bg = '#FBF6EC'; border = '3px dashed #B4562A'; fg = '#8A3B1C'; }
else { bg = '#8DB866'; border = '3px solid #F7EEDD'; fg = '#F7EEDD'; size = 22; iconOp = 0; op = 0.85; }
}
if (on) size = 56;
return { x: p[0] + '%', y: p[1] + '%', icon: IC[p[2]], bg: bg, border: border, fg: fg, op: op, iconOp: iconOp,
size: size + 'px', margin: (-size / 2) + 'px 0 0 ' + (-size / 2) + 'px',
shadow: on ? (V ? '0 0 0 12px rgba(47,107,60,0.18)' : '0 0 0 12px rgba(232,135,58,0.25)') : '0 6px 14px rgba(31,48,24,0.18)' };
});
const tagStyle = (k) => k === 'y' ? { bg: '#DCE7C4', fg: '#1F4A2A', border: 'none' } : k === 'q' ? { bg: '#FBF6EC', fg: '#7A3A12', border: '1.5px dashed #B4562A' } : { bg: '#F6E3CC', fg: '#7A3A12', border: 'none' };
const cards = cardsSrc.map((c, i) => {
const on = i === step % 3;
const p = PINS[c.pin];
return { x: p[0] + '%', y: p[1] + '%', name: c.name, meta: c.meta, op: on ? 1 : 0,
tf: 'translate(-50%, calc(-100% - 36px)) scale(' + (on ? 1 : 0.92) + ')',
tags: c.tags.map((t) => Object.assign({ text: (t[1] === 'y' ? '✓ ' : '') + t[0] }, tagStyle(t[1]))) };
});
const B = AccessData.tiles(S.boroughs);
const greens = ['#E3E9C9', '#C2D69E', '#8DB866', '#4E8A4F', '#2A5E35'];
const oranges = ['#F6E9D2', '#F2C994', '#E8973F', '#C2602A', '#7E3417'];
const gl = (s) => s < 45 ? 0 : s < 55 ? 1 : s < 65 ? 2 : s < 78 ? 3 : 4;
const ol = (m) => m < 45 ? 0 : m < 60 ? 1 : m < 72 ? 2 : m < 82 ? 3 : 4;
const tiles = [];
for (let r = 0; r < 7; r++) for (let c = 0; c < 8; c++) {
const b = B.find((x) => x[2] === r && x[3] === c);
if (!b) { tiles.push({ isTile: false, isEmpty: true }); continue; }
const low = b[5] < 15, miss = Math.round((100 - b[5]) * 10) / 10, on = S.tile === b[0];
tiles.push({ isTile: true, isEmpty: false, pressed: on ? 'true' : 'false',
label: V ? b[1] + (low ? ', low OSM tag coverage' : ', ' + b[4] + ' out of 100') : b[1] + ', ' + miss + '% of places unknown',
bg: V ? (low ? '#DCDAC8' : greens[gl(b[4])]) : oranges[ol(miss)],
border: on ? '3px solid #26261F' : (V && low ? '2px dashed #8E8F78' : 'none'),
pick: () => this.setState({ tile: b[0], auto: false }) });
}
const tb = B.find((x) => x[0] === S.tile);
const tileText = !tb ? (V ? 'Tap a borough. Darker means a higher OSM tag score.' : 'Tap a borough. Darker has more gaps.') : (V ? (tb[5] < 15 ? tb[1] + ': low tag coverage' : tb[1] + ': ' + tb[4] + ' out of 100') : tb[1] + ': ' + (100 - tb[5]).toFixed(1) + '% unknown');
const anim = (cycle % 2 ? 'hmprogA' : 'hmprogB') + ' 4s linear forwards';
const land = V ? '#E8EBD2' : '#F1E6D2';
return {
dataLoading: !!S.dataLoading, dataError: S.dataError || '', dataReady: !!S.dataReady, retryData: () => this.loadData(),
dataSummary: '74,500 real OSM objects · 33 boroughs · Snapshot 18 Oct 2026',
land: land,
parkA: V ? '#B2D08F' : '#E3D2A8', parkB: V ? '#A3C47E' : '#DAC79A',
river: V ? '#9CC7C0' : '#C3D3C8', roadEdge: V ? '#D8D5B8' : '#E0D2B6',
treeA: V ? '#6FA35A' : '#CDB27E', treeB: V ? '#4E8A4F' : '#B89B62',
visitFig: V ? 1 : 0, mapFig: V ? 0 : 1,
fade: V ? 'radial-gradient(115% 95% at 0% 100%, rgba(232,235,210,0.98) 0%, rgba(232,235,210,0.9) 32%, rgba(232,235,210,0) 62%)' : 'radial-gradient(115% 95% at 0% 100%, rgba(241,230,210,0.98) 0%, rgba(241,230,210,0.9) 32%, rgba(241,230,210,0) 62%)',
dark: V ? '#1F4A2A' : '#8A3B1C',
pins: pins, cards: cards,
modes: [
{ label: 'Explore', icon: IC.visit, pressed: V ? 'true' : 'false', bg: V ? '#2F6B3C' : 'transparent', fg: V ? '#F2F3DC' : '#26261F',
barColor: '#C2D69E', barW: V && auto ? '0' : '0', anim: V && auto ? anim : 'none', pick: () => { this.setState({ mode: 'visit', auto: false, step: 0, tile: null }); } },
{ label: 'Contribute', icon: IC.map, pressed: V ? 'false' : 'true', bg: V ? 'transparent' : '#E8873A', fg: '#26261F',
barColor: '#8A3B1C', barW: '0', anim: !V && auto ? anim : 'none', pick: () => { this.setState({ mode: 'map', auto: false, step: 0, tile: null }); } }
],
togglePause: () => this.setState({ auto: !auto }),
pauseLabel: auto ? 'Stop switching between visitor and mapper' : 'Start switching between visitor and mapper',
showPlay: !auto, showPauseIcon: auto,
isVisit: V, isMap: !V,
sub: V ? 'Find places, check stations and explore access details across London — in one map.' : 'Share dated evidence about an entrance, lift, ramp or toilet. Help others plan with better information.',
homeDestination: V ? 'map.html' : 'observations.html',
cta: V ? 'Explore the map' : 'Share an observation', ctaIcon: V ? IC.go : IC.map,
ctaBg: V ? '#26261F' : '#E8873A', ctaFg: V ? '#F2F3DC' : '#26261F',
goCurrent: () => save('visit', null), goVisit: () => save('visit', null), goTile: () => save('visit', S.tile),
tiles: tiles, tileText: tileText, hasTile: !!tb
};
}
}
