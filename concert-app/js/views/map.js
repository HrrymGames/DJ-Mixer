/* global L */
import { h, formatDate, escapeHTML, ICONS, placeLine } from '../ui.js';
import { concerts, isPast, itemImage, state, inkFor } from '../store.js';
import { nav } from '../nav.js';

// Default view: the UK and Western Europe.
const EUROPE = [[35.5, -11], [60.5, 17]];
const TILES = {
  light: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
  dark: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
};
const ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>';

let root;
let map;
let tiles;
let markers;
let stats;
let dirty = true;

export function mount(el) {
  root = el;
  stats = h('div.map-stats');
  root.replaceChildren(
    h('div#map'),
    stats,
    h('div.map-buttons',
      h('button.map-btn', { type: 'button', 'aria-label': 'Show all my shows', title: 'Show all my shows', onclick: fitAll, html: ICONS.pin }),
      h('button.map-btn', { type: 'button', 'aria-label': 'Back to Europe', title: 'Back to Europe', onclick: () => map?.flyToBounds(EUROPE, { duration: 0.8 }), html: ICONS.globe })),
  );
  document.addEventListener('themechange', setTiles);
}

export function show() {
  if (!map) init();
  // Leaflet needs a nudge after its container goes from hidden to visible.
  requestAnimationFrame(() => map.invalidateSize());
  if (dirty) drawMarkers();
}

export function refresh(change) {
  if (['item', 'delete', 'reload', 'day'].includes(change.type) || (change.type === 'settings' && change.key === 'mapUpcoming')) {
    dirty = true;
    if (map && !root.hidden) drawMarkers();
  }
}

function init() {
  map = L.map('map', {
    zoomControl: false,
    worldCopyJump: true,
    minZoom: 2,
    attributionControl: true,
  });
  map.attributionControl.setPrefix('<a href="https://leafletjs.com">Leaflet</a>');
  map.fitBounds(EUROPE);
  setTiles();
  markers = L.layerGroup().addTo(map);
  map.on('popupopen', (e) => {
    e.popup.getElement()?.querySelector('[data-open]')?.addEventListener('click', (ev) => {
      nav.openConcert(ev.currentTarget.dataset.open);
    });
  });
}

function setTiles() {
  if (!map) return;
  const dark = document.documentElement.dataset.theme === 'dark';
  if (tiles) map.removeLayer(tiles);
  tiles = L.tileLayer(dark ? TILES.dark : TILES.light, {
    attribution: ATTRIBUTION,
    subdomains: 'abcd',
    maxZoom: 19,
    detectRetina: false,
  }).addTo(map);
}

function shownConcerts() {
  return concerts().filter((c) => c.venue?.lat != null && (state.settings.mapUpcoming || isPast(c)));
}

function drawMarkers() {
  dirty = false;
  markers.clearLayers();
  const list = shownConcerts();

  // Several shows at the same venue: fan the pins out around the spot.
  const groups = new Map();
  for (const c of list) {
    const key = `${c.venue.lat.toFixed(4)},${c.venue.lon.toFixed(4)}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(c);
  }

  for (const group of groups.values()) {
    group.sort((a, b) => a.date.localeCompare(b.date));
    group.forEach((c, i) => {
      const angle = (i / group.length) * Math.PI * 2 - Math.PI / 2;
      const spread = group.length > 1 ? 22 : 0;
      const dx = Math.round(Math.cos(angle) * spread);
      const dy = Math.round(Math.sin(angle) * spread);
      const upcoming = !isPast(c);
      const pin = document.createElement('div');
      pin.className = `pin${upcoming ? ' pin-upcoming' : ''}`;
      pin.style.setProperty('--tc', c.color);
      pin.innerHTML = `<div class="pin-photo"><span>${escapeHTML((c.artist || '?')[0].toUpperCase())}</span></div><div class="pin-tail"></div>`;
      itemImage(c).then((src) => {
        if (!src) return;
        const img = new Image();
        img.alt = '';
        img.onload = () => pin.querySelector('.pin-photo').append(img);
        img.src = src;
      });
      const icon = L.divIcon({ html: pin, className: 'pin-wrap', iconSize: [48, 58], iconAnchor: [24 - dx, 58 - dy], popupAnchor: [dx, -60 + dy] });
      L.marker([c.venue.lat, c.venue.lon], { icon, title: c.artist, riseOnHover: true })
        .bindPopup(popupHTML(c, upcoming), { closeButton: false, className: 'pin-popup', maxWidth: 260, minWidth: 230, autoPanPaddingTopLeft: [16, 90], autoPanPaddingBottomRight: [16, 120] })
        .addTo(markers);
    });
  }

  const past = list.filter(isPast);
  const countries = new Set(past.map((c) => c.venue.countryCode || c.venue.country).filter(Boolean));
  stats.textContent = past.length
    ? `${past.length} show${past.length === 1 ? '' : 's'} · ${countries.size} countr${countries.size === 1 ? 'y' : 'ies'}`
    : 'Add a concert to drop your first pin';
}

function popupHTML(c, upcoming) {
  const ink = inkFor(c.color);
  return `<div class="popup-card" style="--tc:${c.color};--tink:${ink}">
    <div class="popup-top">${upcoming ? 'Upcoming' : 'Attended'}</div>
    <strong>${escapeHTML(c.artist)}${c.tour ? ` <span>– ${escapeHTML(c.tour)}</span>` : ''}</strong>
    <p>${escapeHTML(c.venue.name)}<br>${escapeHTML(placeLine(c.venue))}</p>
    <p class="popup-date">${escapeHTML(formatDate(c.date))}</p>
    <button type="button" data-open="${escapeHTML(c.id)}">Open ticket</button>
  </div>`;
}

function fitAll() {
  const list = shownConcerts();
  if (!list.length) return;
  if (list.length === 1) { map.flyTo([list[0].venue.lat, list[0].venue.lon], 12, { duration: 0.8 }); return; }
  map.flyToBounds(L.latLngBounds(list.map((c) => [c.venue.lat, c.venue.lon])).pad(0.2), { duration: 0.8, maxZoom: 12 });
}
