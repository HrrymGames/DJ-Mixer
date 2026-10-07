// Offline support: keeps the app itself cached so it opens without signal (e.g. inside a venue).
// Bump VERSION whenever app files change so phones pick up the new version.
const VERSION = 'stubs-v2';
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
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== self.location.origin) return;
  // Network first so updates show up straight away; fall back to the cache when offline.
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
