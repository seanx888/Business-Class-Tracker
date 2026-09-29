// Service worker: offline app shell + network-first fare data.
const VERSION = 'aethersky-v6';
const SHELL = [
  './',
  'index.html',
  'styles.css',
  'app.js',
  'i18n.js',
  'icons.js',
  'core/airlines.js',
  'core/airports.js',
  'core/exclusion.js',
  'core/scoring.js',
  'core/links.js',
  'core/trackers.js',
  'core/programs.js',
  'manifest.webmanifest',
  'icons/icon.svg',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/apple-touch-icon.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const remoteData = url.hostname === 'raw.githubusercontent.com' && url.pathname.includes('/web/data/');
  if (url.origin !== self.location.origin && !remoteData) return; // airline logos etc. go straight to network
  if (url.pathname.includes('/api/')) return; // tracker sync must never be served from cache

  if (remoteData || url.pathname.includes('/data/')) {
    // Network-first so the daily scan shows up immediately; cache (keyed without query) for offline.
    const key = url.origin + url.pathname;
    e.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(VERSION).then((c) => c.put(key, copy));
          }
          return res;
        })
        .catch(() => caches.match(key).then((r) => r || new Response('offline', { status: 503 }))),
    );
    return;
  }

  // App shell: stale-while-revalidate.
  e.respondWith(
    caches.open(VERSION).then((cache) =>
      cache.match(req).then((cached) => {
        const net = fetch(req)
          .then((res) => {
            if (res.ok) cache.put(req, res.clone());
            return res;
          })
          .catch(() => cached);
        return cached || net;
      }),
    ),
  );
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const c of list) if ('focus' in c) return c.focus();
      return self.clients.openWindow('./');
    }),
  );
});
