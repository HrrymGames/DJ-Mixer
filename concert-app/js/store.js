import { db } from './db.js';
import { LINK_PREFIX, base64ToBlob } from './native.js';

// ---------- settings (small, kept in localStorage) ----------
const SETTINGS_KEY = 'stubs.settings';
const DEFAULT_SETTINGS = {
  theme: 'system',          // 'system' | 'light' | 'dark'
  startTab: 'tickets',      // tab shown when the app opens
  pastOrder: 'newest',      // 'newest' | 'oldest'
  showCountdown: true,      // "in 12 days" badge on upcoming tickets
  mapUpcoming: true,        // show upcoming shows on the map
  mapStyle: 'detailed',     // 'detailed' (street tiles) | 'simple' (built-in countries only)
  autoLookup: true,         // fill tour / capacity / photo from the internet
};

function loadSettings() {
  try { return { ...DEFAULT_SETTINGS, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}') }; }
  catch { return { ...DEFAULT_SETTINGS }; }
}

// ---------- state ----------
export const state = {
  items: [],               // concerts + wishlist entries
  settings: loadSettings(),
};

const listeners = new Set();
export function subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }
function emit(change) { listeners.forEach((fn) => fn(change)); }

export async function loadAll() {
  state.items = await db.getAll('items');
}

export function setSetting(key, value) {
  state.settings[key] = value;
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(state.settings)); } catch { /* private mode */ }
  emit({ type: 'settings', key });
}

// ---------- helpers ----------
export function uid() {
  return (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));
}

export function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** A show stays "upcoming" until the day after its date. */
export function isPast(concert) {
  return concert.date < todayISO();
}

export function daysUntil(dateISO) {
  const [y, m, d] = dateISO.split('-').map(Number);
  const target = new Date(y, m - 1, d);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((target - today) / 86400000);
}

/** Random, fairly vivid colour for a ticket's side bars. Picked once when a ticket is made. */
export function randomTicketColor() {
  const h = Math.floor(Math.random() * 360);
  const s = 45 + Math.floor(Math.random() * 45);   // 45–90%
  const l = 28 + Math.floor(Math.random() * 37);   // 28–65%
  return hslToHex(h, s, l);
}

function hslToHex(h, s, l) {
  s /= 100; l /= 100;
  const k = (n) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return '#' + [f(0), f(8), f(4)].map((x) => Math.round(x * 255).toString(16).padStart(2, '0')).join('');
}

