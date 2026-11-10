/*
 * Service worker de Apli-Gym: permite abrir la app sin internet.
 * Estrategia "stale-while-revalidate": responde al instante desde la caché y
 * actualiza la copia en segundo plano; la versión nueva se ve al volver a abrir.
 * Al cambiar archivos de la app, sube CACHE_VERSION para limpiar cachés viejas.
 */
var CACHE_VERSION = 'apli-gym-v1';
var APP_SHELL = [
  './',
  './index.html',
  './styles.css',
  './manifest.webmanifest',
  './js/storage.js',
  './js/chart.js',
  './js/app.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png',
  './icons/favicon-32.png'
];

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE_VERSION)
      .then(function (cache) { return cache.addAll(APP_SHELL); })
      .then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (k) { return k !== CACHE_VERSION; })
        .map(function (k) { return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (event) {
  var req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;

  event.respondWith(
    caches.open(CACHE_VERSION).then(function (cache) {
      // Las navegaciones (abrir la app) siempre usan la página principal cacheada.
      var key = req.mode === 'navigate' ? './index.html' : req;
      return cache.match(key, { ignoreSearch: req.mode === 'navigate' }).then(function (cached) {
        var network = fetch(req).then(function (res) {
          if (res && res.ok) cache.put(key, res.clone());
          return res;
        }).catch(function () { return cached; });
        return cached || network;
      });
    })
  );
});
