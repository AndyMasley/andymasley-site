// Second Summer: keep the game for when there is no signal. Cache first, then the network.
const CACHE = 'second-summer-e69c7ef371';
const FILES = ["./", "index.html", "three.min.js", "manifest.webmanifest", "fonts/jost.woff2", "fonts/fraunces.woff2", "fonts/fraunces-italic.woff2", "icons/icon-180.png", "icons/icon-192.png", "icons/icon-512.png"];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', (e) => { if (e.request.method !== 'GET') return; e.respondWith(caches.match(e.request).then((r) => r || fetch(e.request))); });
