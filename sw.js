const CACHE_NAME = "scorekeeper-v22";
const ASSETS = [
  "./",
  "./index.html",
  "./css/style.css",
  "./js/config.js",
  "./js/storage.js",
  "./js/engine.js",
  "./js/controllers.js",
  "./js/app.js",
  "./manifest.json",
  "./icons/icon-192.png",
  "./icons/icon-512.png"
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (e) => {
  e.respondWith(
    caches.match(e.request, { ignoreSearch: true }).then((cached) => cached || fetch(e.request).catch(() => cached))
  );
});
