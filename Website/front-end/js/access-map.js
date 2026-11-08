/* Leaflet owns only the preserved map island; DCLogic owns the surrounding UI. */
(function (global) {
  'use strict';
  class AccessMap {
    constructor(element, component) {
      this.element = element; this.component = component;
      this.map = L.map(element, { zoomControl: false, preferCanvas: true, attributionControl: true, scrollWheelZoom: false }).setView([51.5074, -0.1278], 11);
      this.map.attributionControl.setPrefix('<a href="https://leafletjs.com">Leaflet</a>');
      this.map.attributionControl.setPosition('bottomright');
      this.map.attributionControl.addAttribution('© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>');
      this.markers = L.layerGroup().addTo(this.map);
      this.boundaries = L.layerGroup().addTo(this.map);
      this.tiles = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 });
      // Automated QA can disable network tiles without changing geographic overlays.
      if (!new URLSearchParams(location.search).has('noTiles')) this.tiles.addTo(this.map);
      this.tiles.on('tileerror', () => { if (!this.tileWarning) { this.tileWarning = true; component.notify('Street tiles are unavailable. Place positions, borough outlines and the list still work.'); } });
      this.resize = new ResizeObserver(() => this.map.invalidateSize()); this.resize.observe(element);
    }
    reveal() {
      this.map.invalidateSize(); this.key = null; this.borough = null;
      if (this.view) this.update(this.view);
    }
    update(view) {
      this.view = view;
      if (this.key === view.key) return;
      this.key = view.key;
      if (this.borough !== view.borough) {
        this.borough = view.borough; this.boundaries.clearLayers();
        const feature = view.boundaries?.features.find(f => f.properties.borough_code === view.borough);
        if (feature) {
          const layer = L.geoJSON(feature, { style: { color: '#2F6B3C', weight: 2, fillOpacity: 0.08 } }).addTo(this.boundaries);
          this.map.fitBounds(layer.getBounds(), { padding: [30, 30] });
        }
      }
      this.markers.clearLayers();
      for (const row of view.rows) {
        const state = view.status(row), selected = row[0] === view.selected;
        const fill = view.mapper ? '#E8873A' : state === 'fit' ? '#2F6B3C' : state === 'unknown' ? '#FBFBF2' : '#AFAE98';
        const marker = L.circleMarker([row[4], row[3]], { radius: selected ? 10 : 5.5, color: selected ? '#233A6B' : '#4B4C3D', weight: selected ? 3 : 1.5, fillColor: fill, fillOpacity: 0.9, dashArray: state === 'unknown' ? '3 2' : null }).addTo(this.markers);
        const label = document.createElement('span'); label.textContent = row[1]; marker.bindTooltip(label);
        marker.on('click', () => view.open(row[0]));
        if (selected) { marker.bringToFront(); marker.openTooltip(); }
      }
      if (this.origin) this.map.removeLayer(this.origin);
      if (view.origin) this.origin = L.circleMarker([view.origin.latitude, view.origin.longitude], { color: '#233A6B', radius: 7, fillOpacity: 1 }).addTo(this.map);
      if (view.selected && this.lastSelected !== view.selected) {
        const place = view.rows.find(p => p[0] === view.selected);
        if (place) this.map.panTo([place[4], place[3]]);
      }
      this.lastSelected = view.selected;
    }
    destroy() { this.resize.disconnect(); this.map.remove(); }
  }
  global.AccessMap = AccessMap;
})(window);
