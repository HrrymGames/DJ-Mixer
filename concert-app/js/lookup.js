// Internet lookups. All free, no API keys, and every one fails quietly:
// if something can't be found the user just types it in.
//
//   Artists + photos  -> Deezer (JSONP), Wikipedia as a fallback for photos
//   Venues + location -> Photon (OpenStreetMap search) and Wikidata, in parallel
//   Venue capacity    -> Wikidata, OpenStreetMap tags via Nominatim
//   Tour / festival   -> Wikidata, then a Wikipedia search as a fallback

const TIMEOUT = 8000;

async function fetchJSON(url, { timeout = TIMEOUT, headers } = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeout);
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

// Deezer's API has no CORS headers but does support JSONP.
let jsonpCount = 0;
function jsonp(url, timeout = TIMEOUT) {
  return new Promise((resolve, reject) => {
    const cb = `__stubs_jsonp_${Date.now()}_${jsonpCount++}`;
    const script = document.createElement('script');
    const cleanup = () => { delete window[cb]; script.remove(); clearTimeout(timer); };
    const timer = setTimeout(() => { cleanup(); reject(new Error('timeout')); }, timeout);
    window[cb] = (data) => { cleanup(); resolve(data); };
    script.onerror = () => { cleanup(); reject(new Error('jsonp failed')); };
    script.src = `${url}${url.includes('?') ? '&' : '?'}output=jsonp&callback=${cb}`;
    document.head.appendChild(script);
  });
}

