// Offline support: keeps the app itself saved on the phone so it opens without signal
// (e.g. inside a venue). Bump VERSION whenever app files change so phones pick up the new version.
const VERSION = 'stubs-v3';
// Artist photos and map tiles you've already seen, so they still show with no signal.
// Kept across app updates.
const MEDIA_CACHE = 'stubs-media';
const MEDIA_LIMIT = 2500;
const APP_FILES = [
  './',
  'index.html',
  'manifest.webmanifest',
  'css/app.css',
  'vendor/leaflet/leaflet.css',
  'vendor/leaflet/leaflet.js',
  'vendor/world/topojson-client.min.js',
  'vendor/world/countries-50m.json',
  'js/world.js',
  'js/main.js', 'js/nav.js', 'js/db.js', 'js/store.js', 'js/ui.js', 'js/lookup.js', 'js/ticket.js', 'js/sortable.js',
  'js/views/map.js', 'js/views/tickets.js', 'js/views/wishlist.js', 'js/views/settings.js', 'js/views/detail.js',
  'js/views/concertForm.js', 'js/views/videoTagger.js', 'js/views/videoViewer.js', 'js/views/photoViewer.js',
  'icons/icon-192.png', 'icons/apple-touch-icon.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(APP_FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION && k !== MEDIA_CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);

  // Images from other sites (artist photos, map tiles): use the saved copy if there is one.
  if (url.origin !== self.location.origin) {
    if (e.request.destination === 'image') e.respondWith(cachedImage(e));
    return;
  }

  // The app's own files: network first so updates show up straight away; saved copy when offline.
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(VERSION).then((c) => c.put(e.request, copy));
        }
        return res;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true }).then((r) => r || caches.match('index.html'))),
  );
});

async function cachedImage(e) {
  const cache = await caches.open(MEDIA_CACHE);
  const hit = await cache.match(e.request);
  if (hit) return hit;
  const res = await fetch(e.request);
  // Cross-site images come back "opaque" (status 0); they still display fine from the cache.
  if (res.ok || res.type === 'opaque') {
    e.waitUntil(cache.put(e.request, res.clone()).then(() => trim(cache)));
  }
  return res;
}

let trimming = false;
async function trim(cache) {
  if (trimming) return;
  trimming = true;
  try {
    const keys = await cache.keys();
    // Oldest entries first: drop map tiles / photos beyond the limit.
    for (const k of keys.slice(0, Math.max(0, keys.length - MEDIA_LIMIT))) await cache.delete(k);
  } finally {
    trimming = false;
  }
}
