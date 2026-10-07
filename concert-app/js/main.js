import { loadAll, state, subscribe, todayISO, concerts, getItem, saveItem } from './store.js';
import { resolveVenue, findVenueCapacity, findArtistImage, findTour } from './lookup.js';
import * as mapView from './views/map.js';
import * as ticketsView from './views/tickets.js';
import * as wishlistView from './views/wishlist.js';
import * as settingsView from './views/settings.js';
import * as detailView from './views/detail.js';
import { nav } from './nav.js';

const TABS = { map: mapView, tickets: ticketsView, wishlist: wishlistView, settings: settingsView };
const viewEl = (tab) => document.getElementById(`view-${tab}`);
const detailEl = document.getElementById('view-detail');

let currentTab = null;
let detailId = null;
let detailFromTab = 'tickets';

// ---------- theme ----------
const systemDark = matchMedia('(prefers-color-scheme: dark)');
function applyTheme() {
  const t = state.settings.theme;
  const dark = t === 'dark' || (t === 'system' && systemDark.matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.setAttribute('content', dark ? '#000000' : '#f2f2f7'));
  document.dispatchEvent(new CustomEvent('themechange', { detail: { dark } }));
}
systemDark.addEventListener?.('change', applyTheme);

// ---------- navigation ----------
function showTab(tab, { push = true } = {}) {
  if (!TABS[tab]) tab = 'tickets';
  closeDetail({ push: false });
  if (currentTab !== tab) {
    Object.keys(TABS).forEach((t) => { viewEl(t).hidden = t !== tab; });
    currentTab = tab;
    TABS[tab].show?.();
  }
  document.querySelectorAll('.tab').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
  if (push) history.replaceState(null, '', `#${tab}`);
}

function openConcert(id, { push = true } = {}) {
  detailFromTab = currentTab || 'tickets';
  detailId = id;
  Object.keys(TABS).forEach((t) => { viewEl(t).hidden = true; });
  detailEl.hidden = false;
  detailEl.scrollTop = 0;
  detailView.open(detailEl, id);
  if (push) history.pushState({ detail: id }, '', `#concert/${id}`);
}

function closeDetail({ push = true } = {}) {
  if (!detailId) return;
  detailId = null;
  detailView.close();
  detailEl.hidden = true;
  detailEl.replaceChildren();
  if (currentTab) viewEl(currentTab).hidden = false;
  TABS[currentTab]?.show?.();
  if (push) history.replaceState(null, '', `#${currentTab}`);
}

function goBack() {
  if (history.state?.detail) history.back();
  else closeDetail();
}

window.addEventListener('popstate', () => {
  const m = location.hash.match(/^#concert\/(.+)$/);
  if (m) openConcert(m[1], { push: false });
  else { closeDetail({ push: false }); showTab(location.hash.slice(1) || currentTab, { push: false }); }
});

document.getElementById('tabbar').addEventListener('click', (e) => {
  const btn = e.target.closest('.tab');
  if (!btn) return;
  if (detailId && btn.dataset.tab === detailFromTab) { goBack(); return; }
  if (btn.dataset.tab === currentTab && !detailId) {
    viewEl(currentTab).scrollTo({ top: 0, behavior: 'smooth' });
    return;
  }
  showTab(btn.dataset.tab);
});

// ---------- keep everything in sync ----------
subscribe((change) => {
  if (change.type === 'settings' && change.key === 'theme') applyTheme();
  Object.values(TABS).forEach((v) => v.refresh?.(change));
  if (detailId) detailView.refresh(change);
});

// Upcoming shows move into the main list once their date has passed,
// so re-check when the app comes back to the foreground or the day changes.
let lastDay = todayISO();
function checkDay() {
  const d = todayISO();
  if (d !== lastDay) {
    lastDay = d;
    Object.values(TABS).forEach((v) => v.refresh?.({ type: 'day' }));
  }
}
document.addEventListener('visibilitychange', () => { if (!document.hidden) checkDay(); });
setInterval(checkDay, 60_000);

nav.openConcert = (id) => openConcert(id);
nav.goBack = goBack;

// ---------- start ----------
async function start() {
  applyTheme();
  await loadAll();
  Object.entries(TABS).forEach(([tab, v]) => v.mount(viewEl(tab)));
  const m = location.hash.match(/^#concert\/(.+)$/);
  const hashTab = location.hash.slice(1);
  showTab(TABS[hashTab] ? hashTab : state.settings.startTab, { push: true });
  if (m && state.items.some((i) => i.id === m[1])) {
    history.replaceState(null, '', `#${currentTab}`);
    openConcert(m[1]);
  }
}

start().then(backfill);
// Back online after being offline: fill in anything that was added without signal.
window.addEventListener('online', () => setTimeout(backfill, 1500));

let backfilling = false;
async function backfill() {
  if (backfilling) return;
  backfilling = true;
  try {
    await backfillOffline();
    await backfillVenues();
  } finally {
    backfilling = false;
  }
}

/** Concerts / wishlist added with no signal: find the artist photo and tour now. */
async function backfillOffline() {
  if (!state.settings.autoLookup || !navigator.onLine) return;
  for (const item of state.items.filter((i) => i.pendingLookup)) {
    const fresh = getItem(item.id);
    if (!fresh) continue;
    const patch = {};
    if (!fresh.artistImage && !fresh.ownImageId) {
      const img = await findArtistImage(fresh.artist);
      if (!img) return; // probably still no signal – try again later
      patch.artistImage = img;
    }
    if (fresh.kind === 'concert' && !fresh.tour) {
      const tour = await findTour(fresh.artist, fresh.date);
      if (tour) Object.assign(patch, { tour: tour.name, eventType: tour.type });
    }
    const latest = getItem(item.id);
    if (latest) await saveItem({ ...latest, ...patch, pendingLookup: false });
  }
}

/**
 * Concerts saved without a map location (or capacity), e.g. because the venue search
 * couldn't be reached at the time: quietly look them up again in the background.
 */
async function backfillVenues() {
  if (!state.settings.autoLookup || !navigator.onLine) return;
  const todo = concerts().filter((c) => c.venue?.name && (c.venue.lat == null || c.capacity == null) && !c.venueChecked);
  for (const c of todo) {
    try {
      const fresh = getItem(c.id);
      if (!fresh) continue;
      const venue = { ...fresh.venue };
      let capacity = fresh.capacity;
      if (venue.lat == null) {
        const found = await resolveVenue(venue.name, venue.city);
        if (found) {
          Object.assign(venue, { lat: found.lat, lon: found.lon, wikidataId: found.wikidataId || null,
            city: venue.city || found.city, country: venue.country || found.country, countryCode: venue.countryCode || found.countryCode || '' });
          if (capacity == null) capacity = found.capacity || null;
        }
      }
      if (capacity == null && venue.lat != null) capacity = await findVenueCapacity(venue);
      // Re-read in case it was edited while we were looking things up.
      const latest = getItem(c.id);
      if (!latest) continue;
      await saveItem({
        ...latest,
        venue: latest.venue.lat == null ? venue : latest.venue,
        capacity: latest.capacity ?? capacity ?? null,
        venueChecked: true,
      });
    } catch {
      // Search unreachable right now: leave it to try again next time the app opens.
      return;
    }
  }
}

if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
