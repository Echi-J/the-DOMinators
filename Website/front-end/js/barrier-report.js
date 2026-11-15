(function () {
  'use strict';

  var NAMES = {
    blocked_pavement: 'Blocked pavement',
    uneven_surface: 'Uneven surface',
    step_or_kerb: 'Step or high kerb',
    narrow_passage: 'Narrow passage',
    other: 'Other problem',
    unspecified: 'Problem reported'
  };

  var options = {};      // what the map page gave us in init()
  var point = null;      // the chosen location, [longitude, latitude]
  var photo = null;      // the photo as a small JPEG data URL, or null
  var lastFocus = null;  // the button that opened a dialog, so focus can go back to it

  function inLondon(p) {
    if (!p || p.length !== 2) return false;
    return p[0] >= -0.6 && p[0] <= 0.4 && p[1] >= 51.2 && p[1] <= 51.75;
  }

  function say(text) {
    document.getElementById('br-status').textContent = text || '';
  }

  // Show the chosen location in the form.
  function setLocation(p, label) {
    var box = document.getElementById('br-location');
    point = p;
    if (p) {
      // toFixed(5) keeps 5 decimal places, about 1 metre.
      box.textContent = (label || 'Selected point') + ' (' + p[1].toFixed(5) + ', ' + p[0].toFixed(5) + ')';
      box.classList.remove('br-missing');
    } else {
      box.textContent = 'No location yet.';
      box.classList.add('br-missing');
    }
  }

  // Empty the form before it is opened again.
  function reset() {
    document.getElementById('br-form').reset();
    document.getElementById('br-photo-name').textContent = 'No file chosen';
    photo = null;
    say('');
    document.getElementById('br-photo-state').textContent = 'Optional. Avoid showing faces or number plates.';
    setLocation(null);
  }

  function open(o) {
    var contextText = '';
    o = o || {};
    lastFocus = document.activeElement;
    reset();
    if (o.context === 'route') contextText = 'Reporting a problem on or near your route.';
    if (o.context === 'place') contextText = 'Reporting a problem near this place.';
    document.getElementById('br-context').textContent = contextText;
    document.getElementById('br-context').hidden = (contextText === '');
    if (o.point && inLondon(o.point)) setLocation(o.point, o.label);
    document.getElementById('br-dialog').showModal();
    // Put the keyboard focus on the first thing the person still has to do.
    if (point) document.getElementById('br-type').focus();
    else document.getElementById('br-gps').focus();
  }

  function close() {
    document.getElementById('br-dialog').close();
    if (lastFocus && document.contains(lastFocus)) lastFocus.focus();
  }

  function useGps() {
    if (!navigator.geolocation) {
      say('This browser cannot share your location. Choose the point on the map instead.');
      return;
    }
    say('Finding your location…');
    navigator.geolocation.getCurrentPosition(showPosition, showError,
      { enableHighAccuracy: true, timeout: 11000, maximumAge: 30000 });
  }
  function showPosition(position) {
    var p = [position.coords.longitude, position.coords.latitude];
    if (!inLondon(p)) {
      say('Your location is outside the London map. Choose the point on the map instead.');
      return;
    }
    setLocation(p, 'Your current location');
    say('Location added. Check this is where the problem is.');
  }
  function showError() {
    say('Location not available. Choose the point on the map instead.');
  }

  function pickOnMap() {
    if (!options.requestMapPick) return;
    document.getElementById('br-dialog').close();
    options.requestMapPick(function (p) {
      var dialog = document.getElementById('br-dialog');
      if (!dialog.open) dialog.showModal();
      if (p) {
        setLocation(p, 'Point chosen on the map');
        say('Location added.');
        document.getElementById('br-type').focus();
      } else {
        say('No point chosen.');
      }
    });
  }

  function compress(file, done) {
    if (file.type.indexOf('image/') !== 0) { done('Choose an image file.'); return; }
    if (file.size > 12 * 1024 * 1024) { done('Photo is too large. Choose one below 12 MB.'); return; }
    var url = URL.createObjectURL(file);
    var img = new Image();
    img.onload = function () {
      var scale = Math.min(1, 1100 / Math.max(img.naturalWidth, img.naturalHeight));
      var canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      // Lower the JPEG quality step by step until the photo is small enough for the server.
      var quality = 0.75;
      var data = canvas.toDataURL('image/jpeg', quality);
      while (data.length > 1100000 && quality > 0.36) {
        quality = quality - 0.12;
        data = canvas.toDataURL('image/jpeg', quality);
      }
      if (data.length > 1200000) done('Photo is still too large. Choose a smaller image.');
      else done(null, data);
    };
    img.onerror = function () {
      URL.revokeObjectURL(url);
      done('This photo could not be opened. Choose another image.');
    };
    img.src = url;
  }

  function photoChosen() {
    var file = document.getElementById('br-photo').files[0];
    document.getElementById('br-photo-name').textContent = file ? file.name : 'No file chosen';
    var state = document.getElementById('br-photo-state');
    photo = null;
    if (!file) return;
    state.textContent = 'Preparing photo…';
    compress(file, function (error, data) {
      if (error) { state.textContent = error; return; }
      photo = data;
      state.textContent = 'Photo ready. Check it shows no faces or number plates.';
    });
  }

  // Send the report. The browser checks the form first, then POSTs it to our API.
  async function submit(event) {
    var type = document.getElementById('br-type').value;
    var note = document.getElementById('br-note').value.trim();
    var button = document.getElementById('br-submit');
    event.preventDefault(); // stay on the page; we send the data with fetch instead
    if (!point) {
      say('Add the location first: use your location or choose it on the map.');
      document.getElementById('br-gps').focus();
      return;
    }
    if (!photo && type === 'unspecified' && note === '') {
      say('Choose what the problem is, add a photo or describe it.');
      document.getElementById('br-type').focus();
      return;
    }
    button.disabled = true;
    button.textContent = 'Sending…';
    say('Sending your report…');
    try {
      var response = await fetch('/api/barriers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lon: point[0], lat: point[1], type: type, note: note, photo: photo })
      });
      var data = {};
      try { data = await response.json(); } catch (ignore) { data = {}; }
      if (!response.ok) throw new Error(data.error || 'The report could not be sent. Please try again.');
      close();
      if (options.onSent) options.onSent('Thanks. Your report was received and will appear on the map after review.');
    } catch (error) {
      say(error.message);
    } finally {
      button.disabled = false;
      button.textContent = 'Send report';
    }
  }

  // A date like "13 Nov 2026".
  function friendlyDate(value) {
    var d = new Date(value);
    if (isNaN(d.getTime())) return 'date not available';
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  // Show one approved report in the details dialog.
  function showDetail(r) {
    var body, when, text, img, warn;
    if (!r) return;
    lastFocus = document.activeElement;
    body = document.getElementById('bd-body');
    body.innerHTML = '';
    document.getElementById('bd-title').textContent = NAMES[r.type] || 'Reported problem';

    when = document.createElement('p');
    when.textContent = 'Reported ' + friendlyDate(r.created_at) + (r.reviewed_at ? ', reviewed ' + friendlyDate(r.reviewed_at) : '') + '.';
    body.appendChild(when);

    text = document.createElement('p');
    text.textContent = r.note || 'No extra details were given.'; // textContent, so a note can never inject HTML
    body.appendChild(text);

    if (r.has_photo) {
      img = document.createElement('img');
      img.alt = 'Photo sent with this report';
      img.src = '/api/barriers/' + encodeURIComponent(r.id) + '/photo';
      body.appendChild(img);
    }

    warn = document.createElement('p');
    warn.className = 'br-note';
    warn.textContent = 'Community report, checked by a reviewer. The problem may have been fixed since.';
    body.appendChild(warn);

    document.getElementById('bd-dialog').showModal();
    document.getElementById('bd-close').focus();
  }

  function closeDetail() {
    document.getElementById('bd-dialog').close();
    if (lastFocus && document.contains(lastFocus)) lastFocus.focus();
  }

  // Connect the buttons once the page is ready.
  function init(o) {
    options = o || {};
    document.getElementById('br-gps').addEventListener('click', useGps);
    document.getElementById('br-pick').addEventListener('click', pickOnMap);
    document.getElementById('br-close').addEventListener('click', close);
    document.getElementById('br-cancel').addEventListener('click', close);
    document.getElementById('br-form').addEventListener('submit', submit);
    document.getElementById('br-photo').addEventListener('change', photoChosen);
    document.getElementById('bd-close').addEventListener('click', closeDetail);
    document.getElementById('bd-done').addEventListener('click', closeDetail);
  }

  // The only names other files can use.
  window.BarrierReport = { init: init, open: open, showDetail: showDetail, NAMES: NAMES };
})();
