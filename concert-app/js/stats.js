// Numbers for the Wrapped recap and the stats page, worked out from your past concerts.
import { concerts, isPast, state, todayISO } from './store.js';
import { guestKey } from './songs.js';
import { countryName } from './lookup.js';

const norm = (s) => (s || '').trim().toLowerCase().replace(/\s+/g, ' ');
const venueKey = (v) => `${norm(v?.name)}|${norm(v?.city)}`;
const countryKey = (v) => (v?.countryCode || v?.country || '').toUpperCase();

/** Past concerts, oldest first. */
export function pastShows() {
  return concerts().filter(isPast).sort((a, b) => a.date.localeCompare(b.date) || a.createdAt - b.createdAt);
}

/**
 * Which year's Wrapped to show. Each year's Wrapped arrives on Christmas Day and stays until
 * the next Christmas Day. The first one is 2026 (shown straight away), so nothing older ever shows.
 */
export function wrappedYear(today = todayISO()) {
  const year = Number(today.slice(0, 4));
  const shown = today.slice(5) >= '12-25' ? year : year - 1;
  return Math.max(2026, shown);
}

// ---------- distance ----------

export function milesBetween(a, b) {
  const rad = (d) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 3958.8 * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

/** Miles travelled to these shows and back from your home town (null if no home town is set). */
export function travel(shows) {
  const home = state.settings.home;
  if (!home || home.lat == null) return null;
  let miles = 0;
  let furthest = null;
  let counted = 0;
  for (const c of shows) {
    if (c.venue?.lat == null) continue;
    const d = milesBetween(home, c.venue);
    miles += d * 2;
    counted++;
    if (!furthest || d > furthest.miles) furthest = { miles: d, concert: c };
  }
  return { miles: Math.round(miles), furthest, counted, missing: shows.length - counted };
}

// ---------- counting helpers ----------

function tally(list, keyOf, labelOf) {
  const map = new Map();
  for (const x of list) {
    const key = keyOf(x);
    if (!key) continue;
    const entry = map.get(key) || { key, label: labelOf(x), count: 0, items: [] };
    entry.count++;
    entry.items.push(x);
    map.set(key, entry);
  }
  // Most first; ties go to whoever you saw most recently.
  return [...map.values()].sort((a, b) => b.count - a.count
    || b.items[b.items.length - 1].date.localeCompare(a.items[a.items.length - 1].date));
}

export const topArtists = (shows) => tally(shows, (c) => norm(c.artist), (c) => c.artist);
export const topVenues = (shows) => tally(shows, (c) => (c.venue?.name ? venueKey(c.venue) : ''), (c) => c.venue.name);

export function spots(shows) {
  return {
    seated: shows.filter((c) => c.spot === 'seated').length,
    standing: shows.filter((c) => c.spot === 'standing').length,
  };
}

export function showsPerYear(shows) {
  const map = new Map();
  for (const c of shows) map.set(c.date.slice(0, 4), (map.get(c.date.slice(0, 4)) || 0) + 1);
  if (!map.size) return [];
  // Every year from the first show to now, including years with none.
  const first = Number([...map.keys()].sort()[0]);
  const last = Number(todayISO().slice(0, 4));
  const out = [];
  for (let y = first; y <= last; y++) out.push({ year: String(y), count: map.get(String(y)) || 0 });
  return out;
}

// ---------- one year (Wrapped) ----------

export function yearStats(year) {
  const all = pastShows();
  const y = String(year);
  const shows = all.filter((c) => c.date.startsWith(y));
  const before = all.filter((c) => c.date < `${y}-01-01`);

  const seenVenues = new Set(before.map((c) => venueKey(c.venue)));
  const seenCountries = new Set(before.map((c) => countryKey(c.venue)).filter(Boolean));
  const newVenues = [];
  const newCountries = [];
  for (const c of shows) {
    if (c.venue?.name && !seenVenues.has(venueKey(c.venue))) { seenVenues.add(venueKey(c.venue)); newVenues.push(c.venue); }
    const ck = countryKey(c.venue);
    if (ck && !seenCountries.has(ck)) { seenCountries.add(ck); newCountries.push(countryName(c.venue.countryCode, c.venue.country) || c.venue.country); }
  }

  // Songs: the same song by the same artist at different shows counts each time. DJ openers aren't counted.
  const songs = tally(
    shows.flatMap((c) => (c.setlist || []).filter((s) => !s.dj && s.title?.trim()).map((s) => ({ ...s, artist: c.artist, date: c.date }))),
    (s) => `${norm(s.artist)}|${norm(s.title)}`,
    (s) => s.title.trim(),
  );

  // Special guests: once per show, best-capitalised name.
  const guestNames = new Map();
  const caps = (t) => (t.match(/[A-Z]/g) || []).length;
  for (const c of shows) {
    for (const s of c.setlist || []) {
      const name = (s.guest || '').trim().replace(/\s+/g, ' ');
      if (!name) continue;
      const key = guestKey(name);
      if (!guestNames.has(key) || caps(name) > caps(guestNames.get(key))) guestNames.set(key, name);
    }
  }

  return {
    year: y,
    shows,
    artists: topArtists(shows),
    venues: topVenues(shows),
    newVenues,
    newCountries,
    songs,
    songsHeard: songs.reduce((n, s) => n + s.count, 0),
    guests: [...guestNames.values()],
    crowd: shows.reduce((n, c) => n + (c.capacity || 0), 0),
    crowdKnown: shows.filter((c) => c.capacity).length,
    spots: spots(shows),
    travel: travel(shows),
  };
}
