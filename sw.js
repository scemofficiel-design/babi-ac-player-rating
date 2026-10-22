/*
 * BABI A.C Player Rating — service worker (mode hors ligne).
 *
 * Met en cache UNIQUEMENT les fichiers statiques de l'application listés ci-dessous.
 * Aucune donnée d'évaluation ne transite ici : l'application ne fait aucune requête réseau.
 * Changez CACHE_VERSION à chaque mise en ligne d'une nouvelle version.
 */
'use strict';

var CACHE_VERSION = 'babi-rating-v1.0.0';
var APP_FILES = [
  './',
  './index.html',
  './css/styles.css',
  './js/scoring.js',
  './js/content.js',
  './js/app.js',
  './manifest.webmanifest',
  './icons/emblem.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png'
];

// URLs absolues résolues depuis l'emplacement du service worker : fonctionne dans un sous-chemin GitHub Pages.
var APP_URLS = APP_FILES.map(function (f) { return new URL(f, self.location.href).href; });

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE_VERSION).then(function (cache) {
      return cache.addAll(APP_URLS.map(function (u) { return new Request(u, { cache: 'reload' }); }));
    })
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (k) {
        return k.indexOf('babi-rating-') === 0 && k !== CACHE_VERSION;
      }).map(function (k) { return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('message', function (event) {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', function (event) {
  var req = event.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Navigation (ouverture de l'app, y compris avec ?query ou #ancre) : page d'accueil en cache.
  if (req.mode === 'navigate') {
    var indexUrl = new URL('./index.html', self.location.href).href;
    event.respondWith(
      caches.match(indexUrl).then(function (cached) {
        return cached || fetch(req);
      }).catch(function () { return caches.match(indexUrl); })
    );
    return;
  }

  // Fichiers de l'application : cache d'abord. Tout le reste passe directement au réseau, sans mise en cache.
  var clean = url.origin + url.pathname;
  if (APP_URLS.indexOf(clean) < 0) return;
  event.respondWith(
    caches.match(clean).then(function (cached) { return cached || fetch(req); })
  );
});
