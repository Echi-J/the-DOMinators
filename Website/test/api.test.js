// api.test.js — checks the API end to end against your MySQL database.
// Start the server first (npm start), then in a second terminal: npm test
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { db } from '../back-end/db.js';

const BASE = 'http://localhost:' + (process.env.PORT || 3000) + '/api';
const get = async (path) => (await fetch(BASE + path)).json();
const post = (body) => fetch(BASE + '/answers', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

// Two made-up test people. Their rows are deleted at the end.
const people = ['test-person-one', 'test-person-two'];
const code = (id) => createHash('sha256').update('device:' + id).digest('hex').slice(0, 16);
after(async () => {
  await db.query('DELETE FROM answers WHERE person IN (?)', [people.map(code)]);
  await db.end();
});

test('the data is in MySQL', async () => {
  const health = await get('/health');
  assert.equal(health.database, 'mysql');
  assert.equal((await get('/boroughs')).length, 33);
  assert.ok((await get('/places?borough=E09000012')).features.length > 2000);
  assert.ok((await get('/stations')).length > 400);
});

test('simulated surveys are stored as answers and labelled', async () => {
  const museum = (await get('/answers?borough=E09000012')).places['osm:node/1558137005']; // Hackney Museum
  assert.ok(museum.people > 20);
  assert.equal(museum.simulated, museum.people);
});

test('bad answers are refused', async () => {
  const ok = { place_id: 'osm:node/1558137005', device_id: people[0], ans: { ent: 'yes' } };
  assert.equal((await post({ ...ok, place_id: 'osm:node/0' })).status, 400);           // not a real place
  assert.equal((await post({ ...ok, device_id: 'x' })).status, 400);                    // odd device id
  assert.equal((await post({ ...ok, ans: { ent: 'maybe' } })).status, 400);             // not an allowed answer
  assert.equal((await post({ ...ok, ans: { toilet: 'one' } })).status, 400);            // "one floor" is only for the lift
  assert.equal((await post({ ...ok, ans: {} })).status, 400);                           // nothing answered
});

test('two people agreeing confirms an answer; one person cannot count twice', async () => {
  // A place with no answers yet: the first named place in Bexley with an unknown tag
  const [[place]] = await db.query(
    "SELECT id FROM places WHERE borough_code = 'E09000004' AND has_real_name AND wheelchair = 'unknown' AND id NOT IN (SELECT place_id FROM answers) LIMIT 1");
  const send = (person, ent) => post({ place_id: place.id, device_id: person, ans: { ent } }).then((r) => r.json());

  let s = (await send(people[0], 'yes')).summary;
  assert.equal(s.ent.confirmed, false, 'one person is not enough');

  s = (await send(people[0], 'yes')).summary;
  assert.equal(s.people, 1, 'the same person answering again replaces their answer');
  assert.equal(s.ent.confirmed, false);

  s = (await send(people[1], 'yes')).summary;
  assert.equal(s.ent.confirmed, true, 'two people agree');

  s = (await send(people[1], 'no')).summary;
  assert.equal(s.ent.confirmed, false, 'a disagreement undoes it');
  assert.equal(s.ent.disagree, true);
});


test('full-London aggregated and viewport endpoints are available', async () => {
  const overview = await get('/places/overview');
  assert.equal(overview.type, 'FeatureCollection');
  assert.ok(overview.features.length > 100);
  assert.ok(overview.features.every((p) => p.properties.count > 0));

  const filtered = await get('/places/overview?cats=park');
  assert.ok(filtered.features.length > 0);
  const count = (fc) => fc.features.reduce((n, p) => n + p.properties.count, 0);
  assert.ok(count(filtered) < count(overview), 'parks are a subset of all places');
  const stepFree = await get('/places/overview?needs=ent');
  const toilet = await get('/places/overview?needs=toilet');
  const both = await get('/places/overview?needs=ent,toilet');
  assert.ok(count(stepFree) <= count(overview));
  assert.ok(count(toilet) <= count(overview));
  assert.ok(count(both) <= Math.min(count(stepFree), count(toilet)), 'two needs combine with AND');
  assert.ok(overview.features.some((f) => String(f.geometry.coordinates[0]).split('.')[1]?.length > 2),
    'real locations, not rounded 0.01-degree grid coordinates');
  const badNeed = await fetch(BASE + '/places/overview?needs=bogus');
  assert.equal(badNeed.status, 400);


  const viewport = await get('/places/viewport?west=-0.15&south=51.50&east=-0.08&north=51.54');
  assert.equal(viewport.type, 'FeatureCollection');
  assert.ok(viewport.features.length > 0);
  assert.ok(viewport.features.length <= 10000);
  assert.ok(viewport.features.every((p) => p.geometry.type === 'Point'));
});

test('London-wide answers and a place locator remain readable', async () => {
  const answers = await get('/answers?borough=all');
  assert.ok(answers.places && typeof answers.places === 'object');
  const at = await get('/places/locate?id=osm%3Anode%2F1558137005');
  assert.ok(Number.isFinite(at.lon) && Number.isFinite(at.lat));
  const details = await get('/places/detail?id=osm%3Anode%2F1558137005');
  assert.ok(typeof details === 'object');
});
