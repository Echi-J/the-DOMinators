/*
 * answers.js — Mapper answers, shared through MQTT, and the "two people agree" rule.
 *
 *   Answers.start()                         connect (or stay on this device if no broker is set)
 *   Answers.watch(boroughCode, onChange)    get every answer for a borough, now and as they arrive
 *   Answers.send(boroughCode, placeId, ans) ans = { ent: 'yes', toilet: 'no', lift: 'unsure' }
 *   Answers.result(placeId)                 { ent: { value, count, confirmed }, toilet: ..., lift: ... }
 *   Answers.mine(placeId) / Answers.status()
 *
 * How it's stored: one retained MQTT message per device per place, on
 *   <topic>/answers/<borough code>/<place key>/<device id>
 * Answering the same place again from the same device replaces your earlier answer, so one
 * device can never count twice. (A device id is a random code kept in this browser. It isn't
 * a login: someone determined could fake several, which is the price of no sign-up.)
 *
 * The rule (Zhaoji's): an answer is confirmed when at least two devices give the same definite
 * answer and none disagrees. "Not sure" doesn't count either way.
 */
(function () {
  'use strict';

  const cfg = window.ACCESS_ANSWERS || {};
  const QUESTIONS = ['ent', 'toilet', 'lift'];
  // what each answer means on the map ("One floor only" for the lift counts as partly)
  const MEANS = { yes: 'yes', no: 'no', one: 'partly', partly: 'partly' };
  const byPlace = {};          // placeId -> { deviceId -> { ent, toilet, lift, at } }
  const watchers = {};         // borough code -> callback
  let client = null;
  let state = cfg.url ? 'connecting' : 'local';
  const listeners = [];

  function deviceId() {
    try {
      let id = localStorage.getItem('al-device');
      if (!id) { id = Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4); localStorage.setItem('al-device', id); }
      return id;
    } catch (e) { return 'no-storage-' + Math.random().toString(36).slice(2, 8); }
  }
  const me = deviceId();
  // MQTT topics use "/" between levels, so place ids like "osm:node/123" become "osm-node-123".
  const keyOf = (placeId) => placeId.replace(/[:/#+]/g, '-');
  const setState = (s) => { state = s; listeners.forEach((f) => f(s)); };

  function start() {
    if (!cfg.url || client) return;
    if (!window.mqtt) { console.warn('mqtt.js not loaded'); setState('local'); return; }
    client = window.mqtt.connect(cfg.url, {
      username: cfg.username || undefined, password: cfg.password || undefined,
      clientId: 'access-london-' + me + '-' + Math.random().toString(16).slice(2, 6),
      reconnectPeriod: 5000, connectTimeout: 8000, clean: true
    });
    client.on('connect', () => { setState('live'); for (const code in watchers) client.subscribe(cfg.topic + '/answers/' + code + '/#', { qos: 1 }); });
    client.on('reconnect', () => setState('connecting'));
    client.on('offline', () => setState('offline'));
    client.on('error', (e) => { console.warn('MQTT', e && e.message); setState('offline'); });
    client.on('message', receive);
  }

  // A message arrives (all the stored ones when we subscribe, then new ones live).
  function receive(topic, buf) {
    const parts = topic.split('/');
    const code = parts[parts.length - 3];
    let msg;
    try { msg = JSON.parse(buf.toString()); } catch (e) { return; }
    // Only accept answers in the shape we send; ignore anything else on the topic.
    if (!msg || msg.v !== 1 || typeof msg.place !== 'string' || typeof msg.device !== 'string' || typeof msg.ans !== 'object') return;
    if (keyOf(msg.place) !== parts[parts.length - 2] || msg.device !== parts[parts.length - 1]) return;
    const clean = {};
    for (const q of QUESTIONS) if (['yes', 'no', 'partly', 'one', 'unsure'].includes(msg.ans[q])) clean[q] = msg.ans[q];
    clean.at = String(msg.at || '').slice(0, 30);
    (byPlace[msg.place] = byPlace[msg.place] || {})[msg.device] = clean;
    changed(code);
  }

  let timers = {};
  function changed(code) {
    clearTimeout(timers[code]);
    timers[code] = setTimeout(() => watchers[code] && watchers[code](), 150); // many arrive at once on subscribe
  }

  function watch(code, onChange) {
    for (const c in watchers) if (c !== code && client && client.connected) client.unsubscribe(cfg.topic + '/answers/' + c + '/#');
    for (const c in watchers) delete watchers[c];
    watchers[code] = onChange;
    if (client && client.connected) client.subscribe(cfg.topic + '/answers/' + code + '/#', { qos: 1 });
  }

  function send(code, placeId, ans) {
    const msg = { v: 1, place: placeId, device: me, at: new Date().toISOString(), ans };
    // Keep it here straight away, so this device sees its own answer even offline.
    receive(cfg.topic + '/answers/' + code + '/' + keyOf(placeId) + '/' + me, JSON.stringify(msg));
    if (!client) return Promise.resolve('local');
    // retain: the broker keeps it for everyone who opens the map later. mqtt.js holds it
    // and sends it when the connection comes back, if it's down right now.
    return new Promise((res) => client.publish(cfg.topic + '/answers/' + code + '/' + keyOf(placeId) + '/' + me,
      JSON.stringify(msg), { qos: 1, retain: true }, (err) => res(err ? 'queued' : 'sent')));
  }

  // The two-agree rule, for each question at one place.
  function result(placeId) {
    const devices = Object.values(byPlace[placeId] || {});
    const out = {};
    for (const q of QUESTIONS) {
      const counts = {};
      for (const a of devices) { const m = MEANS[a[q]]; if (m) counts[m] = (counts[m] || 0) + 1; }
      const values = Object.keys(counts).sort((a, b) => counts[b] - counts[a]);
      const top = values[0];
      out[q] = top ? { value: top, count: counts[top], confirmed: counts[top] >= 2 && values.length === 1, disagree: values.length > 1 } : null;
    }
    out.devices = devices.length;
    out.latest = devices.map((d) => d.at).sort().pop() || '';
    return out;
  }

  window.Answers = {
    start, watch, send, result,
    mine: (placeId) => !!(byPlace[placeId] && byPlace[placeId][me]),
    places: () => Object.keys(byPlace),
    status: () => state,
    onStatus: (f) => listeners.push(f)
  };
})();
