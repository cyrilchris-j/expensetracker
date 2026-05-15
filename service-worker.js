const CACHE_NAME = 'expense-tracker-v1';
const ASSETS = [
  '/',
  'index.html',
  'dashboard.html',
  'transactions.html',
  'analytics.html',
  'auth.html',
  'profile.html',
  'style.css',
  'app.js',
  'firebase-config.js',
  'app_icon.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      );
    })
  );
});

self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then((response) => {
      return response || fetch(event.request);
    })
  );
});
