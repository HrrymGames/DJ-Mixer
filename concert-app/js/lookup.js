// Internet lookups. All free, no API keys, and every one fails quietly:
// if something can't be found the user just types it in.
//
//   Artists + photos  -> Deezer (JSONP), Wikipedia as a fallback for photos
//   Venues + location -> Photon (OpenStreetMap search)
//   Venue capacity    -> OpenStreetMap tags via Nominatim, then Wikidata
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

const regionNames = typeof Intl.DisplayNames === 'function' ? new Intl.DisplayNames(['en'], { type: 'region' }) : null;
const SHORT_COUNTRY = { GB: 'UK', US: 'USA', AE: 'UAE' };

export function countryName(code, fallback = '') {
  if (!code) return fallback;
  const c = code.toUpperCase();
  if (SHORT_COUNTRY[c]) return SHORT_COUNTRY[c];
  try { return regionNames?.of(c) || fallback; } catch { return fallback; }
}

const VENUE_KEYS = new Set(['amenity', 'leisure', 'building', 'tourism', 'historic']);

/** Suggestions while typing a venue. */
export async function searchVenues(query) {
  if (query.trim().length < 2) return [];
  try {
    const res = await fetchJSON(`https://photon.komoot.io/api/?q=${encodeURIComponent(query)}&limit=8&lang=en`);
    const list = (res.features || []).map((f) => {
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
        kind: p.osm_key || '',
      };
    }).filter((v) => v.lat != null);
    // Real venues (stadiums, arenas, clubs, theatres) before streets and towns.
    return list.sort((a, b) => (VENUE_KEYS.has(b.kind) ? 1 : 0) - (VENUE_KEYS.has(a.kind) ? 1 : 0));
  } catch {
    return [];
  }
}

function km(lat1, lon1, lat2, lon2) {
  const r = (d) => (d * Math.PI) / 180;
  const a = Math.sin(r(lat2 - lat1) / 2) ** 2 + Math.cos(r(lat1)) * Math.cos(r(lat2)) * Math.sin(r(lon2 - lon1) / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(a));
}

const parseCapacity = (v) => {
  const n = parseInt(String(v).replace(/[^\d]/g, ''), 10);
  return Number.isFinite(n) && n > 0 ? n : null;
};

async function wikidataEntities(ids) {
  const res = await fetchJSON(`https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${ids.join('|')}&props=claims|labels&languages=en&format=json&origin=*`);
  return res.entities || {};
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

/** Venue capacity from OpenStreetMap tags, else Wikidata. Returns a number or null. */
export async function findVenueCapacity(venue) {
  let wikidataId = null;
  if (venue.osmType && venue.osmId) {
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
    // Search Wikidata by name and only trust a match that is near the venue on the map.
    const search = await fetchJSON(`https://www.wikidata.org/w/api.php?action=wbsearchentities&search=${encodeURIComponent(venue.name)}&language=en&type=item&limit=6&format=json&origin=*`);
    const ids = (search.search || []).map((s) => s.id);
    if (!ids.length) return null;
    const ents = await wikidataEntities(ids);
    for (const id of ids) {
      const cap = claimCapacity(ents[id]);
      if (!cap) continue;
      const c = claimCoords(ents[id]);
      if (venue.lat != null && c && km(venue.lat, venue.lon, c.lat, c.lon) < 3) return cap;
    }
  } catch { /* give up */ }
  return null;
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
