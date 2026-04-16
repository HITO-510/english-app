const CACHE_NAME = 'hito-english-v3';
const ASSETS = [
  './',
  './index.html',
  './css/style.css',
  './js/articles.js',
  './js/flashcards.js',
  './js/github.js',
  './js/app.js',
  './manifest.json',
];

// Install
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

// Activate: clean old caches
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Fetch: network-first for API, cache-first for app shell
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);

  // Always go to network for GitHub API
  if (url.hostname === 'api.github.com') return;

  e.respondWith(
    caches.match(e.request).then((cached) => {
      if (cached) return cached;
      return fetch(e.request).then((res) => {
        if (res.ok && e.request.method === 'GET') {
          const clone = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(e.request, clone));
        }
        return res;
      });
    })
  );
});
