import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
const root = resolve(import.meta.dirname, '..');
const read = (file) => readFileSync(resolve(root, file), 'utf8');
const html = read('front-end/map.html');
const css = read('front-end/css/map.css');
const controller = read('front-end/js/map-ui.js');

test('home opens the real London map without preselecting Newham', () => {
  assert.match(read('front-end/index.html'), /url=map\.html\"/);
  assert.doesNotMatch(read('front-end/index.html'), /url=map\.html#NWM/);
});
test('logo returns to the full London map and the borough chooser is optional', () => {
  assert.match(html, /onClick=\"\{\{goHome\}\}\"/);
  assert.match(controller, /pick: \(\) => this\.openArea\(b\[8\]\)/);
  assert.doesNotMatch(html, /onClick=\"\{\{openBoro\}\}\"/);
  assert.match(html, /Boroughs<\/button>/);
  assert.match(html, /Back to the London map/);
  assert.match(controller, /async goHome\(/);
  assert.match(controller, /async openArea\(/);
});
test('map page links separate CSS and JavaScript', () => {
  assert.match(html, /href="css\/map\.css"/);
  assert.match(html, /src="js\/map-ui\.js"/);
  assert.doesNotMatch(html, /<style>/);
  assert.doesNotMatch(html, /<script type="text\/x-dc">/);
});
test('all essential external map and API modules stay referenced', () => {
  for (const name of ['map-look','london-map','london-data','answers-config','answers','dc-runtime']) {
    assert.match(html, new RegExp('js/' + name + '\\.js'));
    assert.ok(existsSync(resolve(root, 'front-end/js', name+'.js')));
  }
});
test('template still preserves the MapLibre container and user controls', () => {
  for (const marker of ['data-dc-preserve', 'id="lm"', '{{modes}}', '{{needs}}', '{{cats}}', '{{results}}', '{{gaps}}', '{{opts}}']) {
    assert.ok(html.includes(marker), 'missing '+marker);
  }
});
test('all existing core UI operations remain in the separate controller', () => {
  for (const fn of ['openArea','loadIndex','goSearch','pick','locate','share','renderVals']) {
    assert.match(controller, new RegExp(fn+'\\s*\\('));
  }
  for (const action of ['confirmPlace','flagClosed','sendReport','confirmRight','startNext','qBack','act:']) {
    assert.ok(controller.includes(action), 'missing '+action);
  }
});
test('CSS contains map, floating panel and responsive layout', () => {
  for (const rule of ['.ma-stage','.ma-panel','@container app','.ma-top','.ma .map-shell']) {
    assert.ok(css.includes(rule), 'missing '+rule);
  }
});
test('original API paths preserved by external controller and modules', () => {
  assert.match(controller,/\/api\/boroughs/);
  assert.match(controller,/\/api\/stations/);
  assert.match(controller,/\/api\/search-index/);
  assert.match(read('front-end/js/london-data.js'),/\/api\/places/);
  assert.match(read('front-end/js/answers-config.js'),/\/api\/answers/);
});

test('full-London map loads aggregate counts and on-demand viewport places', () => {
  const map = read('front-end/js/london-map.js');
  const places = read('back-end/routes/places.js');
  const answers = read('back-end/routes/answers.js');
  for (const text of ['places/overview', 'places/viewport', 'places/locate', 'places/detail'])
    assert.ok(places.includes(text), text + ' endpoint missing');
  assert.match(map, /clusterProperties/);
  assert.match(map, /openLondon/);
  assert.match(map, /setMaxBounds\(null\)/);
  assert.match(controller, /handleMapMove/);
  assert.match(controller, /Answers\.watch\('all'/);
  assert.match(answers, /borough !== 'all'/);
});
test('review screen still requires explicit submit before sending', () => {
  assert.match(html, /Review your answers/);
  assert.match(controller, /reviewSubmit:/);
  assert.match(controller, /this\.share\(S\.cur, draft\)/);
});


test('city clustering uses exact coordinates, not rounded grid centres', () => {
  const routes = read('back-end/routes/places.js');
  const map = read('front-end/js/london-map.js');
  assert.match(routes, /SELECT p\.lon, p\.lat FROM places p/);
  assert.doesNotMatch(routes, /ROUND\(lon, 2\)/);
  assert.match(map, /cluster: true/);
  assert.match(map, /clusterMaxZoom: 13/);
});

test('accessibility filters accept only YES, in city counts and street markers', () => {
  const routes = read('back-end/routes/places.js');
  const map = read('front-end/js/london-map.js');
  assert.match(routes, /COALESCE\(ca_ent\.value, p\.wheelchair\) = 'yes'/);
  assert.match(routes, /COALESCE\(ca_toilet\.value, p\.toilet\) = 'yes'/);
  assert.match(map, /function visitorFilter\(\)/);
  assert.match(map, /rule\.needs\.map/);
  assert.match(controller, /chosen\.every\(\(k\) => D\.answer\(f\.properties, k\) === 'yes'\)/);
  assert.match(controller, /updateOverview\(cats, activeNeeds, overviewKey\)/);
});

test('UK postcode search works in suggestions and with Enter, via the API', () => {
  const routes = read('back-end/routes/places.js');
  assert.match(routes, /router\.get\('\/postcode'/);
  assert.match(routes, /api\.postcodes\.io/);
  assert.match(controller, /go: \{ postcode: normalisedPostcode \}/);
  assert.match(controller, /\/api\/postcode\?postcode=/);
  assert.match(controller, /e\.key === 'Enter'/);
});

test('short interface labels and no extra zoom hint', () => {
  assert.match(html, />Accessibility<\/span>/);
  assert.match(html, />Places<\/span>/);
  assert.match(html, />Use my location<\/button>/);
  assert.doesNotMatch(html, /What do you need\?|Kinds of place/);
  assert.doesNotMatch(controller, /Zoom in to explore individual places/);
});

test('about logo and footer go directly to the real map; map logo is compact', () => {
  const about = read('front-end/about.html');
  assert.match(about, /class="logo pill" href="map\.html"/);
  assert.match(about, /href="map\.html">Home<\/a>/);
  assert.match(css, /\.ma-top > \.ma-logo/);
  assert.match(css, /width: fit-content/);
});
