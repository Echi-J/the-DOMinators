// unified-journey.test.js — static checks for Find → Understand → Go → Contribute on one map.
// These read the source files only (no server). Browser behaviour was checked separately.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
const root = resolve(import.meta.dirname, '..');
const read = (file) => readFileSync(resolve(root, file), 'utf8');
const html = read('front-end/map.html');
const ui = read('front-end/js/map-ui.js');
const map = read('front-end/js/london-map.js');
const report = read('front-end/js/barrier-report.js');

test('the original Visitor/Mapper switch and Mapper theme are unchanged', () => {
  assert.match(html, /class="ma-glass mode-switch"/);
  assert.match(html, /\{\{modes\}\}/);
  assert.match(ui, /label: 'Mapper', icon: IC\.map/);
  assert.match(ui, /mode: 'map'/);                    // Mapper still switches the map to its own theme
  assert.match(ui, /fillGap: \(\) => selP && startFlow\(selP\.id\)/);
  assert.match(html, /<h1 class="text-45">\{\{areaName\}\}<\/h1>/); // original list heading
});

test('the place panel button says Get directions and opens the route panel', () => {
  assert.match(html, /onClick="\{\{act\.dir\}\}" class="row-22"[\s\S]*?Get directions<\/span>/);
  assert.match(ui, /dir: function \(\) \{ if \(selF\) self\.openRoute\(selF\); \}/);
  assert.match(ui, /goOptions: function \(\)/);     // the original Getting there page is still reachable
  assert.match(html, /\{\{pVGo\}\}/);
});

test('Get directions keeps the selected place and its coordinates as destination', () => {
  assert.match(ui, /coordinates: \[f\.geometry\.coordinates\[0\], f\.geometry\.coordinates\[1\]\]/);
  assert.match(ui, /end: rt\.dest\.coordinates/);
  assert.match(ui, /feature\(id, kept\)/); // survives viewport reloads
});

test('start can be GPS, a map point or a search, and the existing ORS route API is reused', () => {
  assert.match(ui, /useGpsStart\(\)/);
  assert.match(ui, /startPick\('Tap or click the map where you are starting from\.'/);
  assert.match(ui, /\/api\/journey\/search\?q=/);
  assert.match(ui, /\/api\/postcode\?postcode=/);
  assert.match(ui, /fetch\('\/api\/journey\/route'/);
});

test('route and reviewed barriers are shown together on the same map', () => {
  assert.match(ui, /LondonData\.getJSON\('\/api\/barriers'\)/);
  assert.match(ui, /JourneyGeometry\.nearRoute\(\[this\.barriers\[i\]\.lon, this\.barriers\[i\]\.lat\], line, 80\)/);
  assert.match(map, /addSource\('route'/);
  assert.match(map, /addSource\('barriers'/);
  assert.match(html, /js\/journey-geometry\.js/);
});

test('report a problem from the header, a place and a route; reports stay moderated', () => {
  assert.match(html, /onClick="\{\{openReport\}\}"/);
  assert.match(html, /onClick="\{\{reportHere\}\}"/);
  assert.match(html, /onClick="\{\{rt\.report\}\}"/);
  assert.match(report, /fetch\('\/api\/barriers'/);
  assert.match(report, /after review/);
  assert.match(html, /<dialog id="br-dialog"/);
  assert.match(html, /capture="environment"/);
});

test('Mapper answers keep the explicit submit', () => {
  assert.match(ui, /this\.share\(S\.cur, draft\)/);
  assert.match(html, /Review your answers/);
});