/** Black or white, whichever reads better on the given colour. */
export function inkFor(hex) {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => {
    c /= 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return lum > 0.4 ? '#111111' : '#ffffff';
}

// ---------- queries ----------
export const concerts = () => state.items.filter((i) => i.kind === 'concert');
export const wishes = () => state.items.filter((i) => i.kind === 'wish')
  .sort((a, b) => b.createdAt - a.createdAt);
export const getItem = (id) => state.items.find((i) => i.id === id);

export function pastConcerts() {
  const list = concerts().filter(isPast).sort((a, b) => a.date.localeCompare(b.date) || a.createdAt - b.createdAt);
  return state.settings.pastOrder === 'newest' ? list.reverse() : list;
}

export function upcomingConcerts() {
  return concerts().filter((c) => !isPast(c)).sort((a, b) => a.date.localeCompare(b.date) || a.createdAt - b.createdAt);
}

// ---------- mutations ----------
export async function saveItem(item) {
  item.updatedAt = Date.now();
  await db.put('items', item);
  const i = state.items.findIndex((x) => x.id === item.id);
  if (i >= 0) state.items[i] = item; else state.items.push(item);
  emit({ type: 'item', id: item.id });
  return item;
}

export async function deleteItem(id) {
  const item = getItem(id);
  if (!item) return;
  const mediaIds = [
    ...(item.photoIds || []),
    ...(item.setlist || []).flatMap((s) => s.videoIds),
    ...(item.ownImageId ? [item.ownImageId] : []),
  ];
  await db.deleteMany('media', mediaIds);
  mediaIds.forEach(revokeMediaURL);
  await db.delete('items', id);
  state.items = state.items.filter((x) => x.id !== id);
  emit({ type: 'delete', id });
}

export function newConcert(fields) {
  return {
    id: uid(),
    kind: 'concert',
    artist: '',
    artistImage: '',      // URL found online
    ownImageId: null,     // or a photo the user picked (media id)
    tour: '',
    eventType: 'tour',    // 'tour' | 'festival'
    venue: { name: '', city: '', country: '', countryCode: '', lat: null, lon: null },
    capacity: null,
    date: todayISO(),
    color: randomTicketColor(),
    serial: Math.floor(1000 + Math.random() * 9000),
    setlist: [],          // [{id, title, videoIds: []}]
    photoIds: [],
    createdAt: Date.now(),
    ...fields,
  };
}

export function newWish(fields) {
  return {
    id: uid(),
    kind: 'wish',
    artist: '',
    artistImage: '',
    color: randomTicketColor(),
    serial: Math.floor(1000 + Math.random() * 9000),
    createdAt: Date.now(),
    ...fields,
  };
}

// ---------- media (photos / videos) ----------
const urlCache = new Map();

export async function addMedia(files) {
  const records = files.map((f) => ({ id: uid(), blob: f, type: f.type || '', name: f.name || '', createdAt: Date.now() }));
  await db.putMany('media', records);
  records.forEach((r) => urlCache.set(r.id, URL.createObjectURL(r.blob)));
  requestPersistence();
  return records.map((r) => r.id);
}

/**
 * iPhone app only: save links to camera-roll items (from PhotoLink.pick) instead of copies.
 * Only a small preview image is stored; the video/photo itself stays in Photos.
 */
export async function addLinked(items) {
  const records = items.map((it) => ({
    id: `${LINK_PREFIX}${uid()}:${it.id}`,
    // No preview could be made (e.g. iCloud was slow): use a simple stand-in picture.
    blob: it.thumb ? base64ToBlob(it.thumb) : placeholderPreview(it.type),
    type: 'image/jpeg',
    name: '',
    createdAt: Date.now(),
    link: { kind: it.type, localId: it.id, duration: it.duration, created: it.created },
  }));
  await db.putMany('media', records);
  records.forEach((r) => urlCache.set(r.id, URL.createObjectURL(r.blob)));
  return records.map((r) => r.id);
}

function placeholderPreview(type) {
  const icon = type === 'video'
    ? '<path d="M84 70v60l52-30z" fill="#fff" opacity=".85"/>'
    : '<rect x="62" y="70" width="76" height="60" rx="8" fill="none" stroke="#fff" stroke-width="7" opacity=".85"/>';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><rect width="200" height="200" fill="#2a2a30"/>${icon}</svg>`;
  return new Blob([svg], { type: 'image/svg+xml' });
}

export async function mediaURL(id) {
  if (urlCache.has(id)) return urlCache.get(id);
  const rec = await db.get('media', id);
  if (!rec) return '';
  const url = URL.createObjectURL(rec.blob);
  urlCache.set(id, url);
  return url;
}

export async function deleteMedia(ids) {
  await db.deleteMany('media', ids);
  ids.forEach(revokeMediaURL);
}

function revokeMediaURL(id) {
  const url = urlCache.get(id);
  if (url) { URL.revokeObjectURL(url); urlCache.delete(id); }
}

/** Ask the browser not to clear our storage when the phone is low on space. */
let persistAsked = false;
export function requestPersistence() {
  if (persistAsked || !navigator.storage?.persist) return;
  persistAsked = true;
  navigator.storage.persist().catch(() => {});
}

/** The image to show for an item: the user's own photo if they picked one, else the one found online. */
export async function itemImage(item) {
  if (item.ownImageId) return mediaURL(item.ownImageId);
  return item.artistImage || '';
}

// ---------- backup ----------
//
// Backup file layout (version 2), designed so big videos never have to be turned into
// one giant string in memory (which crashes iPhones):
//   "STUBSBAK1\n" + 12-digit header length + header JSON + every photo/video, back to back.
// Older JSON backups (version 1, media as base64) can still be restored.

const MAGIC = 'STUBSBAK1\n';

export async function exportBackup({ includeMedia }) {
  const media = includeMedia ? await db.getAll('media') : [];
  const header = {
    app: 'stubs',
    version: 2,
    exportedAt: new Date().toISOString(),
    items: state.items,
    settings: state.settings,
    media: media.map((m) => ({ id: m.id, type: m.type, name: m.name, createdAt: m.createdAt, size: m.blob.size })),
  };
  const headerBytes = new TextEncoder().encode(JSON.stringify(header));
  return new Blob([MAGIC, String(headerBytes.length).padStart(12, '0'), headerBytes, ...media.map((m) => m.blob)],
    { type: 'application/octet-stream' });
}

/**
 * Adds everything from a backup to this app (nothing already here is deleted).
 * onProgress(done, total) is called while photos/videos are copied in.
 */
export async function importBackup(file, onProgress) {
  const wasEmpty = state.items.length === 0;
  const start = await file.slice(0, MAGIC.length).text();
  let items;
  let settings = null;
  let mediaCount = 0;

  if (start === MAGIC) {
    const len = parseInt(await file.slice(MAGIC.length, MAGIC.length + 12).text(), 10);
    const headerStart = MAGIC.length + 12;
    const header = JSON.parse(await file.slice(headerStart, headerStart + len).text());
    if (header.app !== 'stubs' || !Array.isArray(header.items)) throw new Error('This file is not a Setlistic backup.');
    items = header.items;
    settings = header.settings || null;
    let offset = headerStart + len;
    for (const [i, m] of header.media.entries()) {
      const blob = file.slice(offset, offset + m.size, m.type);
      offset += m.size;
      // One at a time keeps memory low with lots of videos.
      await db.put('media', { id: m.id, type: m.type, name: m.name, createdAt: m.createdAt, blob });
      mediaCount++;
      onProgress?.(i + 1, header.media.length);
    }
  } else {
    // Version 1: a plain JSON file.
    const data = JSON.parse(await file.text());
    if (data.app !== 'stubs' || !Array.isArray(data.items)) throw new Error('This file is not a Setlistic backup.');
    items = data.items;
    for (const [i, m] of (data.media || []).entries()) {
      const blob = await (await fetch(m.data)).blob();
      await db.put('media', { id: m.id, type: m.type, name: m.name, createdAt: m.createdAt, blob });
      mediaCount++;
      onProgress?.(i + 1, data.media.length);
    }
  }

  await db.putMany('items', items);
  // Moving into a fresh app (e.g. the Home Screen version): bring your settings too.
  if (wasEmpty && settings) {
    state.settings = { ...state.settings, ...settings };
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(state.settings)); } catch { /* private mode */ }
  }
  await loadAll();
  emit({ type: 'reload' });
  if (wasEmpty && settings) emit({ type: 'settings', key: 'theme' });
  return {
    concerts: items.filter((i) => i.kind === 'concert').length,
    wishes: items.filter((i) => i.kind === 'wish').length,
    media: mediaCount,
  };
}

export async function deleteEverything() {
  await db.clear('items');
  await db.clear('media');
  urlCache.forEach((url) => URL.revokeObjectURL(url));
  urlCache.clear();
  state.items = [];
  emit({ type: 'reload' });
}
