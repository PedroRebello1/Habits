// sw.js — offline shell. Everything is same-origin and versioned; there is no
// runtime network traffic to speak of because the app never makes requests.
//
// Strategy: cache-first for the precached shell (it is the whole app), with a
// network fallback that repopulates the cache for anything missed. Navigations
// fall back to the cached index.html so a deep link works offline.

const VERSION = 'habitgrid-v5';
const SHELL = [
  './',
  './index.html',
  './styles.css',
  './manifest.webmanifest',
  './js/theme.js',
  './js/theme-boot.js',
  './js/main.js',
  './js/state.js',
  './js/storage.js',
  './js/dates.js',
  './js/i18n.js',
  './js/grid.js',
  './js/stats.js',
  './js/views.js',
  './js/io.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/maskable-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(VERSION)
      .then(cache => cache.addAll(SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', (event) => {
  if (event.data === 'skip-waiting') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  if (new URL(request.url).origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      caches.match('./index.html').then(hit => hit || fetch(request))
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((hit) => {
      if (hit) return hit;
      return fetch(request).then((response) => {
        if (response && response.ok && response.type === 'basic') {
          const copy = response.clone();
          caches.open(VERSION).then(cache => cache.put(request, copy));
        }
        return response;
      }).catch(() => caches.match('./index.html'));
    })
  );
});
