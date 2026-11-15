(function () {
  'use strict';

  const cfg = window.ACCESS_ANSWERS || {};
  const API = cfg.api || '/api/answers';
  const summaries = {};        // placeId -> the server's summary for that place
  let watching = null;         // the open borough: { code, onChange, timer }
  let state = 'connecting';
  const listeners = [];
  const setState = (s) => { if (s !== state) { state = s; listeners.forEach((f) => f(s)); } };


  function deviceId() {
    try {
      let id = localStorage.getItem('al-device');
      if (!id) { id = Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4); localStorage.setItem('al-device', id); }
      return id;
    } catch (e) { return 'tmp-' + Math.random().toString(36).slice(2, 12); }
  }
  const me = deviceId();

  function outbox(next) {
    try {
      if (next) localStorage.setItem('al-outbox', JSON.stringify(next));
      return JSON.parse(localStorage.getItem('al-outbox') || '[]');
    } catch (e) { return next || []; }
  }

  async function load(code) {
    try {
      const res = await fetch(API + '?borough=' + encodeURIComponent(code) + '&device=' + encodeURIComponent(me), { cache: 'no-store' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = await res.json();
      Object.assign(summaries, data.places);
      setState('live');
      flush();
    } catch (e) {
      console.warn('Answers API:', e.message);
      setState('offline');
    }
    if (watching && watching.code === code) watching.onChange();
  }


  let flushing = false;

  async function flush() {
    if (flushing) return;
    flushing = true;
    let waiting = outbox();
    while (waiting.length) {
      const o = waiting[0];
      try {
        const res = await fetch(API, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ place_id: o.place, device_id: me, ans: o.ans })
        });
        if (res.status >= 500 || res.status === 429) throw new Error('HTTP ' + res.status);   // try again later
        const data = await res.json();
        if (res.ok) summaries[o.place] = data.summary;
        else console.warn('Answer refused:', data.error);
        waiting = waiting.slice(1);
        outbox(waiting);
        setState('live');
      } catch (e) {
        setState('offline');
        break;
      }
    }
    flushing = false;
    if (watching) watching.onChange();
  }

  function start() {
    window.addEventListener('online', flush);
    flush();
  }

  function watch(code, onChange) {
    if (watching) clearInterval(watching.timer);
    watching = { code, onChange, timer: null };
    load(code);
    watching.timer = setInterval(() => { if (!document.hidden) load(code); }, (cfg.refreshSeconds || 20) * 1000);
  }

  function send(code, placeId, ans) {
    outbox(outbox().concat([{ code, place: placeId, ans }]));
    return flush();
  }

  // The map expects "devices" for the number of people who answered.
  function result(placeId) {
    const s = summaries[placeId];
    return s ? Object.assign({ devices: s.people }, s) : { ent: null, toilet: null, lift: null, devices: 0, simulated: 0, latest: '' };
  }

  window.Answers = {
    start, watch, send, result,
    mine: (placeId) => !!(summaries[placeId] && summaries[placeId].mine),
    places: () => Object.keys(summaries),
    status: () => state,
    onStatus: (f) => listeners.push(f)
  };
})();
