/* global L */
import { h, formatDate, escapeHTML, ICONS, placeLine, toast } from '../ui.js';
import { concerts, isPast, itemImage, state, inkFor } from '../store.js';
import { nav } from '../nav.js';
import { loadWorld, countryAt } from '../world.js';

// Default view: the UK and Western Europe.
const EUROPE = [[35.5, -11], [60.5, 17]];

// Street-level map tiles, tried in order. If one won't load on this phone the next is
// used, and if none load the built-in country map underneath still shows.
const TILE_SOURCES = [
  {
    url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  },
  {
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Tiles &copy; Esri',
  },
  {
    url: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
    subdomains: 'abcd',
  },
];
const WORLD_ATTRIBUTION = 'Countries: <a href="https://www.naturalearthdata.com">Natural Earth</a>';

let root;
let map;
let tiles;
let tileIndex = 0;
let markers;
let countriesLayer;
let visitedLayer;
let world;
let stats;
let dirty = true;

export function mount(el) {
  root = el;
  stats = h('button.map-stats', { type: 'button', onclick: explainMissing });
  root.replaceChildren(
    h('div#map'),
    stats,
    h('div.map-buttons',
      h('button.map-btn', { type: 'button', 'aria-label': 'Show all my shows', title: 'Show all my shows', onclick: fitAll, html: ICONS.pin }),
      h('button.map-btn', { type: 'button', 'aria-label': 'Back to Europe', title: 'Back to Europe', onclick: () => map?.flyToBounds(EUROPE, { duration: 0.8 }), html: ICONS.globe })),
  );
  document.addEventListener('themechange', () => { styleCountries(); styleTiles(); });
  window.addEventListener('resize', () => map?.invalidateSize());
}

export function show() {
  if (!map) init();
  // Leaflet needs a nudge after its container goes from hidden to visible.
  requestAnimationFrame(() => map.invalidateSize());
  if (dirty) drawMarkers();
}

export function refresh(change) {
  if (change.type === 'settings' && change.key === 'mapStyle') { setTiles(); return; }
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
    maxZoom: 18,
    attributionControl: true,
  });
  map.attributionControl.setPrefix('<a href="https://leafletjs.com">Leaflet</a>');
  // Layer order: built-in countries < street tiles < visited-country tint < pins.
  map.createPane('countries').style.zIndex = 150;
  map.createPane('visited').style.zIndex = 250;
  map.getPane('visited').style.pointerEvents = 'none';
  map.fitBounds(EUROPE);
  setTiles();
  markers = L.layerGroup().addTo(map);
  map.on('popupopen', (e) => {
    e.popup.getElement()?.querySelector('[data-open]')?.addEventListener('click', (ev) => {
      nav.openConcert(ev.currentTarget.dataset.open);
    });
  });

  loadWorld().then((fc) => {
    world = fc;
    countriesLayer = L.geoJSON(fc, { pane: 'countries', interactive: false, style: countryStyle, attribution: WORLD_ATTRIBUTION }).addTo(map);
    drawVisited();
  }).catch(() => {});
}

const isDark = () => document.documentElement.dataset.theme === 'dark';

function countryStyle() {
  return isDark()
    ? { color: '#4a4a52', weight: 0.8, fillColor: '#26262b', fillOpacity: 1 }
    : { color: '#b9b4a8', weight: 0.8, fillColor: '#f4f1ea', fillOpacity: 1 };
}

function styleCountries() {
  countriesLayer?.setStyle(countryStyle);
  drawVisited();
}

function styleTiles() {
  map?.getPane('tilePane')?.classList.toggle('tiles-dark', isDark());
}

function setTiles() {
  if (!map) return;
  if (tiles) { map.removeLayer(tiles); tiles = null; }
  styleTiles();
  if (state.settings.mapStyle === 'simple' || tileIndex >= TILE_SOURCES.length) return;
  const src = TILE_SOURCES[tileIndex];
  let loaded = 0;
  let failed = 0;
  tiles = L.tileLayer(src.url, {
    attribution: src.attribution,
    subdomains: src.subdomains || 'abc',
    maxZoom: 19,
    crossOrigin: false,
  });
  tiles.on('tileload', () => { loaded++; });
  tiles.on('tileerror', () => {
    failed++;
    // This source isn't working on this phone: move on to the next one.
    if (loaded === 0 && failed >= 4) {
      tileIndex++;
      setTiles();
    }
  });
  tiles.addTo(map);
}

/** Tint the countries where you've been to a show. */
function drawVisited() {
  if (!map || !world) return;
  visitedLayer?.remove();
  const hit = new Map();
  for (const c of concerts()) {
    if (c.venue?.lat == null || !isPast(c)) continue;
    const f = countryAt(world, c.venue.lat, c.venue.lon);
    if (f) hit.set(f.id ?? f.properties.name, f);
  }
  const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#e8174a';
  visitedLayer = L.geoJSON({ type: 'FeatureCollection', features: [...hit.values()] }, {
    pane: 'visited',
    interactive: false,
    style: { color: accent, weight: 1.4, fillColor: accent, fillOpacity: isDark() ? 0.22 : 0.16 },
  }).addTo(map);
}

function explainMissing() {
  const missing = concerts().filter((c) => c.venue?.lat == null);
  if (missing.length) {
    toast(`${missing.map((c) => c.artist).slice(0, 3).join(', ')}${missing.length > 3 ? '…' : ''}: open the ticket → ⋯ → Edit details and pick the venue from the list.`);
  }
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
  const missing = concerts().filter((c) => c.venue?.lat == null).length;
  stats.textContent = past.length
    ? `${past.length} show${past.length === 1 ? '' : 's'} · ${countries.size} countr${countries.size === 1 ? 'y' : 'ies'}`
    : 'Add a concert to drop your first pin';
  if (missing) stats.textContent += ` · ${missing} not on map`;
  stats.classList.toggle('has-missing', !!missing);
  drawVisited();
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
