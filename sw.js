const CACHE_NAME = 'quack-label-v1';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './renderer.js',
  './manifest.json',
  './build/icon-192.png',
  './build/icon-512.png',
  'https://cdnjs.cloudflare.com/ajax/libs/localforage/1.10.0/localforage.min.js'
];

// Установка воркера и кэширование файлов
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
});

// Выдача файлов из кэша при отсутствии интернета
self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then((response) => {
      return response || fetch(event.request);
    })
  );
});