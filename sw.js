const CACHE_NAME = 'alzaeem-pwa-v1.5.1';

const CORE_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './css/app.css',
  './css/components.css',
  './js/app.js',
  './js/storage.js',
  './js/image-engine.js',
  './js/assets.js',
  './js/backup.js',
  './libraries/jszip.min.js',
  './libraries/xlsx.full.min.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      Promise.allSettled(
        CORE_ASSETS.map((asset) => cache.add(asset).catch(() => null))
      )
    )
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname.endsWith('/version.json')) {
    event.respondWith(fetch(event.request, { cache: 'no-store' }));
    return;
  }

  if (event.request.mode === 'navigate') {
    event.respondWith(
      caches.match('./index.html', { ignoreSearch: true }).then((cachedPage) => {
        return cachedPage || fetch(event.request);
      })
    );
    return;
  }

  event.respondWith(
    caches.match(event.request, { ignoreSearch: true }).then((cachedRes) => {
      if (cachedRes) return cachedRes;

      return fetch(event.request).then((netRes) => {
        if (netRes && netRes.ok) {
          const copy = netRes.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        }
        return netRes;
      });
    })
  );
});