const norm = (s) => (s || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

// ---------------- artists ----------------

function deezerImage(a) {
  const url = a.picture_xl || a.picture_big || '';
  // Deezer returns a grey placeholder (empty hash in the path) for artists without a photo.
  return /\/artist\/\/|\/images\/artist\/\//.test(url) ? '' : url;
}

/** Suggestions while typing an artist name. */
export async function searchArtists(query) {
  if (!query.trim()) return [];
  try {
    const res = await jsonp(`https://api.deezer.com/search/artist?q=${encodeURIComponent(query)}&limit=6`);
    return (res.data || []).map((a) => ({ name: a.name, image: deezerImage(a), thumb: a.picture_medium || '', fans: a.nb_fan || 0 }));
  } catch {
    return [];
  }
}

/** Best photo for an artist name: Deezer first, then Wikipedia. */
export async function findArtistImage(name) {
  const hits = await searchArtists(name);
  const exact = hits.find((h) => norm(h.name) === norm(name) && h.image);
  if (exact) return exact.image;
  try {
    const page = await fetchJSON(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(name.replace(/ /g, '_'))}`);
    const img = page.originalimage?.source || page.thumbnail?.source;
    if (img) return img;
  } catch { /* fall through */ }
  return hits.find((h) => h.image)?.image || '';
}

// ---------------- venues ----------------
//
// Two sources are searched at the same time so one being slow or down doesn't
// break the suggestions:
//   Photon   – OpenStreetMap search, good city / country names
//   Wikidata – knows most arenas, stadiums and theatres, including their capacity

const regionNames = typeof Intl.DisplayNames === 'function' ? new Intl.DisplayNames(['en'], { type: 'region' }) : null;
const SHORT_COUNTRY = { GB: 'UK', US: 'USA', AE: 'UAE' };
const SHORT_COUNTRY_NAMES = { 'united kingdom': 'UK', 'united states': 'USA', 'united states of america': 'USA', 'united arab emirates': 'UAE' };

export function countryName(code, fallback = '') {
  if (!code) return shortCountry(fallback);
  const c = code.toUpperCase();
  if (SHORT_COUNTRY[c]) return SHORT_COUNTRY[c];
  try { return regionNames?.of(c) || shortCountry(fallback); } catch { return shortCountry(fallback); }
}

export function shortCountry(name) {
  return SHORT_COUNTRY_NAMES[(name || '').toLowerCase()] || name || '';
}

const VENUE_KEYS = new Set(['amenity', 'leisure', 'building', 'tourism', 'historic']);

function km(lat1, lon1, lat2, lon2) {
  const r = (d) => (d * Math.PI) / 180;
  const a = Math.sin(r(lat2 - lat1) / 2) ** 2 + Math.cos(r(lat1)) * Math.cos(r(lat2)) * Math.sin(r(lon2 - lon1) / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(a));
}

const parseCapacity = (v) => {
  const n = parseInt(String(v ?? '').replace(/[^\d]/g, ''), 10);
  return Number.isFinite(n) && n > 0 ? n : null;
};

const WD_API = 'https://www.wikidata.org/w/api.php';

async function wikidataEntities(ids, props = 'claims|labels') {
  if (!ids.length) return {};
  const res = await fetchJSON(`${WD_API}?action=wbgetentities&ids=${ids.slice(0, 50).join('|')}&props=${props}&languages=en&format=json&origin=*`);
  return res.entities || {};
}

/** Wikidata full-text search ("co op live" finds "Co-op Live"). Returns Q-ids. */
async function wikidataSearch(text, mustHave = 'P625', limit = 7) {
  const res = await fetchJSON(`${WD_API}?action=query&list=search&srsearch=${encodeURIComponent(`${text} haswbstatement:${mustHave}`)}&srnamespace=0&srlimit=${limit}&format=json&origin=*`);
  return (res.query?.search || []).map((s) => s.title).filter((t) => /^Q\d+$/.test(t));
}

function claimCapacity(entity) {
  const claims = entity?.claims?.P1083 || [];
  // Prefer the "preferred" rank (usually the current capacity).
  const best = claims.find((c) => c.rank === 'preferred') || claims.find((c) => c.rank !== 'deprecated');
  return best ? parseCapacity(best.mainsnak?.datavalue?.value?.amount) : null;
}

function claimCoords(entity) {
  const v = entity?.claims?.P625?.[0]?.mainsnak?.datavalue?.value;
  return v ? { lat: v.latitude, lon: v.longitude } : null;
}

const claimId = (entity, prop) => entity?.claims?.[prop]?.find((c) => c.rank !== 'deprecated')?.mainsnak?.datavalue?.value?.id || null;
const label = (entity) => entity?.labels?.en?.value || '';
const cleanPlace = (s) => s.replace(/^(City|Metropolitan Borough|London Borough|Royal Borough|Borough|County Borough) of /i, '').replace(/\s*\(.*\)$/, '');

async function photonVenues(query) {
  const res = await fetchJSON(`https://photon.komoot.io/api/?q=${encodeURIComponent(query)}&limit=8&lang=en`, { timeout: 7000 });
  return (res.features || []).map((f) => {
    const p = f.properties || {};
    const [lon, lat] = f.geometry?.coordinates || [];
    const code = (p.countrycode || '').toUpperCase();
    return {
      name: p.name || [p.housenumber, p.street].filter(Boolean).join(' ') || query,
      city: p.city || p.town || p.village || p.district || p.county || p.state || '',
      country: countryName(code, p.country || ''),
      countryCode: code,
      lat, lon,
      osmType: p.osm_type || '',
      osmId: p.osm_id || null,
      capacity: null,
      venueLike: VENUE_KEYS.has(p.osm_key),
      source: 'osm',
    };
  }).filter((v) => v.lat != null && v.lon != null);
}

async function wikidataVenues(query) {
  const ids = await wikidataSearch(query, 'P625');
  const ents = await wikidataEntities(ids);
  const places = new Set();
  const rows = ids.map((id) => {
    const e = ents[id];
    const c = claimCoords(e);
    if (!e || !c || !label(e)) return null;
    const city = claimId(e, 'P131');
    const country = claimId(e, 'P17');
    if (city) places.add(city);
    if (country) places.add(country);
    return { id, name: label(e), lat: c.lat, lon: c.lon, capacity: claimCapacity(e), cityId: city, countryId: country };
  }).filter(Boolean);
  const placeEnts = await wikidataEntities([...places], 'labels').catch(() => ({}));
  return rows.map((r) => ({
    name: r.name,
    city: cleanPlace(label(placeEnts[r.cityId])),
    country: shortCountry(label(placeEnts[r.countryId])),
    countryCode: '',
    lat: r.lat, lon: r.lon,
    osmType: '', osmId: null,
    capacity: r.capacity,
    wikidataId: r.id,
    venueLike: !!r.capacity,
    source: 'wikidata',
  }));
}

function nameScore(name, query) {
  const n = norm(name);
  const words = norm(query).split(' ').filter(Boolean);
  if (!words.length) return 0;
  if (n === words.join(' ')) return 3;
  return words.every((w) => n.includes(w)) ? 2 : words.some((w) => n.includes(w)) ? 1 : 0;
}

/**
 * Suggestions while typing a venue.
 * Returns {results, failed} – failed is true when no source could be reached at all.
 */
export async function searchVenues(query) {
  const q = query.trim();
  if (q.length < 2) return { results: [], failed: false };
  const [osm, wd] = await Promise.allSettled([photonVenues(q), wikidataVenues(q)]);
  const a = osm.status === 'fulfilled' ? osm.value : [];
  const b = wd.status === 'fulfilled' ? wd.value : [];

  // The same venue from both sources: keep OpenStreetMap's city/country, add Wikidata's capacity.
  const merged = [...a];
  for (const w of b) {
    const twin = merged.find((m) => km(m.lat, m.lon, w.lat, w.lon) < 1.5 && (nameScore(m.name, w.name) >= 2 || nameScore(w.name, m.name) >= 2));
    if (twin) {
      twin.capacity = twin.capacity || w.capacity;
      twin.wikidataId = w.wikidataId;
      twin.venueLike = true;
      twin.city = twin.city || w.city;
      twin.country = twin.country || w.country;
    } else {
      merged.push(w);
    }
  }
  const scored = merged.map((v, i) => ({ v, s: nameScore(v.name, q) * 10 + (v.venueLike ? 3 : 0) + (v.capacity ? 2 : 0) - i * 0.01 }));
  scored.sort((x, y) => y.s - x.s);
  return { results: scored.slice(0, 8).map((x) => x.v), failed: osm.status === 'rejected' && wd.status === 'rejected' };
}

/**
 * Best match for a venue typed by hand (no suggestion picked), e.g. "Co-op Live" + "Manchester".
 * Only returns something when the name clearly matches.
 */
export async function resolveVenue(name, city = '') {
  if (!name?.trim()) return null;
  const { results, failed } = await searchVenues(city ? `${name} ${city}` : name);
  if (failed) throw new Error('Venue search unreachable');
  let list = results;
  if (!list.length && city) list = (await searchVenues(name)).results;
  return list.find((v) => {
    const exactish = nameScore(v.name, name) >= 2 || nameScore(name, v.name) >= 2;
    const cityOk = !city || !v.city || norm(v.city).includes(norm(city)) || norm(city).includes(norm(v.city));
    return exactish && cityOk;
  }) || null;
}

/** Venue capacity from OpenStreetMap tags, else Wikidata. Returns a number or null. */
export async function findVenueCapacity(venue) {
  if (venue.capacity) return venue.capacity;
  let wikidataId = venue.wikidataId || null;
  if (!wikidataId && venue.osmType && venue.osmId) {
    try {
      const res = await fetchJSON(`https://nominatim.openstreetmap.org/lookup?osm_ids=${venue.osmType}${venue.osmId}&format=jsonv2&extratags=1`);
      const tags = res?.[0]?.extratags || {};
      const cap = parseCapacity(tags.capacity);
      if (cap) return cap;
      wikidataId = tags.wikidata || null;
    } catch { /* try Wikidata */ }
  }
  try {
    if (wikidataId) {
      const cap = claimCapacity((await wikidataEntities([wikidataId]))[wikidataId]);
      if (cap) return cap;
    }
    // Search Wikidata for places with a capacity, and only trust one that matches.
    const ids = await wikidataSearch(venue.name, 'P1083', 6);
    const ents = await wikidataEntities(ids);
    for (const id of ids) {
      const e = ents[id];
      const cap = claimCapacity(e);
      if (!cap) continue;
      const c = claimCoords(e);
      if (venue.lat != null && c) { if (km(venue.lat, venue.lon, c.lat, c.lon) < 3) return cap; }
      else if (nameScore(label(e), venue.name) === 3) return cap;
    }
  } catch { /* give up */ }
  return null;
}

/** For Settings → "Check connection": which online services this phone can reach. */
export async function checkServices() {
  const probe = async (name, fn) => {
    const t = performance.now();
    try { await fn(); return { name, ok: true, ms: Math.round(performance.now() - t) }; }
    catch (e) { return { name, ok: false, detail: e.message || String(e) }; }
  };
  const img = (url) => new Promise((resolve, reject) => {
    const i = new Image();
    const timer = setTimeout(() => reject(new Error('timeout')), 8000);
    i.onload = () => { clearTimeout(timer); resolve(); };
    i.onerror = () => { clearTimeout(timer); reject(new Error('blocked or offline')); };
    i.src = `${url}${url.includes('?') ? '&' : '?'}t=${Date.now()}`;
  });
  return Promise.all([
    probe('Artist search (Deezer)', async () => { const r = await jsonp('https://api.deezer.com/search/artist?q=coldplay&limit=1'); if (!r.data) throw new Error('bad reply'); }),
    probe('Venue search (OpenStreetMap)', () => photonVenues('Wembley Stadium')),
    probe('Venues & capacity (Wikidata)', () => wikidataSearch('Wembley Stadium')),
    probe('Capacity (Nominatim)', () => fetchJSON('https://nominatim.openstreetmap.org/lookup?osm_ids=W4244999&format=jsonv2')),
    probe('Map tiles (OpenStreetMap)', () => img('https://tile.openstreetmap.org/2/2/1.png')),
    probe('Map tiles (Esri)', () => img('https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/2/1/2')),
  ]);
}

// ---------------- tours & festivals ----------------

const addDays = (iso, n) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

/**
 * Which tour (or festival) was this artist playing on this date?
 * Returns {name, type: 'tour'|'festival', source} or null.
 */
export async function findTour(artist, dateISO) {
  if (!artist.trim() || !dateISO) return null;
  const name = artist.trim().replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  const query = `
    SELECT DISTINCT ?event ?eventLabel ?start ?end ?fest WHERE {
      ?artist rdfs:label "${name}"@en .
      ?event (wdt:P175|wdt:P710) ?artist .
      { ?event wdt:P31/wdt:P279* wd:Q24267 . BIND(false AS ?fest) }
      UNION
      { ?event wdt:P31/wdt:P279* wd:Q868557 . BIND(true AS ?fest) }
      OPTIONAL { ?event wdt:P580 ?start . }
      OPTIONAL { ?event wdt:P582 ?end . }
      OPTIONAL { ?event wdt:P585 ?start . }
      SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
    } LIMIT 300`;
  try {
    const res = await fetchJSON(`https://query.wikidata.org/sparql?format=json&query=${encodeURIComponent(query)}`, {
      timeout: 12000,
      headers: { Accept: 'application/sparql-results+json' },
    });
    const rows = (res.results?.bindings || []).map((b) => ({
      name: b.eventLabel?.value || '',
      start: b.start?.value?.slice(0, 10) || '',
      end: b.end?.value?.slice(0, 10) || '',
      fest: b.fest?.value === 'true',
    })).filter((r) => r.name && !/^Q\d+$/.test(r.name) && r.start);

    const fits = rows.filter((r) => {
      if (r.start > addDays(dateISO, 1)) return false;
      if (r.end) return dateISO <= addDays(r.end, 2);
      // No end date yet (e.g. a tour still going): accept if it started in the last ~2.5 years.
      return dateISO <= addDays(r.start, r.fest ? 4 : 913);
    });
    // The most specific match is the one that started most recently.
    fits.sort((a, b) => b.start.localeCompare(a.start));
    if (fits[0]) return { name: fits[0].name, type: fits[0].fest ? 'festival' : 'tour', source: 'wikidata' };
  } catch { /* try Wikipedia */ }

  try {
    const year = dateISO.slice(0, 4);
    const res = await fetchJSON(`https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(`intitle:tour "${artist}" ${year}`)}&srlimit=5&format=json&origin=*`);
    const hit = (res.query?.search || []).find((s) => /tour/i.test(s.title) && !/^list of/i.test(s.title)
      && norm(s.snippet).includes(norm(artist)) && (s.snippet.includes(year) || s.title.includes(year)));
    if (hit) return { name: hit.title.replace(/\s*\(.*\)$/, ''), type: 'tour', source: 'wikipedia' };
  } catch { /* nothing found */ }
  return null;
}
